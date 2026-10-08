// v13 — pipeline artifacts: real files on disk, recorded in SQLite.

export const MIGRATION_V13 = `
CREATE TABLE IF NOT EXISTS finding_artifacts (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL,
  investigation_id TEXT,
  phase           TEXT NOT NULL,
  title           TEXT,
  kind            TEXT DEFAULT 'markdown',
  file_path       TEXT NOT NULL,
  size_bytes      INTEGER DEFAULT 0,
  sha256          TEXT,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (job_id) REFERENCES pipeline_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artifacts_job ON finding_artifacts(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_inv ON finding_artifacts(investigation_id);
`;
