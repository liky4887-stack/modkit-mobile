import { getDb } from './client';
import type { EditRecord } from './schema';
import type { FeatureEdit } from '@/api/factory';

export async function saveEdit(
  scanId: string,
  featureId: string,
  edit: FeatureEdit,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO finding_edits (
      scanId, featureId, approach, target, method, language,
      payload, before, after, impact, verification, risk, createdAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      scanId, featureId, edit.approach, edit.target, edit.method, edit.language,
      edit.payload, edit.before, edit.after, edit.impact, edit.verification, edit.risk,
      Date.now(),
    ],
  );
}

export async function getEdit(
  scanId: string,
  featureId: string,
): Promise<FeatureEdit | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<EditRecord>(
    `SELECT * FROM finding_edits WHERE scanId = ? AND featureId = ?`,
    [scanId, featureId],
  );
  if (!row) return null;
  return {
    approach: row.approach as FeatureEdit['approach'],
    target: row.target,
    method: row.method,
    language: row.language as FeatureEdit['language'],
    payload: row.payload,
    before: row.before,
    after: row.after,
    impact: row.impact,
    verification: row.verification,
    risk: row.risk as FeatureEdit['risk'],
  };
}

export async function listEdits(scanId: string): Promise<Record<string, FeatureEdit>> {
  const db = await getDb();
  const rows = await db.getAllAsync<EditRecord>(
    `SELECT * FROM finding_edits WHERE scanId = ?`,
    [scanId],
  );
  const out: Record<string, FeatureEdit> = {};
  for (const r of rows) {
    out[r.featureId] = {
      approach: r.approach as FeatureEdit['approach'],
      target: r.target,
      method: r.method,
      language: r.language as FeatureEdit['language'],
      payload: r.payload,
      before: r.before,
      after: r.after,
      impact: r.impact,
      verification: r.verification,
      risk: r.risk as FeatureEdit['risk'],
    };
  }
  return out;
}

export async function deleteEdit(scanId: string, featureId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM finding_edits WHERE scanId = ? AND featureId = ?`,
    [scanId, featureId],
  );
}
