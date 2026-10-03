import { getDb } from './client';
import type { PreviewRecord } from './schema';
import type { FeaturePreview } from '@/api/factory';

export async function savePreview(scanId: string, featureId: string, preview: FeaturePreview): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO finding_previews (
      scanId, featureId, scenario, ifApplied, ifNotApplied, sideEffects,
      confidence, recommendation, createdAt
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
    [scanId, featureId, preview.scenario, JSON.stringify(preview.ifApplied),
     JSON.stringify(preview.ifNotApplied), JSON.stringify(preview.sideEffects),
     preview.confidence, preview.recommendation, Date.now()],
  );
}

export async function getPreview(scanId: string, featureId: string): Promise<FeaturePreview | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<PreviewRecord>(
    `SELECT * FROM finding_previews WHERE scanId = ? AND featureId = ?`, [scanId, featureId],
  );
  if (!r) return null;
  return {
    scenario: r.scenario,
    ifApplied: JSON.parse(r.ifApplied || '[]'),
    ifNotApplied: JSON.parse(r.ifNotApplied || '[]'),
    sideEffects: JSON.parse(r.sideEffects || '[]'),
    confidence: r.confidence as FeaturePreview['confidence'],
    recommendation: r.recommendation,
  };
}
