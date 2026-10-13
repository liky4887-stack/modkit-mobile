// Pipeline runner — the phase orchestrator.
// Single entry: pipelineRunner.run(jobId, opts). Resumable across calls.
// 09a implements: import, partition, dispatch.
// 09b will add: investigate, coordinate, propose, verify, export, audit.

import { pipelineStore, JobRecord, PHASES_ORDER, type PhaseId } from './pipelineStore';
import { eventBus } from '@/monitor/eventBus';
import { getDb } from '@/db/client';
import { guardFetch } from './resilience/guard';
// PhaseId is defined in pipelineStore — imported above.
// Re-exported for modules that historically imported it from here.
export type { PhaseId };

export interface RunOptions {
  stopAfter?: PhaseId;
  onStep?: (phase: PhaseId, step: any) => void;
  /** Force re-run of this phase and everything after it. Phases before
   *  it are honored from pipeline_phases as usual. */
  fromPhase?: PhaseId;
  onPhase?: (phase: PhaseId, state: string, summary?: string) => void;
}

export interface PhaseOutcome {
  phase: PhaseId;
  state: 'done' | 'failed';
  summary?: string;
  error?: string;
  elapsedMs: number;
}

export interface RunResult {
  jobId: string;
  startedAt: number;
  finishedAt: number;
  outcomes: PhaseOutcome[];
  stoppedAfter?: PhaseId;
  finalState: 'done' | 'failed' | 'awaiting_user';
}

// ── helpers ─────────────────────────────────────────────

// ── wake lock (Android Doze will suspend Termux mid-pipeline) ───
// Uses termux-wake-lock via the backend to keep the CPU alive during
// long agent runs. Released on completion.


async function syncJobToBackend(jobId: string): Promise<void> {
  try {
    const job = await pipelineStore.getJob(jobId);
    if (!job) return;

    const [phases] = await Promise.all([
      pipelineStore.getPhases(jobId).catch(() => []),
      ]);

    let artifacts: any[] = [];
    try {
      const { getDb } = await import('@/db/client');
      const db = await getDb();
      artifacts = await db.getAllAsync<any>(
        `SELECT id, phase, title, file_path, size_bytes, sha256, created_at
           FROM finding_artifacts WHERE job_id = ? ORDER BY created_at DESC LIMIT 200`,
        [jobId]
      );
    } catch {}

    let chats: any[] = [];
    try {
      const { getDb } = await import('@/db/client');
      const db = await getDb();
      chats = await db.getAllAsync<any>(
        `SELECT id, phase, unit_id, state, turns, tokens_in, tokens_out,
                elapsed_ms, started_at, finished_at
           FROM pipeline_chats WHERE job_id = ?
           ORDER BY started_at DESC LIMIT 200`,
        [jobId]
      );
    } catch {}

    const payload = {
      job_id: job.id,
      state: job.state,
      apk_name: job.apkName,
      apk_path: job.apkPath,
      current_phase: job.currentPhase,
      ds_calls: job.dsCalls,
      ds_elapsed_ms: job.dsElapsedMs,
      started_at: job.startedAt,
      updated_at: Date.now(),
      finished_at: job.finishedAt,
      phases,
      units: [],
      investigations: [],
      artifacts,
      chats,
    };

    await guardFetch('http://127.0.0.1:8792/orchestration/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // never fail the pipeline on a sync issue
  }
}

async function acquireWakeLock(reason: string): Promise<boolean> {
  try {
    const r = await guardFetch('http://127.0.0.1:8792/tool/wake_lock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'lock' }),
    }).then(x => x.json());
    return r.ok === true;
  } catch {
    return false;
  }
}

async function releaseWakeLock(): Promise<void> {
  try {
    await guardFetch('http://127.0.0.1:8792/tool/wake_lock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'unlock' }),
    });
  } catch {}
}

async function sha256Hex(text: string): Promise<string> {
  try {
    const { digestStringAsync, CryptoDigestAlgorithm } = await import('expo-crypto');
    return await digestStringAsync(CryptoDigestAlgorithm.SHA256, text);
  } catch {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    }
    return 'fallback-' + (h >>> 0).toString(16);
  }
}

function slugify(s: string): string {
  return (s || 'artifact')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'artifact';
}

function extractJsonArray<T>(text: string): T[] | null {
  if (!text) return null;

  const tryParse = (raw: string): T[] | null => {
    const t = raw.trim();
    if (!t) return null;
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed as T[];
      if (typeof parsed === 'object' && parsed !== null) {
        // Look for the first array-valued key (remediations, proposals, units, items, plan)
        for (const key of ['remediations', 'proposals', 'units', 'items', 'plan', 'results']) {
          const v = (parsed as any)[key];
          if (Array.isArray(v)) return v as T[];
        }
        // Single object — wrap it
        return [parsed as T];
      }
      return null;
    } catch {
      return null;
    }
  };

  // 1. Try every fenced block: ```json, ```, ~~~json, ~~~
  const fenceRegexes = [
    /```(?:json|JSON)?\s*([\s\S]*?)```/g,
    /~~~(?:json|JSON)?\s*([\s\S]*?)~~~/g,
  ];
  for (const re of fenceRegexes) {
    for (const m of text.matchAll(re)) {
      const r = tryParse(m[1]);
      if (r && r.length > 0) return r;
    }
  }

  // 2. Try to find any balanced top-level array in the text
  const arrStart = text.indexOf('[');
  if (arrStart >= 0) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = arrStart; i < text.length; i++) {
      const c = text[i];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(arrStart, i + 1);
          const r = tryParse(candidate);
          if (r && r.length > 0) return r;
          break;
        }
      }
    }
  }

  // 3. Try to find any balanced top-level object
  const objStart = text.indexOf('{');
  if (objStart >= 0) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = objStart; i < text.length; i++) {
      const c = text[i];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(objStart, i + 1);
          const r = tryParse(candidate);
          if (r && r.length > 0) return r;
          break;
        }
      }
    }
  }

  return null;
}


// ── phase contexts ──────────────────────────────────────

interface PhaseContext {
  onStep?: (phase: PhaseId, step: any) => void;
  job: JobRecord;
  emit: (phase: PhaseId, state: string, summary?: string) => void;
}

// ── phase: import ───────────────────────────────────────

// ── Resilient fetch: retry through sidecar death ───────────────────
// Xiaomi HyperOS phantom-killer can terminate the sidecar mid-run.
// The watchdog restarts it within ~20s. This wrapper waits for the
// sidecar to come back instead of failing the phase immediately.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { maxAttempts?: number; healthWaitMs?: number; label?: string } = {},
): Promise<Response> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const healthWaitMs = opts.healthWaitMs ?? 60_000;
  const label = opts.label ?? url;

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const r = await fetch(url, init);
      return r;
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message ?? e);
      const isConnRefused = /network request failed|econnrefused|failed to fetch/i.test(msg);
      if (!isConnRefused || attempt >= maxAttempts) throw e;

      // Sidecar is down. Wait for the watchdog to bring it back.
      console.log(`[fetch] ${label} attempt ${attempt} failed (${msg.slice(0,80)}) — waiting for sidecar`);
      const t0 = Date.now();
      let restored = false;
      while (Date.now() - t0 < healthWaitMs) {
        await new Promise(res => setTimeout(res, 2000));
        try {
          const h = await fetch('http://127.0.0.1:8792/health', { method: 'GET' });
          if (h.ok) { restored = true; break; }
        } catch { /* still down, keep waiting */ }
      }
      if (!restored) {
        console.log(`[fetch] ${label} sidecar did not return within ${healthWaitMs}ms`);
        throw e;
      }
      console.log(`[fetch] ${label} sidecar restored — retrying`);
    }
  }
  throw lastErr ?? new Error('fetchWithRetry exhausted');
}

async function phaseImport(ctx: PhaseContext): Promise<string> {
  ctx.emit('import', 'start', 'verifying path');
  const path = ctx.job.apkPath;

  const probe = await guardFetch('http://127.0.0.1:8792/file/stat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  }).then(r => r.json());
  if (!probe.ok || !probe.exists) {
    throw new Error('file not readable: ' + path);
  }

  // If the file is a combined APK+OBB container (common for externally
  // distributed games), unpack it first. The inner APK becomes the
  // working path for every subsequent phase.
  let workingPath = path;
  let combinedMeta: any = null;
  try {
    const cp = await guardFetch('http://127.0.0.1:8792/tool/combined_probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    }).then(r => r.json());

    if (cp.ok && cp.combined) {
      ctx.emit('import', 'running', 'combined container detected — unpacking');
      const un = await guardFetch('http://127.0.0.1:8792/tool/combined_unpack', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path }),
      }).then(r => r.json());

      if (!un.ok) {
        throw new Error('combined unpack failed: ' + (un.error || 'unknown'));
      }

      workingPath = un.inner_apk_path;
      combinedMeta = {
        combined_container: path,
        inner_apk: un.inner_apk_path,
        inner_obb: un.inner_obb_path,
        inner_apk_size: un.inner_apk_size,
        inner_obb_size: un.inner_obb_size,
      };
      ctx.emit('import', 'running',
        'unpacked · apk ' + (un.inner_apk_size / 1e9).toFixed(2) + ' GB + obb ' +
        (un.inner_obb_size / 1e6).toFixed(1) + ' MB');
    }
  } catch (e) {
    console.warn('[import] combined probe skipped:', (e as Error).message.slice(0, 120));
  }

  ctx.emit('import', 'running', 'loading into sidecar');
  const load = await guardFetch('http://127.0.0.1:8792/load', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apk_path: workingPath }),
  }).then(r => r.json());
  if (!load.ok) throw new Error('sidecar load failed: ' + (load.error || 'unknown'));

  // If we unpacked a combined container, persist the inner paths so
  // downstream phases (diff, export) operate on the inner APK and know
  // where the OBB lives.
  if (combinedMeta) {
    const dbc = await getDb();
    await dbc.runAsync(
      `UPDATE pipeline_jobs SET apk_path = ?, updated_at = ? WHERE id = ?`,
      [workingPath, Date.now(), ctx.job.id],
    );
    (ctx.job as any).apkPath = workingPath;
    try {
      await pipelineStore.setJobJson(ctx.job.id, 'plan', combinedMeta);
    } catch (e) {
      console.warn('[import] combined meta persist failed:', (e as Error).message.slice(0, 120));
    }
  }

  // Persist real metadata
  const db = await getDb();
  await db.runAsync(
    `UPDATE pipeline_jobs SET apk_size = ? WHERE id = ?`,
    [load.apkSize || 0, ctx.job.id]
  );

  return 'pkg=' + load.package + ' v' + load.versionName +
         ' dex=' + load.dex_count + ' perms=' + load.permission_count +
         ' load=' + load.load_ms + 'ms';
}

async function phaseBots(ctx: PhaseContext): Promise<string> {
  // Run the deterministic detector roster against the target APK.
  // Findings write into *this* pipeline job so the FINDINGS tab shows
  // them alongside diff modifications and feature hits.
  const BACKEND = 'http://127.0.0.1:8792';
  ctx.emit('bots', 'start', 'running detector roster');
  try {
    const r = await fetch(BACKEND + '/tool/bots_run_manager', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apk_path: ctx.job.apkPath }),
    });
    const j: any = await r.json();
    if (!j.ok) return 'bots failed: ' + (j.error || 'unknown');
    const { botFindingsToRows } = await import('./findingAdapters');
    const rows = botFindingsToRows(j.findings || []);
    const n = await pipelineStore.createFindings(ctx.job.id, rows);
    const rejected = (j.shadow_rejections || []).length;
    const wall = j.total_ms || j._ms || 0;
    return n + ' findings in ' + wall + 'ms' +
      (rejected ? ' · ' + rejected + ' shadow-rejected' : '');
  } catch (e) {
    return 'bots error: ' + (e as Error).message.slice(0, 180);
  }
}

async function phaseFeatures(ctx: PhaseContext): Promise<string> {
  // Two independent feature engines run in PARALLEL:
  //   1. feature_bots_run   17-bot fleet
  //   2. apk_feature_full_v3   rules DB + Drebin
  //
  // Before this was sequential — 425s total on SHI. Parallel cuts
  // wall time to ~max(t1, t2) instead of t1 + t2, and fewer seconds
  // in-flight means fewer chances for the Xiaomi phantom killer to
  // strike mid-phase.
  const BACKEND = 'http://127.0.0.1:8792';
  const { featureReportToRows } = await import('./findingAdapters');
  const t0 = Date.now();

  const fleetP = fetchWithRetry(BACKEND + '/tool/feature_bots_run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apk_path: ctx.job.apkPath }),
  }, { label: 'features:fleet', maxAttempts: 3, healthWaitMs: 120_000 })
    .then(r => r.json())
    .catch(e => ({ ok: false, error: 'fleet: ' + (e as Error).message.slice(0, 120) }));

  const rulesP = fetchWithRetry(BACKEND + '/tool/apk_feature_full_v3', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apk_path: ctx.job.apkPath }),
  }, { label: 'features:rules', maxAttempts: 3, healthWaitMs: 120_000 })
    .then(r => r.json())
    .catch(e => ({ ok: false, error: 'rules: ' + (e as Error).message.slice(0, 120) }));

  ctx.emit('features', 'start', 'fleet + rules-DB in parallel');
  const [fleet, rules] = await Promise.all([fleetP, rulesP]);

  let inserted = 0, mod = 0, anti = 0, fw = 0;
  for (const [name, j] of [['fleet', fleet], ['rules', rules]] as const) {
    if (!j || !j.ok) {
      ctx.emit('features', 'running', name + ' error: ' +
        String((j && j.error) || 'unknown').slice(0, 80));
      continue;
    }
    try {
      const rows = featureReportToRows(j);
      inserted += await pipelineStore.createFindings(ctx.job.id, rows);
      mod  += (j.mod_artifacts       || []).length;
      anti += (j.anti_tamper_surface || []).length;
      fw   += (j.framework_markers   || []).length;
    } catch (e) {
      ctx.emit('features', 'running', name + ' adapt error: ' +
        (e as Error).message.slice(0, 80));
    }
  }

  return inserted + ' findings (' + mod + ' mod / ' + anti + ' anti-tamper / ' +
    fw + ' framework) in ' + (Date.now() - t0) + 'ms';
}

async function phaseNested(ctx: PhaseContext): Promise<string> {
  // Nested APK forensic — many Android distributions wrap the real
  // game inside the outer APK as assets/base.apk. Comparing class
  // inventories tells us what the wrapper added. Findings write into
  // this same job so they show up alongside bots + features.
  const BACKEND = 'http://127.0.0.1:8792';
  ctx.emit('nested', 'start', 'outer vs inner class delta');
  try {
    const r = await fetchWithRetry(BACKEND + '/tool/apk_nested_diff', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apk_path: ctx.job.apkPath, full_class_diff: true }),
    }, { label: 'nested' });
    const j: any = await r.json();
    if (!j.ok) return 'nested diff failed: ' + (j.error || 'unknown');
    if (!j.has_nested) return 'no nested APK entries';

    const { nestedDiffToRows } = await import('./findingAdapters');
    const rows = nestedDiffToRows(j);
    const n = await pipelineStore.createFindings(ctx.job.id, rows);

    // Summary: total outer-only / mod-shaped across all nested reports
    let outerOnly = 0;
    let modShaped = 0;
    for (const rep of (j.reports || [])) {
      const cd = rep.class_diff;
      if (!cd) continue;
      outerOnly += cd.outer_only_count || 0;
      modShaped += ((cd.classified || {}).mod_shaped || []).length;
    }
    return n + ' findings · ' + outerOnly + ' outer-only classes · ' +
      modShaped + ' mod-shaped in ' + (j.wall_ms || 0) + 'ms';
  } catch (e) {
    return 'nested error: ' + (e as Error).message.slice(0, 180);
  }
}

async function phaseStructural(ctx: PhaseContext): Promise<string> {
  // Native .so analysis + framework ID + OBB recon + outer/inner lib
  // diff — one call. Findings land with the same bucket shape the
  // review gate reads (mod_artifact / framework_marker).
  const BACKEND = 'http://127.0.0.1:8792';
  ctx.emit('structural', 'start', 'native libs + framework + OBB (~15s)');
  try {
    const r = await fetchWithRetry(BACKEND + '/tool/apk_structural', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apk_path: ctx.job.apkPath }),
    }, { label: 'structural', healthWaitMs: 90_000 });
    const j: any = await r.json();
    if (!j.ok) return 'structural failed: ' + (j.error || 'unknown');
    const { structuralReportToRows } = await import('./findingAdapters');
    const rows = structuralReportToRows(j);
    const n = await pipelineStore.createFindings(ctx.job.id, rows);
    const mod = (j.mod_artifacts       || []).length;
    const fw  = (j.framework_markers   || []).length;
    const oo  = (j.outer_only_libs     || []).length;
    return n + ' findings (' + mod + ' mod / ' + fw + ' framework · ' +
      oo + ' outer-only libs) in ' + (j.wall_ms || 0) + 'ms';
  } catch (e) {
    return 'structural error: ' + (e as Error).message.slice(0, 180);
  }
}

async function phaseAnticheat(ctx: PhaseContext): Promise<string> {
  // ACE roster + integrity check. Reports which anti-cheat libraries
  // the target ships and whether any of them were modified between
  // the outer APK and the inner base.apk.
  const BACKEND = 'http://127.0.0.1:8792';
  ctx.emit('anticheat', 'start', 'ACE roster + integrity (~10s)');
  try {
    const r = await fetchWithRetry(BACKEND + '/tool/apk_anticheat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apk_path: ctx.job.apkPath }),
    }, { label: 'anticheat' });
    const j: any = await r.json();
    if (!j.ok) return 'anticheat failed: ' + (j.error || 'unknown');
    const { anticheatReportToRows } = await import('./findingAdapters');
    const rows = anticheatReportToRows(j);
    const n = await pipelineStore.createFindings(ctx.job.id, rows);
    const mod  = (j.mod_artifacts       || []).length;
    const anti = (j.anti_tamper_surface || []).length;
    return n + ' findings (' + mod + ' mod / ' + anti + ' ace) in ' +
      (j.wall_ms || 0) + 'ms';
  } catch (e) {
    return 'anticheat error: ' + (e as Error).message.slice(0, 180);
  }
}

async function phaseReviewGate(ctx: PhaseContext): Promise<string> {
  // Review gate — the pause point where the user sees the analysis
  // result and decides whether to proceed. In single-APK mode this is
  // the whole picture: the mod signals from feature_hunt are the
  // answer; bot detections and framework markers are context.
  const current = await pipelineStore.getReviewState(ctx.job.id);
  if (current === 'decided') {
    return 'review already decided';
  }

  const mods = await pipelineStore.listModifications(ctx.job.id);
  const findings = await pipelineStore.listFindings(ctx.job.id);
  const reverted = mods.filter(m => m.reverted).length;

  // ── Bucket findings by what the user actually cares about ─────
  //   mod_signals       feature_hunt:mod_artifact:*  → ESP, aimbot, menu
  //   defense_signals   feature_hunt:anti_tamper:*   → game's own defenses
  //   framework_signals feature_hunt:framework_*     → stock SDKs
  //   nested_signals    nested_diff                  → wrapper analysis
  //   sdk_findings      everything else              → bot roster noise
  const mod_signals: any[] = [];
  const defense_signals: any[] = [];
  const framework_signals: any[] = [];
  const nested_signals: any[] = [];
  let sdk_findings_count = 0;

  for (const f of findings) {
    const src = f.evidenceSource || '';
    // feature_hunt (rules DB + fleet) sources
    if (src.startsWith('feature_hunt:mod_artifact'))      mod_signals.push(f);
    else if (src.startsWith('feature_hunt:anti_tamper'))  defense_signals.push(f);
    else if (src.startsWith('feature_hunt:framework'))    framework_signals.push(f);
    // structural (.so density / framework / OBB) sources
    else if (src.startsWith('structural:mod_artifact'))   mod_signals.push(f);
    else if (src.startsWith('structural:anti_tamper'))    defense_signals.push(f);
    else if (src.startsWith('structural:framework'))      framework_signals.push(f);
    // anticheat (ACE roster + integrity) sources
    else if (src.startsWith('anticheat:mod_artifact'))    mod_signals.push(f);
    else if (src.startsWith('anticheat:anti_tamper'))     defense_signals.push(f);
    else if (src.startsWith('anticheat:framework'))       framework_signals.push(f);
    // nested (outer vs inner) source
    else if (src.startsWith('nested'))                    nested_signals.push(f);
    // everything else is bot roster / SDK observation
    else                                                   sdk_findings_count++;
  }

  // Severity split for the full set (kept for back-compat + UI)
  const bySeverity: Record<string, number> = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  }

  const summary = {
    // Foreground — what the user asked for
    mod_signals: mod_signals.map(f => ({
      title: f.title,
      category: f.category,
      confidence: f.confidence,
      evidence_source: f.evidenceSource,
      evidence_method: f.evidenceMethod,
      risk: f.risk,
    })),
    defense_signals: defense_signals.map(f => ({
      title: f.title, category: f.category, confidence: f.confidence,
    })),
    framework_signals: framework_signals.map(f => ({
      title: f.title, category: f.category, confidence: f.confidence,
    })),
    nested_signals: nested_signals.map(f => ({
      title: f.title, risk: f.risk, confidence: f.confidence,
    })),
    // Background count so the user knows the bot roster ran
    sdk_findings_count,
    // Legacy fields (kept so nothing else breaks)
    modifications: mods.length,
    reverted,
    findings_total: findings.length,
    findings_by_severity: bySeverity,
    findings_by_source: {
      bot: sdk_findings_count,
      feature: mod_signals.length + defense_signals.length + framework_signals.length,
      nested: nested_signals.length,
      other: 0,
    },
    correlations: [] as Array<{ mod: string; findings: string[] }>,
  };

  const existingPlan = (await pipelineStore.getJobPlan(ctx.job.id)) || {};
  await pipelineStore.setJobJson(ctx.job.id, 'plan', {
    ...existingPlan,
    pre_gate_summary: summary,
  });

  if (current === 'pending' && reverted === 0) {
    await pipelineStore.setReviewState(ctx.job.id, 'awaiting_user');
    const pauseMsg = mod_signals.length > 0
      ? mod_signals.length + ' mod signal(s) detected · ' + mods.length + ' mods'
      : 'no mod signals · ' + mods.length + ' mods';
    ctx.emit('review_gate', 'pause', pauseMsg);
    return '__REVIEW_GATE_PAUSE__';
  }

  return 'review complete — ' + reverted + ' mod(s) marked';
}

async function phaseExport(ctx: PhaseContext): Promise<string> {
  ctx.emit('export', 'start', 'writing report');

  const phases = await pipelineStore.getPhases(ctx.job.id);
  const findings = await pipelineStore.listFindings(ctx.job.id).catch(() => []);
  const mods = await pipelineStore.listModifications(ctx.job.id);
  const revertedMods = mods.filter(m => m.reverted);
  const plan = await pipelineStore.getJobPlan(ctx.job.id);

  const outDir = '/storage/emulated/0/Download/modkit-reports';
  const safeName = (ctx.job.apkName || ctx.job.id).replace(/[^A-Za-z0-9._-]/g, '_');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = outDir + '/' + safeName + '-report-' + stamp + '.md';

  const lines: string[] = [];
  lines.push('# modkit report');
  lines.push('');
  lines.push('- target: `' + (ctx.job.apkPath || '') + '`');
  lines.push('- job id: `' + ctx.job.id + '`');
  lines.push('- generated: ' + new Date().toISOString());
  lines.push('');
  lines.push('## phases');
  lines.push('');
  for (const ph of phases) {
    lines.push('- **' + ph.phase + '** [' + ph.state + '] ' + (ph.summary || ''));
  }
  lines.push('');
  lines.push('## modifications (' + mods.length + ')');
  lines.push('');
  if (mods.length === 0) {
    lines.push('_no modifications found_');
  } else {
    for (const m of mods.slice(0, 500)) {
      const mark = m.reverted ? '[x]' : '[ ]';
      lines.push('- ' + mark + ' `' + m.type + '` ' + m.kind + ' — `' + m.target + '`');
    }
    if (mods.length > 500) lines.push('- ... ' + (mods.length - 500) + ' more');
  }
  lines.push('');
  lines.push('## reverted (' + revertedMods.length + ')');
  lines.push('');
  for (const m of revertedMods) {
    lines.push('- `' + m.type + '` ' + m.kind + ' — `' + m.target + '`');
  }
  lines.push('');
  lines.push('## findings (' + findings.length + ')');
  lines.push('');
  for (const f of findings.slice(0, 200)) {
    lines.push('- [' + f.severity + '] ' + f.title);
  }
  lines.push('');
  if (plan) {
    lines.push('## plan');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(plan, null, 2).slice(0, 4000));
    lines.push('```');
  }

  const body = lines.join('\n');
  const r = await fetch('http://127.0.0.1:8792/file/write', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, content: body }),
  }).then(x => x.json());
  if (!r.ok) throw new Error('report write failed: ' + (r.error || 'unknown'));

  const bytes = body.length;
  return 'report → ' + path + ' (' + bytes + ' bytes, ' +
         mods.length + ' mods / ' + revertedMods.length + ' reverted / ' +
         findings.length + ' findings)';
}

// ── audit ───────────────────────────────────────────────

async function writeSbom(_ctx: PhaseContext): Promise<string | null> {
  // SBOM generation depended on classdata/classCache which is no longer
  // part of the deterministic chain. Export phase proceeds without it.
  return null;
}

async function phaseAudit(ctx: PhaseContext): Promise<string> {
  const phases = await pipelineStore.getPhases(ctx.job.id);
  const mods = await pipelineStore.listModifications(ctx.job.id);
  const revertedMods = mods.filter(m => m.reverted);
  const donePhases = phases.filter(p => p.state === 'done').length;
  const failedPhases = phases.filter(p => p.state === 'failed').length;
  const summary = [
    'phases: ' + donePhases + ' done / ' + failedPhases + ' failed / ' + phases.length + ' total',
    'mods: ' + mods.length + ' total / ' + revertedMods.length + ' reverted',
  ].join(' · ');
  ctx.emit('audit', 'start', summary);
  return summary;
}

// ── orchestrator ────────────────────────────────────────

export const pipelineRunner = {
  async run(jobId: string, opts: RunOptions = {}): Promise<RunResult> {
    const startedAt = Date.now();
    const outcomes: PhaseOutcome[] = [];

    // Hold wake lock — prevents Android from suspending Termux mid-run
    await acquireWakeLock('pipeline:' + jobId);

    // Clear the sidecar's .so-cache before every run. Each run extracts
    // ~200 MB of native libs; without this, runs stack up until the
    // disk hits 99% and the sidecar dies mid-pipeline (structural needs
    // to extract the 1.38 GB inner APK).
    try {
      await fetch('http://127.0.0.1:8792/tool/cache_clear', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
    } catch { /* best effort — never fail the run on this */ }

    const job = await pipelineStore.getJob(jobId);
    if (!job) throw new Error('job not found: ' + jobId);

    const emit = (phase: PhaseId, state: string, summary?: string) => {
      eventBus.emit({
        scanId: jobId, correlationId: jobId, phase: phase as any,
        functionId: 'orchestration_logs',
        severity: state === 'failed' ? 'critical' : 'info',
        payload: { action: 'phase_' + state, phase, summary: summary ?? null },
      });
      try { opts.onPhase?.(phase, state, summary); } catch {}
    };

    const existing = await pipelineStore.getPhases(jobId);
    let doneSet = new Set(existing.filter(p => p.state === 'done').map(p => p.phase));

    // fromPhase: force re-run of that phase and everything after it
    if (opts.fromPhase) {
      const resetIdx = (PHASES_ORDER as readonly string[]).indexOf(opts.fromPhase);
      if (resetIdx >= 0) {
        const resetSet = new Set(PHASES_ORDER.slice(resetIdx) as readonly string[]);
        doneSet = new Set([...doneSet].filter(p => !resetSet.has(p)));
      }
    }

    const ctx: PhaseContext = { job, emit, onStep: opts.onStep };

    const phases = PHASES_ORDER.slice() as PhaseId[];
    const stopAfterIdx = opts.stopAfter ? phases.indexOf(opts.stopAfter) : phases.length - 1;

    await pipelineStore.setJobState(jobId, 'queued');

    for (let i = 0; i <= stopAfterIdx && i < phases.length; i++) {
      const phase = phases[i];

      if (doneSet.has(phase)) {
        outcomes.push({ phase, state: 'done', summary: '(already done)', elapsedMs: 0 });
        emit(phase, 'done', '(resumed)');
        continue;
      }

      const t0 = Date.now();
      await pipelineStore.setCurrent(jobId, phase);
      await pipelineStore.startPhase(jobId, phase);
      emit(phase, 'start');

      try {
        let summary: string;
        if (phase === 'import')           summary = await phaseImport(ctx);
        else if (phase === 'bots')        summary = await phaseBots(ctx);
        else if (phase === 'features')    summary = await phaseFeatures(ctx);
        else if (phase === 'nested')      summary = await phaseNested(ctx);
        else if (phase === 'structural')  summary = await phaseStructural(ctx);
        else if (phase === 'anticheat')   summary = await phaseAnticheat(ctx);
        else if (phase === 'review_gate') summary = await phaseReviewGate(ctx);
        else if (phase === 'export')      summary = await phaseExport(ctx);
        else if (phase === 'audit')       summary = await phaseAudit(ctx);
        else                              summary = 'unknown phase: ' + phase;

        const elapsedMs = Date.now() - t0;

        if (summary === '__REVIEW_GATE_PAUSE__') {
          await pipelineStore.finishPhase(jobId, phase, summary);
          outcomes.push({ phase, state: 'paused' as any, summary, elapsedMs });
          console.log(`[pipeline] ${phase} paused in ${(elapsedMs/1000).toFixed(1)}s — awaiting user`);
          emit(phase, 'paused', 'awaiting user decisions in MODS tab');
          await pipelineStore.setJobState(jobId, 'awaiting_user' as any);
          await releaseWakeLock();
          return {
            jobId,
            startedAt,
            finishedAt: Date.now(),
            outcomes,
            stoppedAfter: phase,
            finalState: 'awaiting_user' as any,
          };
        }
        await pipelineStore.finishPhase(jobId, phase, summary);
        outcomes.push({ phase, state: 'done', summary, elapsedMs });
        console.log(`[pipeline] ${phase} done in ${(elapsedMs/1000).toFixed(1)}s — ${summary ?? ''}`);
        emit(phase, 'done', `${summary} — ${(elapsedMs/1000).toFixed(1)}s`);
        void syncJobToBackend(jobId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const failMs = Date.now() - t0;
        await pipelineStore.failPhase(jobId, phase, msg);
        outcomes.push({ phase, state: 'failed', error: msg, elapsedMs: failMs });
        console.warn(`[pipeline] ${phase} FAILED in ${(failMs/1000).toFixed(1)}s — ${msg}`);
        emit(phase, 'failed', `${msg} — ${(failMs/1000).toFixed(1)}s`);
        void syncJobToBackend(jobId);

        await pipelineStore.setJobState(jobId, 'failed', msg);
        await releaseWakeLock();
        return {
          jobId,
          startedAt,
          finishedAt: Date.now(),
          outcomes,
          stoppedAfter: phase,
          finalState: 'failed',
        };
      }
    }

    await pipelineStore.setCurrent(jobId, null);
    await pipelineStore.setJobState(jobId, 'done');
    await syncJobToBackend(jobId);
    await releaseWakeLock();

    return {
      jobId,
      startedAt,
      finishedAt: Date.now(),
      outcomes,
      stoppedAfter: opts.stopAfter,
      finalState: 'done',
    };
  },
};
