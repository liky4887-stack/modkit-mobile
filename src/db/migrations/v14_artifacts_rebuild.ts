// v14 — force-rebuild artifacts table.
// The v13 table may exist in some test DBs with a mismatched column set,
// which makes the CREATE INDEX statements fail with "no such column: job_id".
// Dropping and recreating is safe during development; nothing depends on
// the old rows.

export const MIGRATION_V14 = `
DROP TABLE IF EXISTS finding_artifacts;
CREATE TABLE finding_artifacts (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL,
  investigation_id TEXT,
  phase           TEXT NOT NULL,
  title           TEXT,
  kind            TEXT DEFAULT 'markdown',
  file_path       TEXT NOT NULL,
  size_bytes      INTEGER DEFAULT 0,
  sha256          TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_artifacts_job ON finding_artifacts(job_id, created_at DESC);
CREATE INDEX idx_artifacts_inv ON finding_artifacts(investigation_id);
`;
