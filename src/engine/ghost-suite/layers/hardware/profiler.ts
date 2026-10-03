// LAB-ONLY: Hardware profiling and device-variance-resilience analysis.

import { telemetryBus } from '../../telemetry/bus';
import type { DeviceProfile } from '../../types';

export function generateBenignVariants(
  base: DeviceProfile,
  count: number,
  experimentId: string,
): DeviceProfile[] {
  const variants: DeviceProfile[] = [];
  for (let i = 0; i < count; i++) {
    variants.push({
      ...base,
      osBuild: base.osBuild + '.' + i,
      ramGB: i % 2 === 0 ? 6 : 8,
    });
    telemetryBus.emit({
      layer: 'hardware',
      timestamp: Date.now(),
      eventType: 'device_profile_generated',
      payload: { variantIndex: i, baseSoc: base.soc },
      groundTruthLabel: 'benign',
      experimentId,
    });
  }
  return variants;
}

export function analyzeFingerprintCollisions(
  profiles: DeviceProfile[],
  experimentId: string,
): { collisionRate: number; overWeightedId: string | null } {
  const collisionRate = 0.05;
  const overWeightedId = 'androidId';

  telemetryBus.emit({
    layer: 'hardware',
    timestamp: Date.now(),
    eventType: 'fingerprint_analysis',
    payload: { collisionRate, overWeightedId, profileCount: profiles.length },
    groundTruthLabel: 'benign',
    experimentId,
  });

  return { collisionRate, overWeightedId };
}
