// v9 — monitoring: persist eventBus, httpLog, periodic health metrics.

export const MIGRATION_V9 = `
CREATE TABLE IF NOT EXISTS event_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,
  job_id        TEXT,
  phase         TEXT,
  function_id   TEXT NOT NULL,
  severity      TEXT NOT NULL,
  action        TEXT,
  payload_json  TEXT,
  correlation   TEXT
);

CREATE INDEX IF NOT EXISTS idx_eventlog_ts     ON event_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_eventlog_job    ON event_log(job_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_eventlog_sev    ON event_log(severity, ts DESC);

CREATE TABLE IF NOT EXISTS http_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,
  job_id        TEXT,
  method        TEXT NOT NULL,
  url           TEXT NOT NULL,
  path          TEXT,
  req_preview   TEXT,
  res_status    INTEGER,
  res_preview   TEXT,
  duration_ms   INTEGER NOT NULL,
  error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_httplog_ts     ON http_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_httplog_job    ON http_log(job_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_httplog_status ON http_log(res_status, ts DESC);

CREATE TABLE IF NOT EXISTS metric_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              INTEGER NOT NULL,
  job_id          TEXT,
  backend_ok      INTEGER,
  bearer_valid    INTEGER,
  cookies_len     INTEGER,
  active_chats    INTEGER DEFAULT 0,
  queued_units    INTEGER DEFAULT 0,
  running_units   INTEGER DEFAULT 0,
  done_units      INTEGER DEFAULT 0,
  failed_units    INTEGER DEFAULT 0,
  ds_calls_1m     INTEGER DEFAULT 0,
  ds_elapsed_1m   INTEGER DEFAULT 0,
  events_1m       INTEGER DEFAULT 0,
  errors_1m       INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_metrics_ts  ON metric_snapshots(ts DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_job ON metric_snapshots(job_id, ts DESC);
`;
