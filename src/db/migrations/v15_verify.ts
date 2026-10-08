// v15 — verification records + prompt version tracking.
//
// finding_verifications: one row per propose→verify attempt.
// Records what was checked, what passed, what failed.
//
// prompt_versions: hash + text of every prompt template.
// Lets us correlate model output quality with the prompt that produced it.

export const MIGRATION_V15 = `
CREATE TABLE IF NOT EXISTS finding_verifications (
  id               TEXT PRIMARY KEY,
  job_id           TEXT NOT NULL,
  investigation_id TEXT,
  remediation_id   TEXT,
  phase            TEXT NOT NULL,
  target_class     TEXT,
  checks_json      TEXT,
  passed           INTEGER NOT NULL DEFAULT 0,
  failure_reasons  TEXT,
  self_critique    TEXT,
  created_at       INTEGER NOT NULL,
  FOREIGN KEY (job_id) REFERENCES pipeline_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_findver_job ON finding_verifications(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_findver_inv ON finding_verifications(investigation_id);
CREATE INDEX IF NOT EXISTS idx_findver_target ON finding_verifications(target_class);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id            TEXT PRIMARY KEY,
  scope         TEXT NOT NULL,
  version       TEXT NOT NULL,
  hash          TEXT NOT NULL,
  body          TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_promptver_scope ON prompt_versions(scope, version);
CREATE INDEX IF NOT EXISTS idx_promptver_hash  ON prompt_versions(hash);
`;
