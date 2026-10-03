import * as SQLite from 'expo-sqlite';
import { PhaseId, SegmentStatus } from './types';

async function db() { return SQLite.openDatabaseAsync('modkit.db'); }

export interface ProgressSnapshot {
  overall: number;
  byPhase: Record<string, number>;
  bySegment: Record<string, { status: SegmentStatus; weight: number; startedAt?: number; completedAt?: number }>;
  criticalPath: string[];
  estimatedRemainingMs: number;
}

export const progressTracker = {
  async upsertSegment(args: {
    segmentId: string; scanId: string; phase: PhaseId;
    workerId?: string; tokenBudget?: number;
  }): Promise<void> {
    const d = await db();
    await d.runAsync(
      `INSERT INTO orchestration_state
        (segment_id, scan_id, phase, worker_id, status, token_budget, checkpoint_at)
       VALUES (?,?,?,?, 'pending', ?, ?)
       ON CONFLICT(segment_id) DO UPDATE SET
         worker_id = excluded.worker_id,
         token_budget = excluded.token_budget,
         checkpoint_at = excluded.checkpoint_at`,
      [args.segmentId, args.scanId, args.phase, args.workerId ?? null, args.tokenBudget ?? 0, Date.now()]
    );
  },

  async updateStatus(segmentId: string, status: SegmentStatus, tokenUsed?: number): Promise<void> {
    const d = await db();
    const completedAt = status === 'completed' ? Date.now() : null;
    await d.runAsync(
      `UPDATE orchestration_state
         SET status = ?, token_used = COALESCE(?, token_used),
             checkpoint_at = ?, completed_at = COALESCE(?, completed_at)
       WHERE segment_id = ?`,
      [status, tokenUsed ?? null, Date.now(), completedAt, segmentId]
    );
  },

  async snapshot(scanId: string): Promise<ProgressSnapshot> {
    const d = await db();
    const rows = await d.getAllAsync<any>(
      `SELECT * FROM orchestration_state WHERE scan_id = ?`, [scanId]
    );
    const totalWeight = rows.reduce((s, r) => s + (r.token_budget || 0), 0) || rows.length || 1;
    const completedWeight = rows
      .filter(r => r.status === 'completed')
      .reduce((s, r) => s + (r.token_budget || 0), 0);

    const byPhase: Record<string, number> = {};
    const phases = Array.from(new Set(rows.map(r => r.phase)));
    for (const p of phases) {
      const segs = rows.filter(r => r.phase === p);
      const tw = segs.reduce((s, r) => s + (r.token_budget || 0), 0) || segs.length || 1;
      const cw = segs.filter(r => r.status === 'completed').reduce((s, r) => s + (r.token_budget || 0), 0);
      byPhase[p] = (cw / tw) * 100;
    }

    return {
      overall: (completedWeight / totalWeight) * 100,
      byPhase,
      bySegment: Object.fromEntries(rows.map(r => [r.segment_id, {
        status: r.status as SegmentStatus,
        weight: r.token_budget || 0,
        startedAt: r.checkpoint_at ?? undefined,
        completedAt: r.completed_at ?? undefined,
      }])),
      criticalPath: rows.filter(r => r.status !== 'completed').map(r => r.segment_id),
      estimatedRemainingMs: 0,
    };
  },
};
