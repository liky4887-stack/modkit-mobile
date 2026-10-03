// v10 — chat architecture: every DeepSeek session + every turn persisted.

export const MIGRATION_V10 = `
CREATE TABLE IF NOT EXISTS pipeline_chats (
  id              TEXT PRIMARY KEY,
  job_id          TEXT,
  unit_id         TEXT,
  phase           TEXT NOT NULL,
  purpose         TEXT,
  ds_session_id   TEXT,
  state           TEXT NOT NULL,
  turns           INTEGER DEFAULT 0,
  tokens_in       INTEGER DEFAULT 0,
  tokens_out      INTEGER DEFAULT 0,
  elapsed_ms      INTEGER DEFAULT 0,
  last_turn_at    INTEGER,
  started_at      INTEGER NOT NULL,
  finished_at     INTEGER,
  error           TEXT,
  model           TEXT,
  prompt_version  TEXT
);

CREATE INDEX IF NOT EXISTS idx_chats_job    ON pipeline_chats(job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_unit   ON pipeline_chats(unit_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_state  ON pipeline_chats(state, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_phase  ON pipeline_chats(phase, started_at DESC);

CREATE TABLE IF NOT EXISTS pipeline_chat_turns (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id         TEXT NOT NULL,
  job_id          TEXT,
  ts              INTEGER NOT NULL,
  turn_index      INTEGER NOT NULL,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  tokens          INTEGER DEFAULT 0,
  ds_session_id   TEXT,
  elapsed_ms      INTEGER DEFAULT 0,
  error           TEXT,
  FOREIGN KEY (chat_id) REFERENCES pipeline_chats(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_turns_chat ON pipeline_chat_turns(chat_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_turns_ts   ON pipeline_chat_turns(ts DESC);
`;
