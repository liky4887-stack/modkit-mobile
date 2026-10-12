// CRUD for pipeline_jobs, pipeline_phases, pipeline_units.
import { getDb } from '@/db/client';

export interface FindingRecord {
  id: string;
  jobId: string;
  unitId: string | null;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  category: string;
  title: string;
  risk: string;
  evidenceClass: string | null;
  evidenceMethod: string | null;
  evidenceSource: string | null;
  patch: any;
  verification: string | null;
  appliedState: 'pending' | 'approved' | 'rejected' | 'applied' | 'failed';
  confidence: number;
  confidenceBand: 'high' | 'medium' | 'low';
  createdAt: number;
  decidedAt: number | null;
  decisionNote: string | null;
}

export interface NewFinding {
  unitId?: string | null;
  severity: FindingRecord['severity'];
  category: string;
  title: string;
  risk: string;
  evidenceClass?: string | null;
  evidenceMethod?: string | null;
  evidenceSource?: string | null;
  patch: any;
  verification?: string | null;
  confidence?: number | null;
  confidenceBand?: 'high' | 'medium' | 'low' | null;
}

export type JobState =
  | 'queued' | 'importing' | 'partitioning' | 'dispatching'
  | 'investigating' | 'coordinating' | 'proposing' | 'verifying'
  | 'exporting' | 'auditing'
  | 'waiting_review'                    // paused at review_gate
  | 'done' | 'failed' | 'cancelled' | 'awaiting_user';

export type PhaseState = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type UnitState = 'queued' | 'running' | 'done' | 'failed' | 'skipped';

export interface JobRecord {
  id: string;
  scanId: string | null;
  apkPath: string;
  apkName: string | null;
  apkSize: number;
  apkHash: string | null;
  state: JobState;
  currentPhase: string | null;
  currentFeature: string | null;
  startedAt: number;
  updatedAt: number;
  finishedAt: number | null;
  error: string | null;
  dsCalls: number;
  dsElapsedMs: number;
  dsTokens: number;
  dsLastSession: string | null;
  prioritiesJson: string | null;
  queueJson: string | null;
  planJson: string | null;
  modifiedApkPath?: string | null;
  reviewState?: string;
}

export interface PhaseRecord {
  id: string;
  jobId: string;
  phase: string;
  state: PhaseState;
  startedAt: number | null;
  finishedAt: number | null;
  summary: string | null;
  error: string | null;
}

export interface UnitRecord {
  id: string;
  jobId: string;
  name: string;
  kind: string;
  brief: string | null;
  classesJson: string | null;
  dexFilesJson: string | null;
  state: UnitState;
  sessionId: string | null;
  turns: number;
  tokens: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
}

export const PHASES_ORDER = [
  // Deterministic chain — no LLM calls in the default path.
  'import',       // load original + modified APK into sidecar
  'decompile',    // disassemble classes*.dex to smali trees (both APKs)
  'diff',         // enumerate every modification between the two APKs
  'modBots',      // classify each modification (class / method / resource / permission / component / native)
  'review_gate',  // pause — user marks items to revert (or leave alone) in the MODS tab
  'revert',       // produce a clean APK with the marked items restored to original bytes
  'export',       // markdown report + modification inventory JSON + clean APK path
  'audit',        // counts
] as const;

// Legacy LLM-driven phases remain available as an opt-in deep-dive chain
// (see LLM_PHASES_ORDER below) but are no longer part of the default
// pipeline. The deterministic chain above is what runs when you launch a
// job — 0 DeepSeek calls.
export const LLM_PHASES_ORDER = [
  'bots', 'partition', 'dispatch', 'investigate',
  'coordinate', 'findings', 'propose', 'verify', 'apply',
] as const;

export type PhaseId =
  | typeof PHASES_ORDER[number]
  | typeof LLM_PHASES_ORDER[number];

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function rowToJob(r: any): JobRecord {
  return {
    id: r.id,
    scanId: r.scan_id,
    apkPath: r.apk_path,
    apkName: r.apk_name,
    apkSize: r.apk_size ?? 0,
    apkHash: r.apk_hash,
    state: r.state,
    currentPhase: r.current_phase,
    currentFeature: r.current_feature,
    startedAt: r.started_at,
    updatedAt: r.updated_at,
    finishedAt: r.finished_at,
    error: r.error,
    dsCalls: r.ds_calls ?? 0,
    dsElapsedMs: r.ds_elapsed_ms ?? 0,
    dsTokens: r.ds_tokens ?? 0,
    dsLastSession: r.ds_last_session,
    prioritiesJson: r.priorities_json,
    queueJson: r.queue_json,
    planJson: r.plan_json,
    modifiedApkPath: r.modified_apk_path ?? null,
    reviewState: r.review_state ?? 'pending',
};
}

function rowToPhase(r: any): PhaseRecord {
  return {
    id: r.id,
    jobId: r.job_id,
    phase: r.phase,
    state: r.state,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    summary: r.summary,
    error: r.error,
  };
}

function rowToUnit(r: any): UnitRecord {
  return {
    id: r.id,
    jobId: r.job_id,
    name: r.name,
    kind: r.kind,
    brief: r.brief,
    classesJson: r.classes_json,
    dexFilesJson: r.dex_files_json,
    state: r.state,
    sessionId: r.session_id,
    turns: r.turns ?? 0,
    tokens: r.tokens ?? 0,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    error: r.error,
  };
}

function rowToFinding(r: any): FindingRecord {
  let patch: any = null;
  try { patch = JSON.parse(r.patch_json || 'null'); } catch {}
  return {
    id: r.id,
    jobId: r.job_id,
    unitId: r.unit_id,
    severity: r.severity,
    category: r.category,
    title: r.title,
    risk: r.risk,
    evidenceClass: r.evidence_class,
    evidenceMethod: r.evidence_method,
    evidenceSource: r.evidence_source,
    patch,
    verification: r.verification,
    appliedState: r.applied_state,
    confidence: r.confidence ?? 0.8,
    confidenceBand: (r.confidence_band as any) ?? 'medium',
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
  };
}

export const pipelineStore = {
  // ── Jobs ─────────────────────────────────────────────────────
  async createJob(input: {
    scanId?: string | null;
    apkPath: string;
    apkName?: string | null;
    apkSize?: number;
    apkHash?: string | null;
  }): Promise<JobRecord> {
    const db = await getDb();
    const id = uuid();
    const now = Date.now();
    await db.runAsync(
      `INSERT INTO pipeline_jobs
         (id, scan_id, apk_path, apk_name, apk_size, apk_hash, state, started_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id, input.scanId ?? null, input.apkPath,
        input.apkName ?? null, input.apkSize ?? 0, input.apkHash ?? null,
        'queued', now, now,
      ]
    );
    return {
      id, scanId: input.scanId ?? null, apkPath: input.apkPath,
      apkName: input.apkName ?? null, apkSize: input.apkSize ?? 0,
      apkHash: input.apkHash ?? null, state: 'queued',
      currentPhase: null, currentFeature: null,
      startedAt: now, updatedAt: now, finishedAt: null, error: null,
      modifiedApkPath: null, reviewState: 'pending',
      dsCalls: 0, dsElapsedMs: 0, dsTokens: 0, dsLastSession: null,
      prioritiesJson: null, queueJson: null, planJson: null,
    };
  },

  async getJob(id: string): Promise<JobRecord | null> {
    const db = await getDb();
    const r = await db.getFirstAsync<any>(`SELECT * FROM pipeline_jobs WHERE id = ?`, [id]);
    return r ? rowToJob(r) : null;
  },

  async listJobs(limit = 50): Promise<JobRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM pipeline_jobs ORDER BY started_at DESC LIMIT ?`, [limit]
    );
    return rows.map(rowToJob);
  },

  async setJobState(id: string, state: JobState, error: string | null = null): Promise<void> {
    const db = await getDb();
    const finished = state === 'done' || state === 'failed' || state === 'cancelled' ? Date.now() : null;
    await db.runAsync(
      `UPDATE pipeline_jobs
         SET state = ?, updated_at = ?, finished_at = COALESCE(?, finished_at), error = ?
       WHERE id = ?`,
      [state, Date.now(), finished, error, id]
    );
  },

  async setCurrent(id: string, phase: string | null, feature: string | null = null): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE pipeline_jobs SET current_phase = ?, current_feature = ?, updated_at = ? WHERE id = ?`,
      [phase, feature, Date.now(), id]
    );
  },

  async bumpDs(id: string, opts: { calls?: number; elapsedMs?: number; tokens?: number; sessionId?: string | null }): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE pipeline_jobs
         SET ds_calls = ds_calls + COALESCE(?, 0),
             ds_elapsed_ms = ds_elapsed_ms + COALESCE(?, 0),
             ds_tokens = ds_tokens + COALESCE(?, 0),
             ds_last_session = COALESCE(?, ds_last_session),
             updated_at = ?
       WHERE id = ?`,
      [opts.calls ?? 0, opts.elapsedMs ?? 0, opts.tokens ?? 0, opts.sessionId ?? null, Date.now(), id]
    );
  },

  async setJobJson(id: string, field: 'priorities' | 'queue' | 'plan', value: unknown): Promise<void> {
    const db = await getDb();
    const col = field === 'priorities' ? 'priorities_json' :
                field === 'queue' ? 'queue_json' : 'plan_json';
    await db.runAsync(
      `UPDATE pipeline_jobs SET ${col} = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(value), Date.now(), id]
    );
  },

  // ── Phases ───────────────────────────────────────────────────
  async createPhasesForJob(jobId: string): Promise<PhaseRecord[]> {
    const db = await getDb();
    const out: PhaseRecord[] = [];
    const now = Date.now();
    for (const phase of PHASES_ORDER) {
      const id = uuid();
      await db.runAsync(
        `INSERT INTO pipeline_phases (id, job_id, phase, state) VALUES (?,?,?,?)`,
        [id, jobId, phase, 'pending']
      );
      out.push({ id, jobId, phase, state: 'pending', startedAt: null, finishedAt: null, summary: null, error: null });
    }
    return out;
  },

  async getPhases(jobId: string): Promise<PhaseRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM pipeline_phases WHERE job_id = ? ORDER BY rowid ASC`, [jobId]
    );
    return rows.map(rowToPhase);
  },

  async startPhase(jobId: string, phase: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE pipeline_phases SET state = 'running', started_at = ? WHERE job_id = ? AND phase = ?`,
      [Date.now(), jobId, phase]
    );
  },

  async finishPhase(jobId: string, phase: string, summary: string | null = null): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE pipeline_phases SET state = 'done', finished_at = ?, summary = ? WHERE job_id = ? AND phase = ?`,
      [Date.now(), summary, jobId, phase]
    );
  },

  async setModifiedApkPath(jobId: string, path: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE pipeline_jobs SET modified_apk_path = ?, updated_at = ? WHERE id = ?`,
      [path || null, Date.now(), jobId],
    );
  },

  async createStandaloneBotsJob(apkPath: string): Promise<string> {
    const db = await getDb();
    const id = uuid();
    const now = Date.now();
    const apkName = apkPath.split('/').pop() || 'unknown.apk';
    await db.runAsync(
      `INSERT INTO pipeline_jobs
       (id, scan_id, apk_path, apk_name, state, started_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      [id, 'standalone-bots', apkPath, apkName, 'running', now, now],
    );
    return id;
  },

  async createFindings(jobId: string, findings: NewFinding[]): Promise<number> {
    if (!findings || findings.length === 0) return 0;
    const db = await getDb();
    const now = Date.now();
    let inserted = 0;
    for (const f of findings) {
      try {
        await db.runAsync(
          `INSERT INTO findings
           (id, job_id, unit_id, severity, category, title, risk,
            evidence_class, evidence_method, evidence_source,
            patch_json, verification, applied_state, created_at,
            confidence, confidence_band)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            uuid(),
            jobId,
            f.unitId ?? null,
            f.severity || 'info',
            f.category || 'uncategorized',
            f.title || 'Untitled finding',
            f.risk || '',
            f.evidenceClass ?? null,
            f.evidenceMethod ?? null,
            f.evidenceSource ?? null,
            JSON.stringify(f.patch ?? {}),
            f.verification ?? null,
            'pending',
            now,
            typeof f.confidence === 'number' ? f.confidence : 0.8,
            f.confidenceBand ?? 'medium',
          ],
        );
        inserted++;
      } catch (e) {
        console.warn('[pipelineStore] failed to insert finding:', e);
      }
    }
    return inserted;
  },

  async listFindings(jobId: string): Promise<FindingRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM findings WHERE job_id = ?
       ORDER BY CASE severity
         WHEN 'critical' THEN 0 WHEN 'high' THEN 1
         WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
       created_at ASC`,
      [jobId],
    );
    return rows.map(rowToFinding);
  },

  async listApprovedFindings(jobId: string): Promise<FindingRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM findings WHERE job_id = ? AND applied_state = 'approved'
       ORDER BY CASE severity
         WHEN 'critical' THEN 0 WHEN 'high' THEN 1
         WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
      [jobId],
    );
    return rows.map(rowToFinding);
  },

  async setFindingState(
    id: string,
    state: FindingRecord['appliedState'],
    note: string | null = null,
  ): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE findings SET applied_state = ?, decided_at = ?, decision_note = ?
       WHERE id = ?`,
      [state, Date.now(), note, id],
    );
  },

  async findingStats(jobId: string): Promise<{
    total: number;
    bySeverity: Record<string, number>;
    byState: Record<string, number>;
  }> {
    const db = await getDb();
    const sevRows = await db.getAllAsync<any>(
      `SELECT severity, COUNT(*) AS n FROM findings WHERE job_id = ? GROUP BY severity`,
      [jobId],
    );
    const stRows = await db.getAllAsync<any>(
      `SELECT applied_state, COUNT(*) AS n FROM findings WHERE job_id = ? GROUP BY applied_state`,
      [jobId],
    );
    const bySeverity: Record<string, number> = {};
    const byState: Record<string, number> = {};
    let total = 0;
    for (const r of sevRows) {
      bySeverity[r.severity] = r.n;
      total += r.n;
    }
    for (const r of stRows) byState[r.applied_state] = r.n;
    return { total, bySeverity, byState };
  },

  async getJobPlan(jobId: string): Promise<{
    enhanced_apk?: string;
    final_size?: number;
    orchestration_verdict?: string;
    integrity?: any;
    signature?: any;
    batches?: any[];
    follow_back?: any[];
    cross_batch?: any;
    report_path?: string;
    total_ms?: number;
  } | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<any>(
      `SELECT plan_json FROM pipeline_jobs WHERE id = ?`, [jobId],
    );
    if (!row || !row.plan_json) return null;
    try { return JSON.parse(row.plan_json); } catch { return null; }
  },

  async setReviewState(jobId: string, state: 'pending' | 'awaiting_user' | 'decided'): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE pipeline_jobs SET review_state = ?, updated_at = ? WHERE id = ?`,
      [state, Date.now(), jobId],
    );
  },

  async getReviewState(jobId: string): Promise<'pending' | 'awaiting_user' | 'decided'> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ review_state: string }>(
      `SELECT review_state FROM pipeline_jobs WHERE id = ?`, [jobId],
    );
    return (row?.review_state as any) || 'pending';
  },

  async listModifications(jobId: string): Promise<Array<{
    id: string; type: string; kind: string; target: string;
    original: string | null; modified: string | null;
    originalHash: string | null; modifiedHash: string | null; reverted: boolean;
  }>> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT id, type, kind, target, parent_dex, original, modified,
              original_hash, modified_hash, reverted
       FROM modifications WHERE job_id = ? ORDER BY kind, target`,
      [jobId],
    );
    return rows.map(r => ({
      id: r.id, type: r.type, kind: r.kind, target: r.target,
      parentDex: r.parent_dex ?? null,
      original: r.original, modified: r.modified,
      originalHash: r.original_hash, modifiedHash: r.modified_hash,
      reverted: r.reverted === 1,
    }));
  },

  async setModificationReverted(modificationId: string, reverted: boolean): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE modifications SET reverted = ? WHERE id = ?`,
      [reverted ? 1 : 0, modificationId],
    );
  },

  async listRevertedModifications(jobId: string): Promise<Array<{
    id: string; type: string; kind: string; target: string;
    parentDex: string | null;
    originalHash: string | null; modifiedHash: string | null;
  }>> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT id, type, kind, target, parent_dex, original_hash, modified_hash
       FROM modifications WHERE job_id = ? AND reverted = 1
       ORDER BY kind, target`,
      [jobId],
    );
    return rows.map(r => ({
      id: r.id, type: r.type, kind: r.kind, target: r.target,
      parentDex: r.parent_dex ?? null,
      originalHash: r.original_hash, modifiedHash: r.modified_hash,
    }));
  },

  async getPhaseTimings(jobId: string): Promise<Array<{
    phase: string; state: string; startedAt: number | null;
    finishedAt: number | null; durationMs: number | null; summary: string | null;
  }>> {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT phase, state, started_at, finished_at, summary
       FROM pipeline_phases WHERE job_id = ? ORDER BY rowid ASC`,
      [jobId],
    );
    return rows.map(r => ({
      phase: r.phase,
      state: r.state,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      durationMs: (r.started_at != null && r.finished_at != null)
        ? (r.finished_at - r.started_at)
        : null,
      summary: r.summary,
    }));
  },

  async failPhase(jobId: string, phase: string, error: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE pipeline_phases SET state = 'failed', finished_at = ?, error = ? WHERE job_id = ? AND phase = ?`,
      [Date.now(), error, jobId, phase]
    );
  },

  // ── Units ────────────────────────────────────────────────────


  // ── Investigations ──────────────────────────────────────────


  async getFullAnswer(id: string): Promise<string> {
    const db = await getDb();
    const r = await db.getFirstAsync<{ final_answer: string }>(
      `SELECT final_answer FROM finding_investigations WHERE id = ?`, [id]
    );
    return r?.final_answer ?? '';
  },

  // ── Agent steps (for the UI step trace) ─────────────────────

  // ── Job-level raw final answer log (for parse-fail diagnostics) ──
  async logRawAnswer(jobId: string, phase: string, raw: string): Promise<void> {
    try {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO event_log (ts, job_id, phase, function_id, severity, action, payload_json)
         VALUES (?,?,?,?,?,?,?)`,
        [
          Date.now(), jobId, phase, 'orchestration_logs', 'warn',
          'raw_answer_unparseable',
          JSON.stringify({ chars: raw.length, preview: raw.slice(0, 600) }),
        ]
      );
    } catch {}
  },

};
