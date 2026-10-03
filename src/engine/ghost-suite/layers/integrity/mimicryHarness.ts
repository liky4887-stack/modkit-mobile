// LAB-ONLY: Integrity mimicry validation for checksum robustness.

import { telemetryBus } from '../../telemetry/bus';
import type { BinaryVariation, IntegrityReport } from '../../types';

export function runIntegrityMimicryChecks(
  binary: Uint8Array,
  variations: BinaryVariation[],
  experimentId: string,
): IntegrityReport[] {
  const reports: IntegrityReport[] = variations.map((v) => {
    const modified = applyVariation(binary, v);
    const result = mockIntegrityCheck(modified);
    const blindSpot = !result.detected && v.expectedDetection === 'detected';

    telemetryBus.emit({
      layer: 'integrity',
      timestamp: Date.now(),
      eventType: 'integrity_check',
      payload: { variationId: v.id, detected: result.detected, blindSpot },
      groundTruthLabel: blindSpot ? 'anomalous' : 'benign',
      experimentId,
    });

    return {
      variationId: v.id,
      detected: result.detected,
      expected: v.expectedDetection,
      blindSpot,
    };
  });

  return reports;
}

function applyVariation(binary: Uint8Array, _variation: BinaryVariation): Uint8Array {
  return binary;
}

function mockIntegrityCheck(_binary: Uint8Array): { detected: boolean; reason: string } {
  return { detected: Math.random() > 0.3, reason: 'mock' };
}
