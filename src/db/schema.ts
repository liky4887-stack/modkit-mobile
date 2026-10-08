import { MIGRATION_V15 } from './migrations/v15_verify';
import { MIGRATION_V14 } from './migrations/v14_artifacts_rebuild';
import { MIGRATION_V13 } from './migrations/v13_artifacts';
import { MIGRATION_V12 } from './migrations/v12_agent';
import { MIGRATION_V11 } from './migrations/v11_classdata';
import { MIGRATION_V10 } from './migrations/v10_chats';
import { MIGRATION_V9 } from './migrations/v9_monitoring';
import { MIGRATION_V8 } from './migrations/v8_pipeline';
import { MIGRATION_V7 } from './migrations/v7_orchestration';
// SQLite schema + migration steps for the scan history database.
// Bump SCHEMA_VERSION whenever the shape changes; migrations run in order.

export const SCHEMA_VERSION = 15;
export const DB_NAME = 'modkit-v2.db';

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

export interface InsightRecord {
  id: number;
  scanId: string;
  featureId: string;
  purpose: string;
  howItWorks: string;
  risk: string;
  riskReason: string;
  technical: string;
  recommendation: string;
  patchHint: string;
  createdAt: number;
}

export interface EditRecord {
  id: number;
  scanId: string;
  featureId: string;
  approach: string;
  target: string;
  method: string;
  language: string;
  payload: string;
  before: string;
  after: string;
  impact: string;
  verification: string;
  risk: string;
  createdAt: number;
}

export interface PreviewRecord {
  id: number;
  scanId: string;
  featureId: string;
  scenario: string;
  ifApplied: string;
  ifNotApplied: string;
  sideEffects: string;
  confidence: string;
  recommendation: string;
  createdAt: number;
}

export interface ArtifactRecord {
  id: number;
  scanId: string;
  featureId: string;
  name: string;
  type: string;
  contents: string;
  installInstructions: string;
  verification: string;
  dependencies: string;
  risk: string;
  sizeBytes: number;
  checksum: string;
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
  // v3 — per-feature DeepSeek insights
  [
    `CREATE TABLE IF NOT EXISTS finding_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scanId TEXT NOT NULL,
      featureId TEXT NOT NULL,
      purpose TEXT NOT NULL,
      howItWorks TEXT NOT NULL,
      risk TEXT NOT NULL,
      riskReason TEXT NOT NULL,
      technical TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      patchHint TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (scanId) REFERENCES scans(id) ON DELETE CASCADE
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_finding_insights_unique ON finding_insights(scanId, featureId);`,
  ],
  // v4 — per-feature patch payloads (Edit phase)
  [
    `CREATE TABLE IF NOT EXISTS finding_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scanId TEXT NOT NULL,
      featureId TEXT NOT NULL,
      approach TEXT NOT NULL,
      target TEXT NOT NULL,
      method TEXT NOT NULL,
      language TEXT NOT NULL,
      payload TEXT NOT NULL,
      before TEXT NOT NULL,
      after TEXT NOT NULL,
      impact TEXT NOT NULL,
      verification TEXT NOT NULL,
      risk TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (scanId) REFERENCES scans(id) ON DELETE CASCADE
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_finding_edits_unique ON finding_edits(scanId, featureId);`,
  ],
  // v5 — per-feature previews
  [
    `CREATE TABLE IF NOT EXISTS finding_previews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scanId TEXT NOT NULL,
      featureId TEXT NOT NULL,
      scenario TEXT NOT NULL,
      ifApplied TEXT NOT NULL,
      ifNotApplied TEXT NOT NULL,
      sideEffects TEXT NOT NULL,
      confidence TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (scanId) REFERENCES scans(id) ON DELETE CASCADE
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_finding_previews_unique ON finding_previews(scanId, featureId);`,
  ],
  // v6 — per-feature export artifacts
  [
    `CREATE TABLE IF NOT EXISTS finding_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scanId TEXT NOT NULL,
      featureId TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      contents TEXT NOT NULL,
      installInstructions TEXT NOT NULL,
      verification TEXT NOT NULL,
      dependencies TEXT NOT NULL,
      risk TEXT NOT NULL,
      sizeBytes INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (scanId) REFERENCES scans(id) ON DELETE CASCADE
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_finding_artifacts_unique ON finding_artifacts(scanId, featureId);`,
  ],
  // v7 — orchestration graph
  [MIGRATION_V7],
  // v8 — pipeline core
  [MIGRATION_V8],
  // v9 — monitoring
  [MIGRATION_V9],
  // v10 — chat architecture
  [MIGRATION_V10],
  // v11 — class data
  [MIGRATION_V11],
  // v12 — agent integration
  [MIGRATION_V12],
  // v13 — pipeline artifacts
  [MIGRATION_V13],
  // v14 — artifacts table rebuild
  [MIGRATION_V14],
  // v15 — verification + prompt versioning
  [MIGRATION_V15],
];
