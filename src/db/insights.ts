import { getDb } from './client';
import type { InsightRecord } from './schema';
import type { FeatureInsight } from '@/api/factory';

export async function saveInsight(
  scanId: string,
  featureId: string,
  insight: FeatureInsight,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO finding_insights (
      scanId, featureId, purpose, howItWorks, risk, riskReason,
      technical, recommendation, patchHint, createdAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      scanId, featureId,
      insight.purpose, insight.howItWorks, insight.risk, insight.riskReason,
      JSON.stringify(insight.technical), insight.recommendation, insight.patchHint,
      Date.now(),
    ],
  );
}

export async function getInsight(
  scanId: string,
  featureId: string,
): Promise<FeatureInsight | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<InsightRecord>(
    `SELECT * FROM finding_insights WHERE scanId = ? AND featureId = ?`,
    [scanId, featureId],
  );
  if (!row) return null;
  return {
    purpose: row.purpose,
    howItWorks: row.howItWorks,
    risk: row.risk as FeatureInsight['risk'],
    riskReason: row.riskReason,
    technical: JSON.parse(row.technical || '[]'),
    recommendation: row.recommendation,
    patchHint: row.patchHint,
  };
}

export async function listInsights(
  scanId: string,
): Promise<Record<string, FeatureInsight>> {
  const db = await getDb();
  const rows = await db.getAllAsync<InsightRecord>(
    `SELECT * FROM finding_insights WHERE scanId = ?`,
    [scanId],
  );
  const out: Record<string, FeatureInsight> = {};
  for (const r of rows) {
    out[r.featureId] = {
      purpose: r.purpose,
      howItWorks: r.howItWorks,
      risk: r.risk as FeatureInsight['risk'],
      riskReason: r.riskReason,
      technical: JSON.parse(r.technical || '[]'),
      recommendation: r.recommendation,
      patchHint: r.patchHint,
    };
  }
  return out;
}

export async function deleteInsight(scanId: string, featureId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM finding_insights WHERE scanId = ? AND featureId = ?`,
    [scanId, featureId],
  );
}
