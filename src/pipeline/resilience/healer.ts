// Healer. Executes a mitigation for a predicted/observed failure mode
// and enforces cooldowns so we don't spam the same action.
import { FAILURE_MODES } from './failureModes';
import { regulator } from './regulator';
import type { FailureModeId, HealResult, MitigationId } from './types';

export interface HealContext {
  sessionId?: string;
  onRotateSession?: (old: string | undefined) => string | undefined;
  onRefreshCreds?: () => Promise<void>;
  onRestartSidecar?: () => Promise<void>;
  onFallbackEngine?: () => void;
  onPause?: (reason: string) => void;
}

const cooldowns = new Map<MitigationId, number>();
const recentHeals: HealResult[] = [];
const MAX_RECENT = 20;

function cooldownActive(m: MitigationId): boolean {
  const until = cooldowns.get(m) ?? 0;
  return until > Date.now();
}

function setCooldown(m: MitigationId, ms: number): void {
  cooldowns.set(m, Date.now() + ms);
}

function pushHeal(h: HealResult): void {
  recentHeals.push(h);
  if (recentHeals.length > MAX_RECENT) recentHeals.shift();
}

export function getRecentHeals(): HealResult[] {
  return [...recentHeals];
}

export function activeCooldowns(): Array<{ mitigation: MitigationId; until: number }> {
  const now = Date.now();
  const out: Array<{ mitigation: MitigationId; until: number }> = [];
  for (const [m, until] of cooldowns) if (until > now) out.push({ mitigation: m, until });
  return out;
}

export async function heal(
  mode: FailureModeId,
  ctx: HealContext,
): Promise<HealResult> {
  const spec = FAILURE_MODES[mode];
  const mitigation = spec.mitigation;

  if (cooldownActive(mitigation)) {
    return {
      mitigation,
      applied: false,
      detail: `suppressed — cooldown active for ${mitigation}`,
      cooldownMs: 0,
    };
  }

  let applied = false;
  let detail = '';

  try {
    switch (mitigation) {
      case 'rotate_session': {
        const oldId = ctx.sessionId;
        const newId = ctx.onRotateSession?.(oldId);
        applied = true;
        detail = `rotated ${oldId?.slice(0, 8) ?? 'none'} → ${newId?.slice(0, 8) ?? 'fresh'}`;
        break;
      }
      case 'backoff': {
        regulator.forceBackoff(2_000);
        applied = true;
        detail = `forced backoff to ${regulator.delayMs}ms`;
        break;
      }
      case 'refresh_creds': {
        await ctx.onRefreshCreds?.();
        applied = true;
        detail = 'invoked credential refresh hook';
        break;
      }
      case 'fallback_engine': {
        ctx.onFallbackEngine?.();
        applied = true;
        detail = 'signaled engine fallback';
        break;
      }
      case 'restart_sidecar': {
        await ctx.onRestartSidecar?.();
        applied = true;
        detail = 'invoked sidecar restart hook';
        break;
      }
      case 'pause_pipeline': {
        ctx.onPause?.(spec.description);
        applied = true;
        detail = `paused: ${spec.description}`;
        break;
      }
      case 'block_and_surface': {
        ctx.onPause?.(spec.description);
        applied = true;
        detail = `blocked and surfaced: ${spec.description}`;
        break;
      }
      case 'noop':
      default: {
        applied = false;
        detail = 'no mitigation configured';
      }
    }
  } catch (err) {
    return {
      mitigation,
      applied: false,
      detail: `heal action threw: ${(err as Error).message}`,
      cooldownMs: 0,
    };
  }

  if (spec.cooldownMs > 0) setCooldown(mitigation, spec.cooldownMs);

  const result: HealResult = { mitigation, applied, detail, cooldownMs: spec.cooldownMs };
  pushHeal(result);
  return result;
}
