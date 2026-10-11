// v17: review gate + archive.
//
// review_state tracks the human decision made in the FINDINGS UI:
//   pending   — no decision yet
//   test      — user wants this finding tested/patched
//   hide      — kept in findings, hidden from default views
//   skip      — ignored entirely
//   archived  — copied to findings_archive, permanent record
//
// applied_state (v16) tracks the executor lifecycle separately.
// review_state is the human gate; applied_state is the machine gate.
export const MIGRATION_V17 = `
ALTER TABLE findings ADD COLUMN review_state TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE findings ADD COLUMN reviewed_at INTEGER;
ALTER TABLE findings ADD COLUMN archived_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_findings_review_state
  ON findings(job_id, review_state);

CREATE INDEX IF NOT EXISTS idx_findings_archived
  ON findings(job_id, archived_at);

CREATE TABLE IF NOT EXISTS findings_archive (
  id              TEXT PRIMARY KEY,
  original_id     TEXT NOT NULL,
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
  applied_state   TEXT,
  review_state    TEXT,
  decision_note   TEXT,
  finding_created_at  INTEGER,
  archived_at         INTEGER NOT NULL,
  archived_reason     TEXT
);

CREATE INDEX IF NOT EXISTS idx_archive_job ON findings_archive(job_id, archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_archive_original ON findings_archive(original_id);
`;
