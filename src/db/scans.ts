import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import type { ScanRecord, FeatureRecord } from './schema';

// Deterministic ID from time + hash
function newId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// Fingerprint an APK without reading the whole file into memory.
// SHA256( size || first 64KB || last 64KB || filename )
export async function fingerprintApk(
  apkPath: string,
  apkName: string,
  apkSize: number,
  firstChunk?: Uint8Array,
  lastChunk?: Uint8Array,
): Promise<string> {
  const parts: string[] = [
    String(apkSize),
    apkName,
    apkPath,
  ];
  if (firstChunk) parts.push(bytesToHex(firstChunk));
  if (lastChunk) parts.push(bytesToHex(lastChunk));
  const input = parts.join('|');
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i].toString(16);
    s += b.length === 1 ? '0' + b : b;
  }
  return s;
}

export interface SaveScanInput {
  apkPath: string;
  apkName: string;
  apkSize: number;
  apkHash: string;
  elapsedMs: number;
  dexTotal: number;
  dexParsed: number;
  totalClasses: number;
  features: Array<{
    featureId: string;
    status: string;
    message: string;
    totalHits: number;
    dexCount: number;
    patterns: string[];
    topSignalClass: string | null;
    rawJson?: unknown;
  }>;
  patchPlan?: string | null;
  reportGoal?: string | null;
}

export async function saveScan(input: SaveScanInput): Promise<string> {
  const db = await getDb();
  const id = newId();
  const scannedAt = Date.now();

  const hitFeatures = input.features.filter(f => f.totalHits > 0);
  const featureSummary = input.features
    .map(f => `${f.featureId}:${f.totalHits}`)
    .join(',');

  await db.runAsync(
    `INSERT INTO scans (
      id, apkPath, apkName, apkSize, apkHash, scannedAt, elapsedMs,
      dexTotal, dexParsed, totalClasses, featureCount, hitFeatureCount,
      featureSummary, patchPlan, reportGoal, notes
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      input.apkPath,
      input.apkName,
      input.apkSize,
      input.apkHash,
      scannedAt,
      input.elapsedMs,
      input.dexTotal,
      input.dexParsed,
      input.totalClasses,
      input.features.length,
      hitFeatures.length,
      featureSummary,
      input.patchPlan ?? null,
      input.reportGoal ?? null,
      null,
    ],
  );

  for (const f of input.features) {
    await db.runAsync(
      `INSERT INTO scan_features (
        scanId, featureId, status, message, totalHits, dexCount,
        patterns, topSignalClass, rawJson
      ) VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id,
        f.featureId,
        f.status,
        f.message,
        f.totalHits,
        f.dexCount,
        JSON.stringify(f.patterns),
        f.topSignalClass,
        JSON.stringify(f.rawJson ?? null),
      ],
    );
  }

  return id;
}

export async function listScans(limit = 50): Promise<ScanRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ScanRecord>(
    `SELECT * FROM scans ORDER BY scannedAt DESC LIMIT ?`,
    [limit],
  );
  return rows;
}

export async function getScan(id: string): Promise<ScanRecord | null> {
  const db = await getDb();
  return db.getFirstAsync<ScanRecord>(`SELECT * FROM scans WHERE id = ?`, [id]);
}

export async function getScanFeatures(scanId: string): Promise<FeatureRecord[]> {
  const db = await getDb();
  return db.getAllAsync<FeatureRecord>(
    `SELECT * FROM scan_features WHERE scanId = ? ORDER BY totalHits DESC`,
    [scanId],
  );
}

export async function updateScanPatchPlan(
  id: string,
  patchPlan: string,
  reportGoal: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE scans SET patchPlan = ?, reportGoal = ? WHERE id = ?`,
    [patchPlan, reportGoal, id],
  );
}

export async function updateScanNotes(id: string, notes: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE scans SET notes = ? WHERE id = ?`, [notes, id]);
}

export async function deleteScan(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM scans WHERE id = ?`, [id]);
}

export async function countScans(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM scans`);
  return row?.c ?? 0;
}
