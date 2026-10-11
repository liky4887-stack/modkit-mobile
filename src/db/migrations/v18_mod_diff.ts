// v18: mod-diff pipeline.
//
// Adds the state needed for the deterministic import → decompile →
// diff → modBots → review_gate → revert → export → audit chain.
//
// - pipeline_jobs gets two new columns:
//     modified_apk_path — the second APK (the candidate being diffed)
//     review_state      — 'pending' | 'decided' (for the review gate)
//
// - new `modifications` table: one row per diff-discovered modification.
//   The review gate flips `reverted` per item; the revert phase reads
//   only items with reverted=1 and produces a clean APK.
export const MIGRATION_V18 = `
ALTER TABLE pipeline_jobs ADD COLUMN modified_apk_path TEXT;
ALTER TABLE pipeline_jobs ADD COLUMN review_state TEXT NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS modifications (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL,
  type            TEXT NOT NULL,       -- ADDED | REMOVED | MODIFIED
  kind            TEXT NOT NULL,       -- class | method | resource | permission | component | native | dex
  target          TEXT NOT NULL,
  original        TEXT,
  modified        TEXT,
  original_hash   TEXT,
  modified_hash   TEXT,
  reverted        INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (job_id) REFERENCES pipeline_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mods_job      ON modifications(job_id);
CREATE INDEX IF NOT EXISTS idx_mods_reverted ON modifications(job_id, reverted);
CREATE INDEX IF NOT EXISTS idx_mods_kind     ON modifications(job_id, kind);
`;
