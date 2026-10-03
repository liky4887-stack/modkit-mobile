import * as SQLite from 'expo-sqlite';
import { eventBus } from './eventBus';

async function db() { return SQLite.openDatabaseAsync('modkit.db'); }

export const stateRecovery = {
  async checkpoint(segmentId: string, status: string, partial?: unknown): Promise<void> {
    const d = await db();
    await d.runAsync(
      `UPDATE orchestration_state
         SET status = ?, partial_result = ?, checkpoint_at = ?
       WHERE segment_id = ?`,
      [status, partial ? JSON.stringify(partial) : null, Date.now(), segmentId]
    );
  },

  async findOrphans(staleMs = 30000): Promise<any[]> {
    const d = await db();
    const cutoff = Date.now() - staleMs;
    return d.getAllAsync<any>(
      `SELECT * FROM orchestration_state
        WHERE status IN ('assigned','analyzing','transforming','validating')
          AND (checkpoint_at IS NULL OR checkpoint_at < ?)`,
      [cutoff]
    );
  },

  async bumpRetry(segmentId: string): Promise<number> {
    const d = await db();
    const row = await d.getFirstAsync<{ retry_count: number }>(
      `SELECT retry_count FROM orchestration_state WHERE segment_id = ?`, [segmentId]
    );
    const next = (row?.retry_count ?? 0) + 1;
    await d.runAsync(
      `UPDATE orchestration_state SET retry_count = ?, status = 'pending', checkpoint_at = ? WHERE segment_id = ?`,
      [next, Date.now(), segmentId]
    );
    return next;
  },

  async recoverOrphans(scanId: string, staleMs = 30000): Promise<string[]> {
    const orphans = await this.findOrphans(staleMs);
    const recovered: string[] = [];
    for (const o of orphans) {
      if (o.scan_id !== scanId) continue;
      const attempts = await this.bumpRetry(o.segment_id);
      eventBus.emit({
        scanId, correlationId: scanId, phase: 'recovery',
        functionId: 'state_recovery', severity: 'warn',
        payload: { action: 'recover_orphan', segmentId: o.segment_id, attempts },
      });
      recovered.push(o.segment_id);
    }
    return recovered;
  },
};
