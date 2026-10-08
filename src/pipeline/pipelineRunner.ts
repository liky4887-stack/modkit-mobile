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

// ── wake lock (Android Doze will suspend Termux mid-pipeline) ───
// Uses termux-wake-lock via the backend to keep the CPU alive during
// long agent runs. Released on completion.

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

// The cookie bridge to chat.deepseek.com serves one conversation at a
// time. Firing N parallel calls on the same bearer returns empty replies
// for all but one. Keep this at 1 until we have distinct bearer tokens
// or an upstream queue.
const INVESTIGATE_CONCURRENCY = 1;

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

  // Fallback: synth one remediation per unit so propose/verify/export can run.
  // The coordinate answer is still saved to the investigation table.
  const fallbackUnits = await pipelineStore.listUnits(ctx.job.id);
  const synthetic: Remediation[] = fallbackUnits.slice(0, 6).map((u, i) => ({
    id: 'r' + (i + 1),
    title: 'Review ' + u.name + ' for privacy and data-minimization',
    target_class: u.name,
    rationale: 'Investigation flagged this unit; requires per-class review.',
    expected_effect: 'Documented data flows and minimized surfaces.',
  }));

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

  // Persist a verification log
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

  const failNote = failures.length > 0
    ? ' · ' + failures.length + ' failed'
    : '';
  return done + ' artifacts (' + bytes + ' bytes) → ' + outDir + failNote;
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
