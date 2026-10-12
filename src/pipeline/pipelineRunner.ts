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

async function phaseDecompile(ctx: PhaseContext): Promise<string> {
  const BACKEND = 'http://127.0.0.1:8792';
  const originalApk = ctx.job.apkPath;
  const modifiedApk = (ctx.job as any).modifiedApkPath;
  if (!originalApk) return 'no original APK path';
  if (!modifiedApk) return 'no modified APK path set on job — nothing to diff';

  ctx.emit('decompile', 'start', 'planning dex extraction for both APKs');

  try {
    const [a, b] = await Promise.all([
      fetch(BACKEND + '/tool/apk_dex_list', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apk_path: originalApk }),
      }).then(r => r.json()),
      fetch(BACKEND + '/tool/apk_dex_list', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apk_path: modifiedApk }),
      }).then(r => r.json()),
    ]);
    if (!a.ok) return 'original dex list failed: ' + (a.error || 'unknown');
    if (!b.ok) return 'modified dex list failed: ' + (b.error || 'unknown');
    return (
      'original ' + a.dex_count + ' dex / ' +
      (a.total_uncompressed_bytes / 1e6).toFixed(1) + ' MB · ' +
      'modified ' + b.dex_count + ' dex / ' +
      (b.total_uncompressed_bytes / 1e6).toFixed(1) + ' MB'
    );
  } catch (e) {
    return 'decompile error: ' + (e as Error).message.slice(0, 180);
  }
}

async function phaseDiff(ctx: PhaseContext): Promise<string> {
  const BACKEND = 'http://127.0.0.1:8792';
  const originalApk = ctx.job.apkPath;
  const modifiedApk = (ctx.job as any).modifiedApkPath;
  if (!originalApk || !modifiedApk) return 'missing apk paths';

  ctx.emit('diff', 'start', 'comparing two APKs');

  try {
    const r = await fetch(BACKEND + '/tool/apk_diff_run', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ original_apk: originalApk, modified_apk: modifiedApk }),
    });
    const j: any = await r.json();
    if (!j.ok) return 'diff failed: ' + (j.error || 'unknown');

    const mods = (j.modifications || []) as any[];
    // wipe any prior rows for this job so ids never collide
    try { await (await (await import('@/db/client')).getDb()).runAsync('DELETE FROM modifications WHERE job_id = ?', [ctx.job.id]); } catch {}
    if (mods.length === 0) return 'no modifications found';

    // Write each modification into the modifications table.
    const db = await (await import('@/db/client')).getDb();
    const now = Date.now();
    let inserted = 0;
    for (const m of mods) {
      try {
        await db.runAsync(
          `INSERT OR REPLACE INTO modifications
           (id, job_id, type, kind, target, parent_dex, original, modified,
            original_hash, modified_hash, reverted, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,0,?)`,
          [
            ctx.job.id.slice(0, 8) + '_' + String(m.id || ('m_' + Math.random().toString(36).slice(2, 10))),
            ctx.job.id,
            String(m.type || 'MODIFIED').slice(0, 16),
            String(m.kind || 'unknown').slice(0, 32),
            String(m.target || '').slice(0, 400),
            m.parent_dex != null ? String(m.parent_dex).slice(0, 200) : null,
            m.original != null ? String(m.original).slice(0, 4000) : null,
            m.modified != null ? String(m.modified).slice(0, 4000) : null,
            m.original_hash ?? null,
            m.modified_hash ?? null,
            now,
          ],
        );
        inserted++;
      } catch (e) {
        console.warn('[diff] insert failed:', (e as Error).message.slice(0, 120));
      }
    }

    const byKind: Record<string, number> = {};
    for (const m of mods) {
      const k = String(m.kind || 'unknown');
      byKind[k] = (byKind[k] || 0) + 1;
    }
    const summary = Object.entries(byKind)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => v + ' ' + k)
      .join(', ');

    return inserted + ' modifications (' + summary + ') in ' + (j.wall_ms || 0) + 'ms';
  } catch (e) {
    return 'diff error: ' + (e as Error).message.slice(0, 180);
  }
}

async function phaseModBots(ctx: PhaseContext): Promise<string> {
  // Classification pass over the modifications diff already wrote to the DB.
  // For each MODIFIED dex we look up which classes changed. For each
  // ADDED / REMOVED class the classification is already known.
  // Nothing writes to disk here — this phase purely annotates.
  const BACKEND = 'http://127.0.0.1:8792';

  ctx.emit('modBots', 'start', 'classifying modifications');

  try {
    const mods = await pipelineStore.listModifications(ctx.job.id);
    if (mods.length === 0) return 'nothing to classify';

    const byKind: Record<string, number> = {};
    for (const m of mods) byKind[m.kind] = (byKind[m.kind] || 0) + 1;

    // For dex-level MODIFIED entries, ask the sidecar which classes are
    // shared vs unique so the UI can show "this dex contains N classes
    // that exist in both APKs". Not a per-method diff, but it narrows
    // where to look next. Uses apk_dex_list for the class inventory.
    const dexMods = mods.filter(m => m.kind === 'dex' && m.type === 'MODIFIED');
    let annotated = 0;
    for (const d of dexMods.slice(0, 3)) {
      try {
        const r = await fetch(BACKEND + '/tool/apk_batch_disassemble', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ apk_path: ctx.job.apkPath, dex: d.target, classes: [] }),
        }).then(r => r.json());
        if (r.ok) annotated++;
      } catch { /* ignore — annotation is best-effort */ }
    }

    const summary = Object.entries(byKind)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => v + ' ' + k)
      .join(', ');

    return mods.length + ' classified (' + summary + ')' +
      (annotated ? ' · ' + annotated + ' dex annotated' : '');
  } catch (e) {
    return 'modBots error: ' + (e as Error).message.slice(0, 180);
  }
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
  // Feature-hunt scan + fingerprint on the target APK. Same job, same
  // findings table — one FINDINGS list per pipeline run.
  const BACKEND = 'http://127.0.0.1:8792';
  ctx.emit('features', 'start', 'scanning dex + native libs (~1 min)');
  try {
    const r = await fetch(BACKEND + '/tool/apk_feature_full', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apk_path: ctx.job.apkPath }),
    });
    const j: any = await r.json();
    if (!j.ok) return 'feature scan failed: ' + (j.error || 'unknown');
    const { featureReportToRows } = await import('./findingAdapters');
    const rows = featureReportToRows(j);
    const n = await pipelineStore.createFindings(ctx.job.id, rows);
    const mod  = (j.mod_artifacts       || []).length;
    const anti = (j.anti_tamper_surface || []).length;
    const fw   = (j.framework_markers   || []).length;
    return n + ' findings (' + mod + ' mod / ' + anti + ' anti-tamper / ' +
      fw + ' framework) in ' + (j.wall_ms || 0) + 'ms';
  } catch (e) {
    return 'features error: ' + (e as Error).message.slice(0, 180);
  }
}

async function phaseNested(ctx: PhaseContext): Promise<string> {
  // Nested APK forensic — many Android distributions wrap the real
  // game inside the outer APK as assets/base.apk. Comparing class
  // inventories tells us what the wrapper added. Findings write into
  // this same job so they show up alongside bots + features.
  const BACKEND = 'http://127.0.0.1:8792';
  ctx.emit('nested', 'start', 'outer vs inner class delta');
  try {
    const r = await fetch(BACKEND + '/tool/apk_nested_diff', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apk_path: ctx.job.apkPath, full_class_diff: true }),
    });
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

async function phaseReviewGate(ctx: PhaseContext): Promise<string> {
  // The review gate is the aggregation point for the whole pre-gate
  // chain. Every phase before this one — diff, modBots, bots, features,
  // nested — writes its work into the same job. This function collects
  // ALL of it (modifications + findings from every source), produces
  // one summary, and pauses with the complete picture attached. The
  // user reviews against the whole story, not just the mod list.
  const current = await pipelineStore.getReviewState(ctx.job.id);
  if (current === 'decided') {
    return 'review already decided';
  }

  const mods = await pipelineStore.listModifications(ctx.job.id);
  const findings = await pipelineStore.listFindings(ctx.job.id);
  const reverted = mods.filter(m => m.reverted).length;

  // ── Source split for findings ─────────────────────────────────
  const bySource = { bot: 0, feature: 0, nested: 0, other: 0 };
  for (const f of findings) {
    const src = f.evidenceSource || '';
    if (src.startsWith('feature_hunt'))      bySource.feature++;
    else if (src.startsWith('nested'))       bySource.nested++;
    else if (src.startsWith('bot') || src.toLowerCase().includes('bot'))
                                             bySource.bot++;
    else                                     bySource.other++;
  }

  // ── Severity split ────────────────────────────────────────────
  const bySeverity: Record<string, number> = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  }

  // ── Correlations: mods that also appear in a finding ─────────
  // If the diff flagged a class and a feature hit or bot hit also
  // mentions that class (evidenceClass substring match), we surface
  // the connection so the user reviews it as one signal, not two.
  const correlations: Array<{ mod: string; findings: string[] }> = [];
  for (const m of mods) {
    const hits: string[] = [];
    for (const f of findings) {
      const ev = (f.evidenceClass || '') + ' ' + (f.evidenceMethod || '');
      if (ev.length > 0 && m.target && ev.includes(m.target.split('.').pop() || '')) {
        hits.push(f.title);
        if (hits.length >= 5) break;
      }
    }
    if (hits.length > 0) {
      correlations.push({ mod: m.target, findings: hits });
      if (correlations.length >= 30) break;
    }
  }

  const summary = {
    modifications: mods.length,
    reverted,
    findings_total: findings.length,
    findings_by_source: bySource,
    findings_by_severity: bySeverity,
    correlations,
  };

  // ── Persist into plan (merge, don't overwrite — phaseRevert also
  //     writes to plan later with clean_apk etc.) ────────────────
  const existingPlan = (await pipelineStore.getJobPlan(ctx.job.id)) || {};
  await pipelineStore.setJobJson(ctx.job.id, 'plan', {
    ...existingPlan,
    pre_gate_summary: summary,
  });

  if (current === 'pending' && reverted === 0) {
    // First time through: pause. The sentinel '__REVIEW_GATE_PAUSE__'
    // halts run().
    await pipelineStore.setReviewState(ctx.job.id, 'awaiting_user');
    const pauseMsg =
      mods.length + ' mods · ' + findings.length + ' findings (' +
      bySource.bot + ' bot / ' + bySource.feature + ' feat / ' +
      bySource.nested + ' nest)' +
      (correlations.length ? ' · ' + correlations.length + ' correlated' : '');
    ctx.emit('review_gate', 'pause', pauseMsg);
    return '__REVIEW_GATE_PAUSE__';
  }

  return (
    'review complete — ' + reverted + ' mod(s) marked · ' +
    findings.length + ' findings aggregated'
  );
}

async function phaseRevert(ctx: PhaseContext): Promise<string> {
  const BACKEND = 'http://127.0.0.1:8792';
  const originalApk = ctx.job.apkPath;
  const modifiedApk = (ctx.job as any).modifiedApkPath;
  if (!originalApk || !modifiedApk) return 'missing apk paths';

  const reverted = await pipelineStore.listRevertedModifications(ctx.job.id);
  if (reverted.length === 0) {
    ctx.emit('revert', 'skipped', 'no items marked for revert');
    return '0 items marked for revert — nothing to rebuild';
  }

  ctx.emit('revert', 'start', reverted.length + ' item(s) to revert');

  const safeName = (ctx.job.apkName || ctx.job.id).replace(/[^A-Za-z0-9._-]/g, '_');
  const outputPath = '/storage/emulated/0/Download/modkit-enhanced/' +
    safeName + '-clean-' + Date.now() + '.apk';

  try {
    const r = await fetch(BACKEND + '/tool/apk_revert_run', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        original_apk: originalApk,
        modified_apk: modifiedApk,
        revert: reverted.map(m => ({
          type: m.type, kind: m.kind, target: m.target,
          parent_dex: m.parentDex,
          original_hash: m.originalHash, modified_hash: m.modifiedHash,
        })),
        output_path: outputPath,
      }),
    });
    const j: any = await r.json();
    if (!j.ok) return 'revert failed: ' + (j.error || 'unknown');

    await pipelineStore.setJobJson(ctx.job.id, 'plan', {
      clean_apk: j.output,
      clean_size: j.final_size,
      reverted_dexes: j.reverted_dexes,
      reverted_count: j.reverted_count,
    });

    return reverted.length + ' reverted → ' + j.output;
  } catch (e) {
    return 'revert error: ' + (e as Error).message.slice(0, 180);
  }
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
  lines.push('- reference: `' + ((ctx.job as any).modifiedApkPath || '(none)') + '`');
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
        else if (phase === 'decompile')   summary = await phaseDecompile(ctx);
        else if (phase === 'diff')        summary = await phaseDiff(ctx);
        else if (phase === 'modBots')     summary = await phaseModBots(ctx);
        else if (phase === 'bots')        summary = await phaseBots(ctx);
        else if (phase === 'features')    summary = await phaseFeatures(ctx);
        else if (phase === 'nested')      summary = await phaseNested(ctx);
        else if (phase === 'review_gate') summary = await phaseReviewGate(ctx);
        else if (phase === 'revert')      summary = await phaseRevert(ctx);
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
