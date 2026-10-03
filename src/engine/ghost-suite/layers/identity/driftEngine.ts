// LAB-ONLY: Identity drift modeling for account-linkage resilience.

import { telemetryBus } from '../../telemetry/bus';
import type { IdentityEvent } from '../../types';

export function generateIdentityTimeline(
  scenario: 'one_user_multi_device' | 'shared_device' | 'travel',
  experimentId: string,
): IdentityEvent[] {
  const events: IdentityEvent[] = [];
  const now = Date.now();
  const count = scenario === 'travel' ? 12 : 6;
  for (let i = 0; i < count; i++) {
    events.push({
      timestamp: now + i * 60_000,
      userId: 'user_' + (i % 2),
      deviceId: 'dev_' + (i % 3),
      ipRange: scenario === 'travel' ? '10.' + i + '.0.0/16' : '192.168.0.0/16',
      action: i % 3 === 0 ? 'login' : i % 3 === 1 ? 'gameplay' : 'purchase',
      label: 'benign',
    });
  }

  telemetryBus.emit({
    layer: 'identity',
    timestamp: Date.now(),
    eventType: 'timeline_generated',
    payload: { scenario, eventCount: events.length },
    groundTruthLabel: 'benign',
    experimentId,
  });

  return events;
}

export function evaluateLinkageRule(
  events: IdentityEvent[],
  _rule: (a: IdentityEvent, b: IdentityEvent) => boolean,
  experimentId: string,
): { clusters: number; falsePositives: number; falseNegatives: number } {
  const result = { clusters: 0, falsePositives: 0, falseNegatives: 0 };

  telemetryBus.emit({
    layer: 'identity',
    timestamp: Date.now(),
    eventType: 'linkage_evaluated',
    payload: result,
    groundTruthLabel: 'benign',
    experimentId,
  });

  return result;
}
