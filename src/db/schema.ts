// SQLite schema + migration steps for the scan history database.
// Bump SCHEMA_VERSION whenever the shape changes; migrations run in order.

export const SCHEMA_VERSION = 2;
export const DB_NAME = 'modkit.db';

export interface ScanRecord {
  id: string;
  apkPath: string;
  apkName: string;
  apkSize: number;
  apkHash: string;
  scannedAt: number;
  elapsedMs: number;
  dexTotal: number;
  dexParsed: number;
  totalClasses: number;
  featureCount: number;
  hitFeatureCount: number;
  featureSummary: string;
  patchPlan: string | null;
  reportGoal: string | null;
  notes: string | null;
}

export interface FeatureRecord {
  id: number;
  scanId: string;
  featureId: string;
  status: string;
  message: string;
  totalHits: number;
  dexCount: number;
  patterns: string;
  topSignalClass: string | null;
  rawJson: string;
}

export interface ChatRecord {
  id: number;
  scanId: string;
  featureId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export const MIGRATIONS: string[][] = [
  // v1
  [
    `CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY NOT NULL,
      apkPath TEXT NOT NULL,
      apkName TEXT NOT NULL,
      apkSize INTEGER NOT NULL,
      apkHash TEXT NOT NULL,
      scannedAt INTEGER NOT NULL,
      elapsedMs INTEGER NOT NULL,
      dexTotal INTEGER NOT NULL,
      dexParsed INTEGER NOT NULL,
      totalClasses INTEGER NOT NULL,
      featureCount INTEGER NOT NULL,
      hitFeatureCount INTEGER NOT NULL,
      featureSummary TEXT NOT NULL,
      patchPlan TEXT,
      reportGoal TEXT,
      notes TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS idx_scans_apkHash ON scans(apkHash);`,
    `CREATE INDEX IF NOT EXISTS idx_scans_scannedAt ON scans(scannedAt DESC);`,

    `CREATE TABLE IF NOT EXISTS scan_features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scanId TEXT NOT NULL,
      featureId TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      totalHits INTEGER NOT NULL,
      dexCount INTEGER NOT NULL,
      patterns TEXT NOT NULL,
      topSignalClass TEXT,
      rawJson TEXT NOT NULL,
      FOREIGN KEY (scanId) REFERENCES scans(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS idx_scan_features_scanId ON scan_features(scanId);`,
    `CREATE INDEX IF NOT EXISTS idx_scan_features_featureId ON scan_features(featureId);`,
  ],
  // v2 — multi-turn chat threads on findings
  [
    `CREATE TABLE IF NOT EXISTS finding_chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scanId TEXT NOT NULL,
      featureId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (scanId) REFERENCES scans(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS idx_finding_chats_thread ON finding_chats(scanId, featureId, createdAt);`,
  ],
];
