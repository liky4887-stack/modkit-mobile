// Shared types for the pipeline resilience layer.
// Everything here is pure data — no side effects, no imports from
// the runner. This keeps the guard testable in isolation.

export type EndpointId =
  | 'deepseek/chat'
  | 'orchestration/sync'
  | 'executeCommand'
  | 'tools/load'
  | 'tools/find_classes_by_name'
  | 'tools/extract_iocs'
  | 'file/read'
  | 'file/write'
  | 'health'
  | 'unknown';

export type FailureModeId =
  | 'session_ceiling'       // DeepSeek session approaching turn cap
  | 'burst_rate_limit'      // too many calls in too short a window
  | 'empty_200'             // HTTP 200, zero content (WAF or ceiling)
  | 'bearer_expired'        // 401 / 40003
  | 'backend_unreachable'   // ECONNREFUSED / timeout to 127.0.0.1:8790
  | 'sidecar_down'          // tools 8792 refused
  | 'apk_unreadable'        // path missing or read error
  | 'db_locked'             // SQLite busy
  | 'unknown_5xx';          // 5xx without a more specific mode

export interface CallOutcome {
  endpoint: EndpointId;
  ok: boolean;
  status: number | null;
  elapsedMs: number;
  ts: number;
  failureMode: FailureModeId | null;
  error: string | null;
}

export interface Prediction {
  risk: number;             // 0..1
  mode: FailureModeId | null;
  reason: string;
  mitigation: MitigationId | null;
}

export type MitigationId =
  | 'rotate_session'
  | 'backoff'
  | 'refresh_creds'
  | 'pause_pipeline'
  | 'restart_sidecar'
  | 'fallback_engine'
  | 'block_and_surface'
  | 'noop';

export interface HealResult {
  mitigation: MitigationId;
  applied: boolean;
  detail: string;
  cooldownMs: number;
}

export interface GuardStatus {
  endpointStats: Array<{
    endpoint: EndpointId;
    calls: number;
    failures: number;
    successRate: number;
    p50Ms: number;
    p95Ms: number;
  }>;
  currentDelayMs: number;
  retryBudget: number;
  activeMitigations: Array<{ mitigation: MitigationId; until: number }>;
  recentHeals: HealResult[];
  risk: { score: number; topMode: FailureModeId | null };
  paused: boolean;
  pausedReason: string | null;
}
