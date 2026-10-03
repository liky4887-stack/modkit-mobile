// v12 — pipeline agent integration: persist investigation results and
// per-phase agent step traces so the JOBS tab can show live progress.

export const MIGRATION_V12 = `
CREATE TABLE IF NOT EXISTS finding_investigations (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL,
  unit_id         TEXT,
  phase           TEXT NOT NULL,
  query           TEXT NOT NULL,
  final_answer    TEXT,
  tool_call_count INTEGER DEFAULT 0,
  total_ms        INTEGER DEFAULT 0,
  chat_id         TEXT,
  ds_session_id   TEXT,
  steps_json      TEXT,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (job_id) REFERENCES pipeline_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_investigations_job ON finding_investigations(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_investigations_unit ON finding_investigations(unit_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_steps (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        TEXT NOT NULL,
  investigation_id TEXT,
  phase         TEXT NOT NULL,
  iteration     INTEGER NOT NULL,
  kind          TEXT NOT NULL,
  tool          TEXT,
  args_json     TEXT,
  result_chars  INTEGER DEFAULT 0,
  elapsed_ms    INTEGER DEFAULT 0,
  ts            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agentsteps_job ON agent_steps(job_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_agentsteps_inv ON agent_steps(investigation_id, iteration);
`;
