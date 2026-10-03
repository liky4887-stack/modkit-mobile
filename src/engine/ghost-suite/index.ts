// LAB-ONLY: Defensive Ghost Analysis Suite entry point.
// Call runGhostSuiteAnalysis() from the patch workflow — never as a button.

import { telemetryBus } from './telemetry/bus';
import { generateBenignVariants, analyzeFingerprintCollisions } from './layers/hardware/profiler';
import { KernelSignalMasker } from './layers/kernel/masker';
import { generateIdentityTimeline, evaluateLinkageRule } from './layers/identity/driftEngine';
import { runIntegrityMimicryChecks } from './layers/integrity/mimicryHarness';
import type { BinaryVariation } from './types';

export interface GhostRunResult {
  experimentId: string;
  summary: {
    collisionRate: number;
    overWeightedId: string | null;
    falsePositives: number;
    falseNegatives: number;
    blindSpots: number;
    eventCount: number;
  };
  events: ReturnType<typeof telemetryBus.getEvents>;
}

export async function runGhostSuiteAnalysis(
  apk: { name: string; size: number } | null,
  obb: { name: string; size: number } | null,
  log: (level: 'info' | 'warn' | 'error' | 'success' | 'debug', msg: string) => void,
): Promise<GhostRunResult> {
  const experimentId = 'exp_' + Date.now();
  telemetryBus.reset();

  log('info', 'Ghost suite: experiment ' + experimentId);

  // Layer 1 — Hardware
  const base = {
    soc: 'Snapdragon 8 Gen 3',
    ramGB: 12,
    osBuild: 'AP1A.240505.005',
    oemSkin: 'One UI 6.1',
    androidId: 'mock_android_id',
    imeiPrefix: '35',
  };
  const variants = generateBenignVariants(base, 100, experimentId);
  const fp = analyzeFingerprintCollisions(variants, experimentId);
  log('info', 'HW: ' + variants.length + ' variants, collision=' + fp.collisionRate);

  // Layer 2 — Kernel
  const masker = new KernelSignalMasker(experimentId);
  masker.maskSignal(
    { type: 'syscall', payload: { open: 12 }, original: { open: 12 } },
    'reshape',
  );
  masker.revertAll();

  // Layer 3 — Identity
  const timeline = generateIdentityTimeline('one_user_multi_device', experimentId);
  const linkage = evaluateLinkageRule(timeline, () => false, experimentId);
  log('info', 'ID: ' + timeline.length + ' events, FPs=' + linkage.falsePositives);

  // Layer 4 — Integrity
  const variations: BinaryVariation[] = [
    { id: 'v1', description: 'nop sled', modification: 'nop_sled', expectedDetection: 'detected' },
    { id: 'v2', description: 'padding', modification: 'section_padding', expectedDetection: 'detected' },
  ];
  const intReports = runIntegrityMimicryChecks(new Uint8Array([1, 2, 3]), variations, experimentId);
  const blindSpots = intReports.filter((r) => r.blindSpot).length;
  log('info', 'INT: ' + intReports.length + ' checks, ' + blindSpots + ' blind spots');

  const events = telemetryBus.getEvents();
  log('info', 'Ghost suite done: ' + events.length + ' telemetry events');

  return {
    experimentId,
    summary: {
      collisionRate: fp.collisionRate,
      overWeightedId: fp.overWeightedId,
      falsePositives: linkage.falsePositives,
      falseNegatives: linkage.falseNegatives,
      blindSpots,
      eventCount: events.length,
    },
    events,
  };
}
