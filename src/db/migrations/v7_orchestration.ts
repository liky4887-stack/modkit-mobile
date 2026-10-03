// v7: orchestration graph tables
// Six tables: truth_ledger, dependency_map, orchestration_state,
// collision_log, healing_cycles, cross_session_knowledge

export const MIGRATION_V7 = `
CREATE TABLE IF NOT EXISTS truth_ledger (
  id TEXT PRIMARY KEY,
  correlation_id TEXT NOT NULL,
  scan_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  source_segment TEXT,
  target_offsets TEXT,
  rationale TEXT,
  before_hash TEXT,
  after_hash TEXT,
  validation_outcome TEXT DEFAULT 'pending',
  applied INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  rolled_back_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ledger_correlation ON truth_ledger(correlation_id);
CREATE INDEX IF NOT EXISTS idx_ledger_scan ON truth_ledger(scan_id);
CREATE INDEX IF NOT EXISTS idx_ledger_segment ON truth_ledger(source_segment);

CREATE TABLE IF NOT EXISTS dependency_map (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  source_asset TEXT NOT NULL,
  target_asset TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  constraints TEXT,
  verified INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_depmap_scan ON dependency_map(scan_id);
CREATE INDEX IF NOT EXISTS idx_depmap_source ON dependency_map(source_asset);

CREATE TABLE IF NOT EXISTS orchestration_state (
  segment_id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  worker_id TEXT,
  status TEXT DEFAULT 'pending',
  token_budget INTEGER DEFAULT 0,
  token_used INTEGER DEFAULT 0,
  partial_result TEXT,
  checkpoint_at INTEGER,
  completed_at INTEGER,
  retry_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_state_scan_phase ON orchestration_state(scan_id, phase);
CREATE INDEX IF NOT EXISTS idx_state_status ON orchestration_state(status);

CREATE TABLE IF NOT EXISTS collision_log (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  segment_id TEXT NOT NULL,
  worker_a TEXT NOT NULL,
  worker_b TEXT NOT NULL,
  overlap_offsets TEXT,
  arbitration_rule TEXT,
  resolution TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_collision_scan ON collision_log(scan_id);
CREATE INDEX IF NOT EXISTS idx_collision_segment ON collision_log(segment_id);

CREATE TABLE IF NOT EXISTS healing_cycles (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  affected_segments TEXT,
  remediation_plan TEXT,
  result TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_healing_scan ON healing_cycles(scan_id);

CREATE TABLE IF NOT EXISTS cross_session_knowledge (
  id TEXT PRIMARY KEY,
  constraint_type TEXT NOT NULL,
  description TEXT,
  encountered_by TEXT,
  affected_segments TEXT,
  strategy_adjustment TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_type ON cross_session_knowledge(constraint_type);
`;
