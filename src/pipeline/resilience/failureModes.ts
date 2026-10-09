// Catalog of known failure modes and their default mitigations. The
// predictor classifies a call into one of these modes based on
// response signals; the healer picks the matching mitigation.
import type { FailureModeId, MitigationId } from './types';

export interface FailureMode {
  id: FailureModeId;
  description: string;
  mitigation: MitigationId;
  /** How long to suppress re-healing for the same mode after a heal. */
  cooldownMs: number;
}

export const FAILURE_MODES: Record<FailureModeId, FailureMode> = {
  session_ceiling: {
    id: 'session_ceiling',
    description: 'DeepSeek session approaching server-side context cap',
    mitigation: 'rotate_session',
    cooldownMs: 0, // rotate every time — cheap
  },
  burst_rate_limit: {
    id: 'burst_rate_limit',
    description: 'Too many calls in a short window; upstream WAF throttling',
    mitigation: 'backoff',
    cooldownMs: 3_000,
  },
  empty_200: {
    id: 'empty_200',
    description: 'HTTP 200 with empty content — WAF or context overflow',
    mitigation: 'fallback_engine',
    cooldownMs: 15_000,
  },
  bearer_expired: {
    id: 'bearer_expired',
    description: 'Authorization rejected — bearer token or cookie expired',
    mitigation: 'pause_pipeline',
    cooldownMs: 30_000,
  },
  backend_unreachable: {
    id: 'backend_unreachable',
    description: 'Backend on 127.0.0.1:8790 not accepting connections',
    mitigation: 'pause_pipeline',
    cooldownMs: 10_000,
  },
  sidecar_down: {
    id: 'sidecar_down',
    description: 'Tools sidecar on 8792 not accepting connections',
    mitigation: 'restart_sidecar',
    cooldownMs: 30_000,
  },
  apk_unreadable: {
    id: 'apk_unreadable',
    description: 'APK path missing or unreadable by backend',
    mitigation: 'block_and_surface',
    cooldownMs: 0,
  },
  db_locked: {
    id: 'db_locked',
    description: 'Local SQLite busy (another writer holds the file)',
    mitigation: 'backoff',
    cooldownMs: 1_000,
  },
  unknown_5xx: {
    id: 'unknown_5xx',
    description: 'Server-side 5xx without a more specific signature',
    mitigation: 'backoff',
    cooldownMs: 5_000,
  },
};

export function classifyFromResponse(
  status: number,
  bodyText: string,
  err: unknown,
): FailureModeId | null {
  const body = bodyText.toLowerCase();
  const errMsg = String((err as any)?.message ?? err ?? '').toLowerCase();

  if (status === 401 || body.includes('40003') || body.includes('authorization failed')) {
    return 'bearer_expired';
  }
  if (errMsg.includes('econnrefused') && errMsg.includes('8792')) {
    return 'sidecar_down';
  }
  if (errMsg.includes('econnrefused')) {
    return 'backend_unreachable';
  }
  if (errMsg.includes('database is locked') || errMsg.includes('sqlite_busy')) {
    return 'db_locked';
  }
  if (status === 200 && bodyText.trim().length === 0) {
    return 'empty_200';
  }
  if (status === 429) {
    return 'burst_rate_limit';
  }
  if (status >= 500) {
    return 'unknown_5xx';
  }
  if (body.includes('enoent') || body.includes('no such file')) {
    return 'apk_unreadable';
  }
  return null;
}
