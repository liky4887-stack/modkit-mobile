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

export type PhaseId = typeof PHASES_ORDER[number];

export interface RunOptions {
  stopAfter?: PhaseId;
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

function extractJsonArray<T>(text: string): T[] | null {
  if (!text) return null;

  // 1. Code fence: ```json [ ... ] ```
  const fenceMatches = text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g);
  for (const m of fenceMatches) {
    const inner = m[1].trim();
    if (inner.startsWith('[')) {
      try {
        const parsed = JSON.parse(inner);
        if (Array.isArray(parsed)) return parsed as T[];
      } catch {}
    }
  }

  // 2. First `[` and try every matching `]` from longest to shortest.
  const start = text.indexOf('[');
  if (start < 0) return null;
  for (let end = text.length; end > start; end--) {
    if (text[end - 1] !== ']') continue;
    const slice = text.slice(start, end);
    try {
      const parsed = JSON.parse(slice);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as T[];
    } catch {}
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

  return 'pkg=' + load.package + ' v' + load.versionName +
         ' dex=' + load.dex_count + ' perms=' + load.permission_count +
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
    '[{"name":"pubg-app","kind":"app","seed_strings":["com.pubg."],"why":"top-level app package"},',
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

const INVESTIGATE_CONCURRENCY = 3;

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
      investigationIds.push(investigation.investigationId);
      done++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await pipelineStore.updateUnit(unit.id, {
        state: 'failed',
        finishedAt: Date.now(),
        error: msg,
      });
      failed++;
    }
  };

  // Process in batches of INVESTIGATE_CONCURRENCY
  for (let i = 0; i < queued.length; i += INVESTIGATE_CONCURRENCY) {
    const batch = queued.slice(i, i + INVESTIGATE_CONCURRENCY);
    ctx.emit('investigate', 'running',
      'batch ' + (Math.floor(i / INVESTIGATE_CONCURRENCY) + 1) +
      ' (' + batch.length + ' units)');
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

  await pipelineStore.logRawAnswer(ctx.job.id, 'coordinate', investigation.finalAnswer);
  return 'plan not parseable — logged raw answer';
}

// ── propose (per remediation) ───────────────────────────

async function phasePropose(ctx: PhaseContext): Promise<string> {
  const job = ctx.job;
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
      await investigateRunner.run({
        jobId: job.id,
        phase: 'propose',
        query,
        maxIterations: 8,
        onStep: (step) => { try { ctx.onStep?.('propose', step); } catch {} },
      });
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
  // Verification in 09b is structural: check every proposed target class
  // actually exists in the loaded APK. Full payload verification
  // (offset existence, syntax) lands when we add propose payloads.

  const units = await pipelineStore.listUnits(ctx.job.id);
  const investigations = await pipelineStore.listInvestigations(ctx.job.id, 200);

  ctx.emit('verify', 'start', 'checking ' + investigations.length + ' investigations');

  const verified: string[] = [];
  const failed: string[] = [];

  for (const inv of investigations) {
    if (inv.phase !== 'propose') continue;
    const answer = await pipelineStore.getFullAnswer(inv.id);
    // Look for the target class in the answer
    const m = answer.match(/\*\*Target:\*\*\s*([A-Za-z0-9_.$]+)/);
    if (!m) { failed.push(inv.id); continue; }

    const fqcn = m[1];
    try {
      const res = await fetch('http://127.0.0.1:8790/tools/find_classes_by_name', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: fqcn.split('.').pop(), limit: 5 }),
      }).then(r => r.json());
      if (res.ok && res.matches > 0) {
        verified.push(inv.id);
      } else {
        failed.push(inv.id);
      }
    } catch {
      failed.push(inv.id);
    }
  }

  return verified.length + ' verified, ' + failed.length + ' failed';
}

// ── export ──────────────────────────────────────────────

async function phaseExport(ctx: PhaseContext): Promise<string> {
  const investigations = await pipelineStore.listInvestigations(ctx.job.id, 200);
  const proposeOnes = investigations.filter(i => i.phase === 'propose');
  if (proposeOnes.length === 0) {
    throw new Error('no proposals to export');
  }

  ctx.emit('export', 'start', proposeOnes.length + ' artifacts to produce');

  let done = 0;
  for (const p of proposeOnes) {
    try {
      const proposal = await pipelineStore.getFullAnswer(p.id);
      const query = PHASE_QUERIES.exportArtifact(proposal, 'see prior investigations');
      await investigateRunner.run({
        jobId: ctx.job.id,
        phase: 'export',
        query,
        maxIterations: 4,
        onStep: (step) => { try { ctx.onStep?.('export', step); } catch {} },
      });
      done++;
    } catch (e) {
      ctx.emit('export', 'running', 'export ' + p.id + ' failed: ' + String(e).slice(0, 100));
    }
  }

  return done + '/' + proposeOnes.length + ' artifacts produced';
}

// ── audit ───────────────────────────────────────────────

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
    const doneSet = new Set(existing.filter(p => p.state === 'done').map(p => p.phase));

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
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await pipelineStore.failPhase(jobId, phase, msg);
        outcomes.push({ phase, state: 'failed', error: msg, elapsedMs: Date.now() - t0 });
        emit(phase, 'failed', msg);

        await pipelineStore.setJobState(jobId, 'failed', msg);
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
