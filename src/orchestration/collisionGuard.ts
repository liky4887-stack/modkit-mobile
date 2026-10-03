import * as SQLite from 'expo-sqlite';
import { OffsetRange, PhaseId } from './types';
import { eventBus } from './eventBus';

async function db() { return SQLite.openDatabaseAsync('modkit.db'); }

export interface CollisionProposal {
  scanId: string;
  correlationId: string;
  segmentId: string;
  workerId: string;
  phase: PhaseId;
  offsets: OffsetRange[];
  safetyScore: number;   // 0..1 from validation
}

export type CollisionAction = 'proceed' | 'merge' | 'reject' | 'escalate';

export interface CollisionResolution {
  action: CollisionAction;
  winner?: string;
  mergedOffsets?: OffsetRange[];
  reason: string;
}

const PHASE_PRIORITY: Record<string, number> = {
  validate: 100, export: 90, build: 80, edit: 70,
  preview: 60, analyze: 50, investigate: 40, import: 30,
};

function overlaps(a: OffsetRange[], b: OffsetRange[]): boolean {
  return a.some(x => b.some(y => x.start < y.end && y.start < x.end));
}

function mergeRanges(a: OffsetRange[], b: OffsetRange[]): OffsetRange[] {
  const all = [...a, ...b].sort((p, q) => p.start - q.start);
  const out: OffsetRange[] = [];
  for (const r of all) {
    if (out.length === 0) { out.push({ ...r }); continue; }
    const last = out[out.length - 1];
    if (r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

async function fetchActive(scanId: string): Promise<CollisionProposal[]> {
  const d = await db();
  const rows = await d.getAllAsync<any>(
    `SELECT id, correlation_id, scan_id, phase, source_segment, target_offsets
       FROM truth_ledger
      WHERE scan_id = ? AND applied = 1`,
    [scanId]
  );
  return rows.map(r => ({
    scanId: r.scan_id,
    correlationId: r.correlation_id,
    segmentId: r.source_segment,
    workerId: 'ledger',
    phase: r.phase as PhaseId,
    offsets: JSON.parse(r.target_offsets || '[]'),
    safetyScore: 1,
  }));
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const collisionGuard = {
  async check(proposal: CollisionProposal): Promise<CollisionResolution> {
    const active = await fetchActive(proposal.scanId);
    const conflicts = active.filter(a =>
      a.segmentId !== proposal.segmentId && overlaps(a.offsets, proposal.offsets)
    );

    if (conflicts.length === 0) {
      return { action: 'proceed', reason: 'no_overlap' };
    }

    // Arbitrate: safety score first, then phase priority, then timestamp (implicit order)
    let winner: CollisionProposal | null = null;
    let winnerScore = -Infinity;
    for (const c of conflicts) {
      const priority = PHASE_PRIORITY[c.phase] ?? 0;
      const score = c.safetyScore * 100 + priority;
      if (score > winnerScore) { winnerScore = score; winner = c; }
    }

    const proposalScore = proposal.safetyScore * 100 + (PHASE_PRIORITY[proposal.phase] ?? 0);

    let resolution: CollisionResolution;
    if (Math.abs(proposalScore - winnerScore) < 5) {
      resolution = {
        action: 'merge',
        mergedOffsets: mergeRanges(
          proposal.offsets,
          conflicts.flatMap(c => c.offsets)
        ),
        reason: 'close_scores_merged',
      };
    } else if (proposalScore > winnerScore) {
      resolution = { action: 'proceed', reason: 'proposal_wins_arbitration' };
    } else if (winnerScore - proposalScore > 30) {
      resolution = { action: 'reject', winner: winner?.workerId, reason: 'existing_dominates' };
    } else {
      resolution = { action: 'escalate', winner: winner?.workerId, reason: 'ambiguity_escalated' };
    }

    // Log collision
    const d = await db();
    for (const c of conflicts) {
      await d.runAsync(
        `INSERT INTO collision_log
           (id, scan_id, segment_id, worker_a, worker_b, overlap_offsets, arbitration_rule, resolution, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          uuid(), proposal.scanId, proposal.segmentId, proposal.workerId, c.workerId,
          JSON.stringify(proposal.offsets),
          `safety=${proposal.safetyScore} vs ${c.safetyScore}`,
          resolution.action,
          Date.now(),
        ]
      );
    }

    eventBus.emit({
      scanId: proposal.scanId,
      correlationId: proposal.correlationId,
      phase: proposal.phase,
      functionId: 'collision_guard',
      severity: resolution.action === 'reject' ? 'warn' : 'info',
      payload: { action: resolution.action, segmentId: proposal.segmentId, conflicts: conflicts.length },
    });

    return resolution;
  },
};
