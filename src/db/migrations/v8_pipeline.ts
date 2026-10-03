// v8 — pipeline core: jobs, phases, units, features.
// One row per RUN → one row per phase → one row per unit → one row per feature.

export const MIGRATION_V8 = `
CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id              TEXT PRIMARY KEY,
  scan_id         TEXT,
  apk_path        TEXT NOT NULL,
  apk_name        TEXT,
  apk_size        INTEGER DEFAULT 0,
  apk_hash        TEXT,
  state           TEXT NOT NULL,
  current_phase   TEXT,
  current_feature TEXT,
  started_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  finished_at     INTEGER,
  error           TEXT,
  ds_calls        INTEGER DEFAULT 0,
  ds_elapsed_ms   INTEGER DEFAULT 0,
  ds_tokens       INTEGER DEFAULT 0,
  ds_last_session TEXT,
  priorities_json TEXT,
  queue_json      TEXT,
  plan_json       TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_state ON pipeline_jobs(state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_scan  ON pipeline_jobs(scan_id);

CREATE TABLE IF NOT EXISTS pipeline_phases (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL,
  phase       TEXT NOT NULL,
  state       TEXT NOT NULL,
  started_at  INTEGER,
  finished_at INTEGER,
  summary     TEXT,
  error       TEXT,
  FOREIGN KEY (job_id) REFERENCES pipeline_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_phases_job ON pipeline_phases(job_id, phase);

CREATE TABLE IF NOT EXISTS pipeline_units (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL,
  brief         TEXT,
  classes_json  TEXT,
  dex_files_json TEXT,
  state         TEXT NOT NULL,
  session_id    TEXT,
  turns         INTEGER DEFAULT 0,
  tokens        INTEGER DEFAULT 0,
  started_at    INTEGER,
  finished_at   INTEGER,
  error         TEXT,
  FOREIGN KEY (job_id) REFERENCES pipeline_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_units_job   ON pipeline_units(job_id, state);
CREATE INDEX IF NOT EXISTS idx_units_state ON pipeline_units(state);

CREATE TABLE IF NOT EXISTS pipeline_features (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL,
  phase         TEXT NOT NULL,
  feature_id    TEXT NOT NULL,
  state         TEXT NOT NULL,
  started_at    INTEGER,
  finished_at   INTEGER,
  duration_ms   INTEGER,
  status        TEXT,
  message       TEXT,
  ds_session_id TEXT,
  ds_elapsed_ms INTEGER,
  ds_tokens     INTEGER DEFAULT 0,
  data_json     TEXT,
  FOREIGN KEY (job_id) REFERENCES pipeline_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_features_job ON pipeline_features(job_id, phase, feature_id);
CREATE INDEX IF NOT EXISTS idx_features_state ON pipeline_features(state);
`;
