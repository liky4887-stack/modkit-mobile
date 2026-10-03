// v11 — class data: parsed class metadata + cross-references.

export const MIGRATION_V11 = `
CREATE TABLE IF NOT EXISTS class_cache (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id       TEXT NOT NULL,
  fqcn          TEXT NOT NULL,
  package       TEXT,
  simple_name   TEXT,
  dex_file      TEXT,
  dex_size      INTEGER,
  method_count  INTEGER DEFAULT 0,
  field_count   INTEGER DEFAULT 0,
  string_count  INTEGER DEFAULT 0,
  strings_json  TEXT,
  first_seen_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_classcache_unique ON class_cache(scan_id, fqcn);
CREATE INDEX IF NOT EXISTS idx_classcache_pkg    ON class_cache(scan_id, package);
CREATE INDEX IF NOT EXISTS idx_classcache_dex    ON class_cache(scan_id, dex_file);
CREATE INDEX IF NOT EXISTS idx_classcache_simple ON class_cache(scan_id, simple_name);

CREATE TABLE IF NOT EXISTS dependency_index (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id      TEXT NOT NULL,
  source_class TEXT NOT NULL,
  target_class TEXT NOT NULL,
  kind         TEXT NOT NULL,
  evidence     TEXT,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_depindex_scan_src ON dependency_index(scan_id, source_class);
CREATE INDEX IF NOT EXISTS idx_depindex_scan_tgt ON dependency_index(scan_id, target_class);
CREATE INDEX IF NOT EXISTS idx_depindex_kind     ON dependency_index(scan_id, kind);

CREATE TABLE IF NOT EXISTS method_cache (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id      TEXT NOT NULL,
  owner_class  TEXT NOT NULL,
  name         TEXT NOT NULL,
  signature    TEXT,
  params       TEXT,
  return_type  TEXT
);

CREATE INDEX IF NOT EXISTS idx_methodcache_class ON method_cache(scan_id, owner_class);
CREATE INDEX IF NOT EXISTS idx_methodcache_name  ON method_cache(scan_id, name);
`;
