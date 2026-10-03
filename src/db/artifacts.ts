import { getDb } from './client';
import type { ArtifactRecord } from './schema';
import type { FeatureArtifact } from '@/api/factory';

export async function saveArtifact(scanId: string, featureId: string, a: FeatureArtifact): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO finding_artifacts (
      scanId, featureId, name, type, contents, installInstructions, verification,
      dependencies, risk, sizeBytes, checksum, createdAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [scanId, featureId, a.name, a.type, a.contents, a.installInstructions,
     a.verification, JSON.stringify(a.dependencies), a.risk,
     a.sizeBytes ?? a.contents.length, a.checksum ?? '', Date.now()],
  );
}

export async function getArtifact(scanId: string, featureId: string): Promise<FeatureArtifact | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<ArtifactRecord>(
    `SELECT * FROM finding_artifacts WHERE scanId = ? AND featureId = ?`, [scanId, featureId],
  );
  if (!r) return null;
  return {
    name: r.name,
    type: r.type as FeatureArtifact['type'],
    contents: r.contents,
    installInstructions: r.installInstructions,
    verification: r.verification,
    dependencies: JSON.parse(r.dependencies || '[]'),
    risk: r.risk as FeatureArtifact['risk'],
    sizeBytes: r.sizeBytes,
    checksum: r.checksum,
  };
}
