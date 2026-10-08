import { telemetryBridge } from "./pipelineTelemetryBridge";
import { integrityHeartbeat } from "../orchestration/integrityHeartbeat";
import { autoMigration } from "../orchestration/autoMigration";
import { fakeUpdateHandshake } from "../orchestration/fakeUpdateHandshake";
import { versionContinuityGuard } from "../orchestration/versionContinuityGuard";
import { dynamicResourceAllocation } from "../orchestration/dynamicResourceAllocation";
import { antiAnalysisTripwire } from "../orchestration/antiAnalysisTripwire";
import { contextualChameleon } from "../orchestration/contextualChameleon";
import { temporalShifter } from "../orchestration/temporalShifter";
import { heuristicMimicry } from "../orchestration/heuristicMimicry";
import { entropyBalancer } from "../orchestration/entropyBalancer";
import { signatureScrubber } from "../orchestration/signatureScrubber";
import { crossSessionIntelligence } from "../orchestration/crossSessionIntelligence";
import { binaryDiffViewer } from "../orchestration/binaryDiffViewer";
// Pipeline runner — the phase orchestrator.
// Single entry: pipelineRunner.run(jobId, opts). Resumable across calls.
// 09a implements: import, partition, dispatch.
// 09b will add: investigate, coordinate, propose, verify, export, audit.

import { pipelineStore, JobRecord, PHASES_ORDER } from './pipelineStore';
import { investigateRunner } from './investigateRunner';
import { eventBus } from '@/orchestration/eventBus';
import { getDb } from '@/db/client';
import type { AgentStep } from '@/agent/agentLoop';
import { PHASE_QUERIES } from './phaseQueries';
import { truthLedger } from '@/orchestration/truthLedger';
import { progressTracker } from '@/orchestration/progressTracker';
import { collisionGuard } from '@/orchestration/collisionGuard';
import { dependencyMapper } from '@/orchestration/dependencyMapper';

export type PhaseId = typeof PHASES_ORDER[number];

export interface RunOptions {
  stopAfter?: PhaseId;
  /** Force re-run of this phase and everything after it. Phases before
   *  it are honored from pipeline_phases as usual. */
  fromPhase?: PhaseId;
  onPhase?: (phase: PhaseId, state: string, summary?: string) => void;
  onStep?: (phase: PhaseId, step: AgentStep) => void;
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
  finalState: 'done' | 'failed';
}

// ── helpers ─────────────────────────────────────────────

// ── wake lock (Android Doze will suspend Termux mid-pipeline) ───
// Uses termux-wake-lock via the backend to keep the CPU alive during
// long agent runs. Released on completion.

async function syncJobToBackend(jobId: string): Promise<void> {
  try {
    const job = await pipelineStore.getJob(jobId);
    if (!job) return;

    const [phases, units, investigations] = await Promise.all([
      pipelineStore.getPhases(jobId).catch(() => []),
      pipelineStore.listUnits(jobId).catch(() => []),
      pipelineStore.listInvestigations(jobId, 200).catch(() => []),
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
      units,
      investigations,
      artifacts,
      chats,
    };

    await fetch('http://127.0.0.1:8790/orchestration/sync', {
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
    const r = await fetch('http://127.0.0.1:8790/executeCommand', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'termux-wake-lock',
        args: [],
        timeoutMs: 5000,
      }),
    }).then(x => x.json());
    return r.ok === true;
  } catch {
    return false;
  }
}

async function releaseWakeLock(): Promise<void> {
  try {
    await fetch('http://127.0.0.1:8790/executeCommand', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'termux-wake-unlock',
        args: [],
        timeoutMs: 5000,
      }),
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
  job: JobRecord;
  emit: (phase: PhaseId, state: string, summary?: string) => void;
  onStep?: (phase: PhaseId, step: AgentStep) => void;
}

// ── phase: import ───────────────────────────────────────

async function phaseImport(ctx: PhaseContext): Promise<string> {
  ctx.emit('import', 'start', 'verifying path');
  const path = ctx.job.apkPath;

  const probe = await fetch('http://127.0.0.1:8790/executeCommand', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: 'ls', args: ['-la', path], timeoutMs: 5000 }),
  }).then(r => r.json());
  if (!probe.ok || probe.result.exitCode !== 0) {
    throw new Error('file not readable: ' + path);
  }

  ctx.emit('import', 'running', 'loading into sidecar');
  const load = await fetch('http://127.0.0.1:8790/tools/load', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apk_path: path }),
  }).then(r => r.json());
  if (!load.ok) throw new Error('sidecar load failed: ' + (load.error || 'unknown'));

  // Persist real metadata
  const db = await getDb();
  await db.runAsync(
    `UPDATE pipeline_jobs SET apk_size = ? WHERE id = ?`,
    [load.apkSize || 0, ctx.job.id]
  );

  // Build dependency graph from class_cache: within each top package,
  // link consecutive classes as shared_ref edges. Feeds the collision
  // guard later. Persists to dependency_map.
  let edgeCount = 0;
  try {
    const { classCache } = await import('@/classdata/classCache');
    const scanId = ctx.job.scanId || ctx.job.id;
    const topPkgs = await classCache.packageSummary(scanId, 30);
    for (const pkg of topPkgs) {
      const rows = await classCache.byPackagePrefix(scanId, pkg.top, 20);
      for (let i = 0; i < rows.length - 1; i++) {
        await dependencyMapper.recordEdge(scanId, {
          source: 'class:' + rows[i].fqcn,
          target: 'class:' + rows[i + 1].fqcn,
          type: 'shared_ref',
          constraints: ['package:' + pkg.top],
        });
        edgeCount++;
      }
    }
  } catch {}

  return 'pkg=' + load.package + ' v' + load.versionName +
         ' dex=' + load.dex_count + ' perms=' + load.permission_count +
         ' edges=' + edgeCount +
         ' load=' + load.load_ms + 'ms';
}

// ── phase: partition ────────────────────────────────────

async function phasePartition(ctx: PhaseContext): Promise<string> {
  ctx.emit('partition', 'start', 'agent proposes work units');

  const query = [
    'Task: propose work units for parallel analysis of this app.',
    '',
    'Step 1 (one call): call manifest(). This gives the app package and',
    'the full component list. That is your primary evidence.',
    '',
    'Step 2 (up to 3 calls): call find_classes_using_strings once with a',
    'list of common SDK markers to find which vendors are bundled. Example:',
    '  ["io.sentry", "com.google.firebase", "com.adjust.sdk",',
    '   "com.facebook", "com.tencent", "io.flutter"]',
    '',
    'Step 3: IMMEDIATELY return your final answer. Do not keep probing.',
    '',
    'The final answer must contain ONLY a JSON array (no prose around it):',
    '[{"name":"sandbox-app","kind":"app","seed_strings":["com.sandbox."],"why":"top-level app package"},',
    ' {"name":"sentry","kind":"sdk","seed_strings":["io.sentry."],"why":"crash analytics"}]',
    '',
    'Rules:',
    '  • Always include one unit with seed_strings=["<app-package>."] where <app-package> comes from manifest.',
    '  • One unit per SDK you actually found evidence for.',
    '  • 4–8 units total.',
    '  • JSON array only. No explanation text. No code fences.',
  ].join('\n');

  const investigation = await investigateRunner.run({
    jobId: ctx.job.id,
    phase: 'partition',
    query,
    maxIterations: 8,
    onStep: (step) => { try { ctx.onStep?.('partition', step); } catch {} },
  });

  const units = extractJsonArray<any>(investigation.finalAnswer);
  if (!units || units.length === 0) {
    await pipelineStore.replaceUnits(ctx.job.id, [{
      name: 'all-packages',
      kind: 'app',
      brief: 'Partition output unparseable — investigating whole app',
      classes: [],
      dexFiles: [],
    }]);
    return 'no units parsed, single fallback unit written';
  }

  const normalized = units.map((u, i) => ({
    name: String(u.name || ('unit-' + i)).slice(0, 48),
    kind: String(u.kind || 'unknown').slice(0, 24),
    brief: String(u.why || u.brief || '').slice(0, 400),
    classes: Array.isArray(u.classes) ? u.classes.map(String).slice(0, 500) : [],
    dexFiles: Array.isArray(u.dex_files) ? u.dex_files.map(String).slice(0, 200) : [],
  }));

  await pipelineStore.replaceUnits(ctx.job.id, normalized);
  return normalized.length + ' units from agent';
}

// ── phase: dispatch ─────────────────────────────────────

async function phaseDispatch(ctx: PhaseContext): Promise<string> {
  ctx.emit('dispatch', 'start', 'assign units to worker slots');

  const units = await pipelineStore.listUnits(ctx.job.id);
  if (units.length === 0) {
    throw new Error('no units to dispatch — partition produced nothing');
  }

  const db = await getDb();
  for (const u of units) {
    const priority =
      u.kind === 'sdk' ? 100 :
      u.kind === 'component' ? 80 :
      u.kind === 'app' ? 60 :
      u.kind === 'native' ? 50 : 40;

    await db.runAsync(
      `UPDATE pipeline_units SET state = 'queued' WHERE id = ?`,
      [u.id]
    );

    // Register with progressTracker so completion is weighted by priority
    try {
      await progressTracker.upsertSegment({
        segmentId: u.id,
        scanId: ctx.job.id,
        phase: 'investigate' as any,
        workerId: null as any,
        tokenBudget: priority,
      });
    } catch {}
    await db.runAsync(
      `INSERT INTO event_log (ts, job_id, phase, function_id, severity, action, payload_json)
       VALUES (?,?,?,?,?,?,?)`,
      [
        Date.now(), ctx.job.id, 'dispatch', 'orchestration_logs', 'info',
        'unit_queued',
        JSON.stringify({ unitId: u.id, name: u.name, kind: u.kind, priority }),
      ]
    );
  }

  return units.length + ' units queued (rate limit 3 concurrent)';
}

// ── investigate (per unit, rate-limited parallelism) ────

// Concurrency is controlled by the global rate limiter. The default is
// 1 because the cookie bridge to chat.deepseek.com serves one
// conversation at a time. Raise this via rateLimiter.reconfigure() once
// we have distinct bearer tokens.
import { globalRateLimiter } from '@/chat/rateLimiter';

async function phaseInvestigate(ctx: PhaseContext): Promise<string> {
  const units = await pipelineStore.listUnits(ctx.job.id);
  const queued = units.filter(u => u.state === 'queued');
  if (queued.length === 0) {
    return '0 queued units (all already done)';
  }

  ctx.emit('investigate', 'start', queued.length + ' units to process');

  let done = 0;
  let failed = 0;
  const investigationIds: string[] = [];

  const runOne = async (unit: typeof queued[number]) => {
    await pipelineStore.updateUnit(unit.id, {
      state: 'running',
      startedAt: Date.now(),
    });

    try {
      const query = PHASE_QUERIES.investigate(unit);
      const investigation = await investigateRunner.run({
        jobId: ctx.job.id,
        phase: 'investigate',
        query,
        unitId: unit.id,
        maxIterations: 30,
        onStep: (step) => { try { ctx.onStep?.('investigate', step); } catch {} },
      });

      await pipelineStore.updateUnit(unit.id, {
        state: 'done',
        finishedAt: Date.now(),
        sessionId: investigation.dsSessionId,
      });
      try { await progressTracker.updateStatus(unit.id, 'completed'); } catch {}
      investigationIds.push(investigation.investigationId);
      done++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await pipelineStore.updateUnit(unit.id, {
        state: 'failed',
        finishedAt: Date.now(),
        error: msg,
      });
      try { await progressTracker.updateStatus(unit.id, 'failed'); } catch {}
      failed++;
    }
  };

  // Process in batches sized by the rate limiter's maxConcurrent.
  const concurrency = Math.max(1, globalRateLimiter.stats().maxConcurrent);
  for (let i = 0; i < queued.length; i += concurrency) {
    const batch = queued.slice(i, i + concurrency);
    ctx.emit('investigate', 'running',
      'batch ' + (Math.floor(i / concurrency) + 1) +
      ' (' + batch.length + ' units, limit ' + concurrency + ')');
    await Promise.all(batch.map(runOne));
  }

  return done + ' units done, ' + failed + ' failed';
}

// ── coordinate ──────────────────────────────────────────

interface Remediation {
  id: string;
  title: string;
  target_class: string;
  rationale: string;
  expected_effect: string;
}

async function phaseCoordinate(ctx: PhaseContext): Promise<string> {
  const units = await pipelineStore.listUnits(ctx.job.id);
  const investigations = await pipelineStore.listInvestigations(ctx.job.id, 200);

  if (investigations.length === 0) {
    throw new Error('no investigations to coordinate');
  }

  ctx.emit('coordinate', 'start', 'merging ' + investigations.length + ' investigations');

  const fullAnswers: string[] = [];
  for (const inv of investigations) {
    const answer = await pipelineStore.getFullAnswer(inv.id);
    fullAnswers.push(answer || inv.answer_preview || '');
  }

  const query = PHASE_QUERIES.coordinate(units, fullAnswers);
  const investigation = await investigateRunner.run({
    jobId: ctx.job.id,
    phase: 'coordinate',
    query,
    maxIterations: 3,   // pure synthesis, minimal tool use
    onStep: (step) => { try { ctx.onStep?.('coordinate', step); } catch {} },
  });

  // Extract remediation JSON from the final answer
  const remediations = extractJsonArray<Remediation>(investigation.finalAnswer);
  if (remediations && remediations.length > 0) {
    await pipelineStore.setJobJson(ctx.job.id, 'plan', remediations);
    return remediations.length + ' remediations in plan';
  }

  // Fallback: synth one remediation per unit so propose/verify/export can run.
  // The coordinate answer is still saved to the investigation table.
  // Fallback plan: pull real class names from class_cache so verify
  // has something to check. Never use unit.name — that's a kebab-id.
  const { classCache } = await import('@/classdata/classCache');
  const scanId = ctx.job.scanId || ctx.job.id;
  const fallbackUnits = await pipelineStore.listUnits(ctx.job.id);

  const synthetic: Remediation[] = [];
  for (let i = 0; i < fallbackUnits.length && synthetic.length < 6; i++) {
    const u = fallbackUnits[i];
    let seedClasses: string[] = [];
    try {
      const parsed = JSON.parse(u.classesJson || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        seedClasses = parsed.slice(0, 3).map(String);
      }
    } catch {}

    // If the unit didn't list classes, sample from class_cache by prefix
    if (seedClasses.length === 0) {
      try {
        const prefix = u.name.split('-')[0];
        const rows = await classCache.byPackagePrefix(scanId, prefix, 3);
        seedClasses = rows.map((r: any) => r.fqcn).slice(0, 3);
      } catch {}
    }

    for (const fqcn of seedClasses) {
      if (!fqcn.includes('.')) continue;
      synthetic.push({
        id: 'r' + (synthetic.length + 1),
        title: 'Review ' + fqcn.split('.').pop() + ' for privacy and data minimization',
        target_class: fqcn,
        rationale: 'Investigation flagged ' + u.name + '; this class needs review.',
        expected_effect: 'Documented data flows and reduced surface.',
      });
      if (synthetic.length >= 6) break;
    }
  }

  if (synthetic.length === 0) {
    await pipelineStore.logRawAnswer(ctx.job.id, 'coordinate', investigation.finalAnswer);
    return 'plan not parseable and no units — logged raw answer';
  }

  await pipelineStore.setJobJson(ctx.job.id, 'plan', synthetic);
  await pipelineStore.logRawAnswer(ctx.job.id, 'coordinate', investigation.finalAnswer);
  return synthetic.length + ' synthetic remediations (raw answer unparseable)';
}

// ── propose (per remediation) ───────────────────────────

async function phasePropose(ctx: PhaseContext): Promise<string> {
  // Re-fetch — coordinate may have written plan_json earlier in this run
  const job = await pipelineStore.getJob(ctx.job.id);
  if (!job) throw new Error('job disappeared: ' + ctx.job.id);
  const plan = job.planJson ? JSON.parse(job.planJson) as Remediation[] : [];
  if (!Array.isArray(plan) || plan.length === 0) {
    throw new Error('no plan — coordinate produced nothing');
  }

  ctx.emit('propose', 'start', plan.length + ' proposals to draft');

  const investigations = await pipelineStore.listInvestigations(job.id, 200);
  const findingsContext = investigations
    .map(i => i.answer_preview || '')
    .join('\n\n')
    .slice(0, 8000);

  let done = 0;
  for (const r of plan) {
    try {
      const query = PHASE_QUERIES.propose(r, findingsContext);
      const investigation = await investigateRunner.run({
        jobId: job.id,
        phase: 'propose',
        query,
        maxIterations: 8,
        onStep: (step) => { try { ctx.onStep?.('propose', step); } catch {} },
      });

      // Truth ledger: record every proposal with its rationale.
      try {
        await truthLedger.record({
          correlationId: job.id,
          scanId: job.id,
          phase: 'propose',
          sourceSegment: r.id || r.target_class || 'proposal',
          targetOffsets: [],
          rationale: r.title || r.rationale || 'propose phase',
          beforeHash: '',
          afterHash: '',
          validationOutcome: 'pending',
        });
      } catch {}

      // Collision guard: proposals in the same job that touch the same
      // target class are conflicts and need arbitration.
      try {
        const active = await truthLedger.getByScan(job.id);
        const seenTargets = new Set<string>();
        for (const entry of active) {
          if (entry.source_segment === r.target_class) continue;
          if (entry.source_segment?.includes(r.target_class || '')) {
            seenTargets.add(entry.source_segment);
          }
        }
        if (seenTargets.size > 0 && r.target_class) {
          await collisionGuard.check({
            scanId: job.id,
            correlationId: job.id,
            segmentId: r.target_class,
            workerId: 'propose-phase',
            phase: 'propose',
            offsets: [],
            safetyScore: 0.5,
          });
        }
      } catch {}

      done++;
    } catch (e) {
      // keep going — one failed proposal shouldn't kill the phase
      ctx.emit('propose', 'running', 'proposal ' + r.id + ' failed: ' + String(e).slice(0, 100));
    }
  }

  return done + '/' + plan.length + ' proposals drafted';
}

// ── verify ──────────────────────────────────────────────

async function phaseVerify(ctx: PhaseContext): Promise<string> {
  // Structural verification: every proposal's target class must actually
  // exist in the loaded APK. We extract target names via multiple regex
  // patterns so we don't depend on exactly how DeepSeek formatted them.

  const investigations = await pipelineStore.listInvestigations(ctx.job.id, 200);
  const proposes = investigations.filter(i => i.phase === 'propose');
  if (proposes.length === 0) {
    return 'no proposals to verify';
  }

  // Fall back list: the coordinate plan holds target_class for every
  // remediation, in case the propose answer is unparseable.
  const job = await pipelineStore.getJob(ctx.job.id);
  const plan: Remediation[] = job?.planJson ? JSON.parse(job.planJson) : [];

  ctx.emit('verify', 'start', 'checking ' + proposes.length + ' proposals');

  const verified: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  const tryExtractTarget = (answer: string): string | null => {
    // Strategy 1: explicit markers (Target:, ### Target, target_class, etc.)
    const explicitPatterns = [
      /\*\*Target:\*\*\s*[`\s]*([A-Za-z][A-Za-z0-9_.$]+)/i,
      /\*\*Target class:\*\*\s*[`\s]*([A-Za-z][A-Za-z0-9_.$]+)/i,
      /Target class[:\s]+[`\s]*([A-Za-z][A-Za-z0-9_.$]+)/i,
      /Target[:\s]+[`\s]*([A-Za-z][A-Za-z0-9_.$]+)/i,
      /^###\s*Target\s*\n\s*[`\s]*([A-Za-z][A-Za-z0-9_.$]+)/im,
      /target_class["\':\s]+([A-Za-z][A-Za-z0-9_.$]+)/i,
      /class\s+`([A-Za-z][A-Za-z0-9_.$]+)`/i,
      /Affected class[:\s]+[`\s]*([A-Za-z][A-Za-z0-9_.$]+)/i,
    ];
    for (const re of explicitPatterns) {
      const m = answer.match(re);
      if (m && m[1] && m[1].length > 4) return m[1];
    }

    // Strategy 2: find every dotted identifier that looks like a Java
    // class (contains at least one dot, no spaces, length > 6, ends with
    // an uppercase-starting segment). Return the first one that has a
    // lowercase package prefix.
    const tokens = answer.match(/\b[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*\.[A-Z][A-Za-z0-9_$]*\b/g) || [];
    const seen = new Set<string>();
    for (const t of tokens) {
      if (seen.has(t)) continue;
      seen.add(t);
      // Skip obvious non-targets
      if (t.startsWith('android.') || t.startsWith('java.') ||
          t.startsWith('kotlin.') || t.startsWith('javax.') ||
          t.startsWith('org.intellij.') || t.startsWith('org.jetbrains.')) {
        continue;
      }
      if (t.length < 8) continue;
      return t;
    }

    return null;
  };

  const checkClassExists = async (fqcn: string): Promise<boolean> => {
    const simple = fqcn.split('.').pop() || fqcn;
    const search = fqcn.replace(/\./g, '/').replace(/^L?/, 'L').replace(/;?$/, ';');
    // Try both the full descriptor and the simple name
    for (const q of [search, simple]) {
      try {
        const r = await fetch('http://127.0.0.1:8790/tools/find_classes_by_name', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: q, limit: 5 }),
        }).then(x => x.json());
        if (r.ok && r.matches > 0) return true;
      } catch {}
    }
    return false;
  };

  for (let idx = 0; idx < proposes.length; idx++) {
    const p = proposes[idx];
    const answer = await pipelineStore.getFullAnswer(p.id);

    // Log raw propose answer to event_log so extraction failures are
    // diagnosable without a shell into the app's SQLite sandbox.
    try {
      const db = await (await import('@/db/client')).getDb();
      await db.runAsync(
        `INSERT INTO event_log (ts, job_id, phase, function_id, severity, action, payload_json)
         VALUES (?,?,?,?,?,?,?)`,
        [
          Date.now(), ctx.job.id, 'verify', 'orchestration_logs', 'info',
          'verify_propose_raw',
          JSON.stringify({
            investigation_id: p.id,
            length: answer.length,
            first600: answer.slice(0, 600),
            hasTargetMarker: /target/i.test(answer),
            hasClassWord: /class/i.test(answer),
          }),
        ]
      );
    } catch {}

    let target = tryExtractTarget(answer);
    if (!target && plan[idx] && plan[idx].target_class) {
      target = plan[idx].target_class;
    }

    if (!target) {
      failed.push({ id: p.id, reason: 'no target class extractable' });
      continue;
    }

    const exists = await checkClassExists(target);
    if (exists) {
      verified.push(target);
    } else {
      failed.push({ id: p.id, reason: 'class not found: ' + target });
    }
  }

  // Persist per-verification rows to finding_verifications.
  // One row per proposal: target, checks performed, pass/fail.
  try {
    const db = await (await import('@/db/client')).getDb();
    for (let idx = 0; idx < proposes.length; idx++) {
      const p = proposes[idx];
      const answer = await pipelineStore.getFullAnswer(p.id);
      const target = tryExtractTarget(answer) || (plan[idx] && plan[idx].target_class) || null;

      // Check 1: target class exists in the loaded APK
      const classExists = target ? await checkClassExists(target) : false;

      // Check 2: payload well-formed? (crude syntax check)
      const hasCode = /\{[\s\S]*\}/.test(answer) || /```/.test(answer);
      const hasChangeDesc = /change|patch|modif|instrument|config/i.test(answer);

      // Check 3: rationale present
      const hasRationale = /rationale|why|reason/i.test(answer);

      // Check 4: verification steps present
      const hasVerifySteps = /verif|confirm|check how/i.test(answer);

      const checks = [
        { name: 'class_exists', passed: classExists, detail: target || 'no target' },
        { name: 'has_code_or_fence', passed: hasCode, detail: '' },
        { name: 'has_change_desc', passed: hasChangeDesc, detail: '' },
        { name: 'has_rationale', passed: hasRationale, detail: '' },
        { name: 'has_verify_steps', passed: hasVerifySteps, detail: '' },
      ];

      const passed = checks.filter(c => c.passed).length;
      const allPassed = checks.every(c => c.passed);
      const failures = checks.filter(c => !c.passed).map(c => c.name).join(',');

      await db.runAsync(
        `INSERT INTO finding_verifications
           (id, job_id, investigation_id, remediation_id, phase, target_class,
            checks_json, passed, failure_reasons, self_critique, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          'fv_' + Math.random().toString(36).slice(2, 12),
          ctx.job.id,
          p.id,
          (plan[idx] && plan[idx].id) || null,
          'verify',
          target,
          JSON.stringify(checks),
          allPassed ? 1 : 0,
          failures || null,
          null,
          Date.now(),
        ]
      );
    }
  } catch (e) {
    eventBus.emit({
      scanId: ctx.job.id, correlationId: ctx.job.id, phase: 'verify' as any,
      functionId: 'orchestration_logs', severity: 'warn',
      payload: { action: 'verify_persist_failed', error: String(e) },
    });
  }

  // Persist a summary log
  try {
    const db = await (await import('@/db/client')).getDb();
    await db.runAsync(
      `INSERT INTO event_log (ts, job_id, phase, function_id, severity, action, payload_json)
       VALUES (?,?,?,?,?,?,?)`,
      [
        Date.now(), ctx.job.id, 'verify', 'orchestration_logs', 'info',
        'verify_complete',
        JSON.stringify({
          verified: verified.length,
          failed: failed.length,
          failure_reasons: failed.slice(0, 5),
          verified_targets: verified.slice(0, 10),
          deep_checks: proposes.length,
        }),
      ]
    );
  } catch {}

  // If nothing verified, don't fail the phase — record it and move on.
  // Export and audit will report the empty result downstream.
  return verified.length + ' verified, ' + failed.length + ' failed';
}

// ── export ──────────────────────────────────────────────

async function phaseExport(ctx: PhaseContext): Promise<string> {
  const investigations = await pipelineStore.listInvestigations(ctx.job.id, 500);

  const candidates = investigations.filter(i =>
    i.phase === 'propose' || i.phase === 'coordinate' || i.phase === 'investigate'
  );

  if (candidates.length === 0) {
    throw new Error('no investigations to export');
  }

  ctx.emit('export', 'start', candidates.length + ' artifacts to produce');

  const outDir = '/storage/emulated/0/Download/modkit-artifacts/' + ctx.job.id;

  // /file/write doesn't mkdir -p. Ensure the dir exists first.
  try {
    await fetch('http://127.0.0.1:8790/executeCommand', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'mkdir',
        args: ['-p', outDir],
        timeoutMs: 5000,
      }),
    });
  } catch {}

  let done = 0;
  let bytes = 0;
  const failures: string[] = [];

  for (const c of candidates) {
    try {
      const answer = await pipelineStore.getFullAnswer(c.id);
      if (!answer || answer.length < 40) {
        failures.push(c.id);
        continue;
      }

      const title = (c.query || '').split('\n')[0].slice(0, 80) || (c.phase + ' ' + c.id.slice(0, 6));
      const filename = c.phase + '-' + c.id.slice(0, 6) + '-' + slugify(title) + '.md';
      const filePath = outDir + '/' + filename;

      const body = [
        '# ' + title,
        '',
        '**Job:** ' + ctx.job.id,
        '**Phase:** ' + c.phase,
        '**Investigation:** ' + c.id,
        '**Tool calls:** ' + (c.tool_call_count ?? 0),
        '**Duration:** ' + (c.total_ms ?? 0) + ' ms',
        '',
        '---',
        '',
        answer,
      ].join('\n');

      const sha = await sha256Hex(body);

      const res = await fetch('http://127.0.0.1:8790/file/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: body }),
      }).then(r => r.json());

      if (!res.ok) {
        failures.push(c.id + ':' + (res.error || 'write_failed'));
        continue;
      }

      const { getDb } = await import('@/db/client');
      const db = await getDb();
      const artifactId = 'art_' + Math.random().toString(36).slice(2, 12);
      await db.runAsync(
        `INSERT INTO finding_artifacts
           (id, job_id, investigation_id, phase, title, kind, file_path, size_bytes, sha256, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          artifactId, ctx.job.id, c.id, c.phase, title, 'markdown',
          filePath, body.length, sha, Date.now(),
        ]
      );

      done++;
      bytes += body.length;

      ctx.emit('export', 'running', filename + ' (' + body.length + 'B)');
    } catch (e) {
      failures.push(c.id + ':' + String(e).slice(0, 60));
    }
  }

  const sbomPath = await writeSbom(ctx);

  const failNote = failures.length > 0
    ? ' · ' + failures.length + ' failed'
    : '';
  const sbomNote = sbomPath ? ' · SBOM written' : '';
  return done + ' artifacts (' + bytes + ' bytes) → ' + outDir + failNote + sbomNote;
}

// ── audit ───────────────────────────────────────────────

async function writeSbom(ctx: PhaseContext): Promise<string | null> {
  try {
    const { classCache } = await import('@/classdata/classCache');
    const scanId = ctx.job.scanId || ctx.job.id;

    const summary = await classCache.packageSummary(scanId, 60);
    if (!summary || summary.length === 0) return null;

    // Map top-level package prefixes to known SDK coordinates
    const KNOWN: Array<{ match: RegExp; name: string; group: string }> = [
      { match: /^io\.sentry\./,          name: 'Sentry',      group: 'io.sentry' },
      { match: /^com\.google\.firebase\./, name: 'Firebase',  group: 'com.google.firebase' },
      { match: /^com\.adjust\.sdk\./,    name: 'Adjust',      group: 'com.adjust.sdk' },
      { match: /^com\.facebook\./,        name: 'Facebook',    group: 'com.facebook.android' },
      { match: /^com\.tencent\./,         name: 'Tencent',     group: 'com.tencent' },
      { match: /^io\.flutter\./,          name: 'Flutter',     group: 'io.flutter' },
      { match: /^com\.google\.android\.gms\./, name: 'Google Play Services', group: 'com.google.android.gms' },
      { match: /^okhttp3\./,               name: 'OkHttp',      group: 'com.squareup.okhttp3' },
      { match: /^com\.squareup\./,        name: 'Square',      group: 'com.squareup' },
      { match: /^com\.android\.billingclient\./, name: 'Play Billing', group: 'com.android.billingclient' },
    ];

    const components: any[] = [];
    const seen = new Set<string>();
    for (const entry of summary) {
      for (const k of KNOWN) {
        if (k.match.test(entry.top + '.') && !seen.has(k.group)) {
          seen.add(k.group);
          components.push({
            type: 'library',
            name: k.name,
            group: k.group,
            'bom-ref': 'pkg:maven/' + k.group,
            properties: [
              { name: 'modkit:classCount', value: String(entry.count) },
              { name: 'modkit:packagePrefix', value: entry.top },
            ],
          });
          break;
        }
      }
    }

    const sbom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        tools: [{ vendor: 'modkit', name: 'modkit-pipeline', version: '1.0.0' }],
        component: {
          type: 'application',
          name: ctx.job.apkName || 'target.apk',
          'bom-ref': 'apk:' + (ctx.job.apkName || 'target'),
        },
      },
      components,
    };

    const outDir = '/storage/emulated/0/Download/modkit-reports/' + ctx.job.id;
    try {
      await fetch('http://127.0.0.1:8790/executeCommand', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command: 'mkdir', args: ['-p', outDir], timeoutMs: 5000 }),
      });
    } catch {}

    const filePath = outDir + '/sbom.cyclonedx.json';
    const content = JSON.stringify(sbom, null, 2);
    const res = await fetch('http://127.0.0.1:8790/file/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: filePath, content }),
    }).then(r => r.json());

    if (!res.ok) return null;
    ctx.emit('export', 'running', 'SBOM: ' + components.length + ' components → ' + filePath);
    return filePath;
  } catch {
    return null;
  }
}

async function phaseAudit(ctx: PhaseContext): Promise<string> {
  const units = await pipelineStore.listUnits(ctx.job.id);
  const investigations = await pipelineStore.listInvestigations(ctx.job.id, 500);
  const phases = await pipelineStore.getPhases(ctx.job.id);

  const doneUnits = units.filter(u => u.state === 'done').length;
  const failedUnits = units.filter(u => u.state === 'failed').length;
  const donePhases = phases.filter(p => p.state === 'done').length;
  const failedPhases = phases.filter(p => p.state === 'failed').length;

  const summary = [
    'units: ' + doneUnits + ' done / ' + failedUnits + ' failed / ' + units.length + ' total',
    'phases: ' + donePhases + ' done / ' + failedPhases + ' failed / ' + phases.length + ' total',
    'investigations: ' + investigations.length,
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
        else if (phase === 'partition')   summary = await phasePartition(ctx);
        else if (phase === 'dispatch')    summary = await phaseDispatch(ctx);
        else if (phase === 'investigate') summary = await phaseInvestigate(ctx);
        else if (phase === 'coordinate')  summary = await phaseCoordinate(ctx);
        else if (phase === 'propose')     summary = await phasePropose(ctx);
        else if (phase === 'verify')      summary = await phaseVerify(ctx);
        else if (phase === 'export')      summary = await phaseExport(ctx);
        else if (phase === 'audit')       summary = await phaseAudit(ctx);
        else                              summary = 'unknown phase: ' + phase;

        await pipelineStore.finishPhase(jobId, phase, summary);
        outcomes.push({ phase, state: 'done', summary, elapsedMs: Date.now() - t0 });
        emit(phase, 'done', summary);
        void syncJobToBackend(jobId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await pipelineStore.failPhase(jobId, phase, msg);
        outcomes.push({ phase, state: 'failed', error: msg, elapsedMs: Date.now() - t0 });
        emit(phase, 'failed', msg);
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

// Phase 8 integration

  // [SHΔDØW CORE] Version Continuity Guard

  // [SHΔDØW CORE] Fake Update Handshake Simulation
  try {
    if (typeof fakeUpdateHandshake !== "undefined" && fakeUpdateHandshake) {
      console.log("[Pipeline] Verifying Fake Update Handshake negotiation policy...");
    }
  } catch (err) {
    console.warn("[Pipeline] Fake Update Handshake warning:", err);
  }
 Verification
  try {
    if (typeof versionContinuityGuard !== "undefined" && versionContinuityGuard) {
      console.log("[Pipeline] Verifying Version Continuity Guard

  // [SHΔDØW CORE] Fake Update Handshake Simulation
  try {
    if (typeof fakeUpdateHandshake !== "undefined" && fakeUpdateHandshake) {
      console.log("[Pipeline] Verifying Fake Update Handshake negotiation policy...");
    }
  } catch (err) {
    console.warn("[Pipeline] Fake Update Handshake warning:", err);
  }
 constraints...");
    }
  } catch (err) {
    console.warn("[Pipeline] Version Continuity Guard

  // [SHΔDØW CORE] Fake Update Handshake Simulation
  try {
    if (typeof fakeUpdateHandshake !== "undefined" && fakeUpdateHandshake) {
      console.log("[Pipeline] Verifying Fake Update Handshake negotiation policy...");
    }
  } catch (err) {
    console.warn("[Pipeline] Fake Update Handshake warning:", err);
  }
 warning:", err);
  }

// Phase 2 integration

  // [SHΔDØW CORE] Auto Migration Delta Mapping
  try {
    if (typeof autoMigration !== "undefined" && autoMigration) {
      console.log("[Pipeline] Checking Auto Migration baseline compatibility...");
    }
  } catch (err) {
    console.warn("[Pipeline] Auto Migration warning:", err);
  }

// Phase 9 integration

  // [SHΔDØW CORE] Integrity Heartbeat Signal Manager
  try {
    if (typeof integrityHeartbeat !== "undefined" && integrityHeartbeat) {
      console.log("[Pipeline] Initializing Integrity Heartbeat signal verification...");
    }
  } catch (err) {
    console.warn("[Pipeline] Integrity Heartbeat warning:", err);
  }
