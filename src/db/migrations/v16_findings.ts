// v16: structured findings — severity, evidence, proposed patch,
// approval gate. Populated by the findings phase after coordinate.
export const MIGRATION_V16 = `
CREATE TABLE IF NOT EXISTS findings (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL,
  unit_id         TEXT,
  severity        TEXT NOT NULL,
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  risk            TEXT NOT NULL,
  evidence_class  TEXT,
  evidence_method TEXT,
  evidence_source TEXT,
  patch_json      TEXT NOT NULL,
  verification    TEXT,
  applied_state   TEXT NOT NULL DEFAULT 'pending',
  created_at      INTEGER NOT NULL,
  decided_at      INTEGER,
  decision_note   TEXT,
  FOREIGN KEY (job_id) REFERENCES pipeline_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_findings_job_state ON findings(job_id, applied_state);
CREATE INDEX IF NOT EXISTS idx_findings_severity  ON findings(severity);
CREATE INDEX IF NOT EXISTS idx_findings_unit      ON findings(unit_id);
`;
