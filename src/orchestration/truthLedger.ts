import * as SQLite from 'expo-sqlite';
import { OffsetRange, PhaseId } from './types';
import { eventBus } from './eventBus';

export interface LedgerEntry {
  correlationId: string;
  scanId: string;
  phase: PhaseId;
  sourceSegment: string;
  targetOffsets: OffsetRange[];
  rationale: string;
  beforeHash: string;
  afterHash: string;
  validationOutcome?: 'pending' | 'passed' | 'failed' | 'rolled_back';
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function db(): Promise<SQLite.SQLiteDatabase> {
  return SQLite.openDatabaseAsync('modkit.db');
}

export const truthLedger = {
  async record(entry: LedgerEntry): Promise<string> {
    const id = uuid();
    const d = await db();
    await d.runAsync(
      `INSERT INTO truth_ledger
       (id, correlation_id, scan_id, phase, source_segment, target_offsets,
        rationale, before_hash, after_hash, validation_outcome, applied, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,?)`,
      [
        id, entry.correlationId, entry.scanId, entry.phase, entry.sourceSegment,
        JSON.stringify(entry.targetOffsets), entry.rationale,
        entry.beforeHash, entry.afterHash,
        entry.validationOutcome ?? 'pending', Date.now(),
      ]
    );
    eventBus.emit({
      scanId: entry.scanId,
      correlationId: entry.correlationId,
      phase: entry.phase,
      functionId: 'truth_ledger',
      severity: 'info',
      payload: { action: 'record', ledgerId: id, segment: entry.sourceSegment },
    });
    return id;
  },

  async getByScan(scanId: string): Promise<any[]> {
    const d = await db();
    return d.getAllAsync(`SELECT * FROM truth_ledger WHERE scan_id = ? ORDER BY created_at ASC`, [scanId]);
  },

  async getBySegment(segmentId: string): Promise<any[]> {
    const d = await db();
    return d.getAllAsync(`SELECT * FROM truth_ledger WHERE source_segment = ? ORDER BY created_at ASC`, [segmentId]);
  },

  async markValidated(id: string, outcome: 'passed' | 'failed' | 'rolled_back'): Promise<void> {
    const d = await db();
    await d.runAsync(
      `UPDATE truth_ledger SET validation_outcome = ?, applied = CASE WHEN ? = 'passed' THEN 1 ELSE 0 END WHERE id = ?`,
      [outcome, outcome, id]
    );
  },

  async rollback(id: string): Promise<void> {
    const d = await db();
    await d.runAsync(
      `UPDATE truth_ledger SET validation_outcome = 'rolled_back', applied = 0, rolled_back_at = ? WHERE id = ?`,
      [Date.now(), id]
    );
  },

  async detectConflicts(scanId: string): Promise<Array<{ a: any; b: any }>> {
    const rows = await this.getByScan(scanId);
    const conflicts: Array<{ a: any; b: any }> = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const aOff = JSON.parse(rows[i].target_offsets || '[]') as OffsetRange[];
        const bOff = JSON.parse(rows[j].target_offsets || '[]') as OffsetRange[];
        const overlap = aOff.some(a => bOff.some(b => a.start < b.end && b.start < a.end));
        if (overlap) conflicts.push({ a: rows[i], b: rows[j] });
      }
    }
    return conflicts;
  },
};
