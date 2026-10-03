// Pure logic. Given a request for supporting logic/data allocation,
// pick a safe target region and report resource impact.
import { eventBus } from './eventBus';
import { OffsetRange } from './types';

export interface AllocationRequest {
  segmentId: string;
  resourceType: 'logic' | 'metadata' | 'config';
  estimatedSizeBytes: number;
  contextConstraints: {
    packageName: string;
    criticalPathSegments: string[];
  };
}

export interface RegionCandidate {
  name: string;             // e.g. 'assets/extra', 'classes2.dex.tail'
  freeBytes: number;
  isCritical: boolean;
  distanceFromCore: number; // 0..1, higher = further from critical path
}

export interface AllocationResult {
  allocated: boolean;
  targetRegion: { name: string; range: OffsetRange } | null;
  resourceId: string | null;
  memoryImpact: number;
  conflicts: string[];
  rationale: string;
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function pickRegion(
  request: AllocationRequest,
  candidates: RegionCandidate[]
): RegionCandidate | null {
  const usable = candidates
    .filter(c => !c.isCritical)
    .filter(c => c.freeBytes >= request.estimatedSizeBytes)
    .filter(c =>
      request.contextConstraints.criticalPathSegments.indexOf(c.name) < 0
    );

  if (usable.length === 0) return null;

  // Prefer furthest-from-core region with adequate free space.
  usable.sort((a, b) => {
    if (Math.abs(a.distanceFromCore - b.distanceFromCore) > 0.05) {
      return b.distanceFromCore - a.distanceFromCore;
    }
    return b.freeBytes - a.freeBytes;
  });
  return usable[0];
}

export const dynamicResourceAllocation = {
  plan(args: {
    scanId: string;
    correlationId: string;
    request: AllocationRequest;
    candidates: RegionCandidate[];
  }): AllocationResult {
    const target = pickRegion(args.request, args.candidates);

    if (!target) {
      const result: AllocationResult = {
        allocated: false,
        targetRegion: null,
        resourceId: null,
        memoryImpact: 0,
        conflicts: [],
        rationale: 'no eligible region with sufficient free space',
      };
      eventBus.emit({
        scanId: args.scanId, correlationId: args.correlationId,
        phase: 'edit', functionId: 'dynamic_resource_allocation',
        severity: 'warn',
        payload: { action: 'allocation_failed', reason: result.rationale },
      });
      return result;
    }

    const range: OffsetRange = {
      start: target.freeBytes - args.request.estimatedSizeBytes,
      end: target.freeBytes,
    };

    const result: AllocationResult = {
      allocated: true,
      targetRegion: { name: target.name, range },
      resourceId: uuid(),
      memoryImpact: args.request.estimatedSizeBytes,
      conflicts: [],
      rationale: 'allocated in ' + target.name + ' at distance ' + target.distanceFromCore.toFixed(2),
    };

    eventBus.emit({
      scanId: args.scanId, correlationId: args.correlationId,
      phase: 'edit', functionId: 'dynamic_resource_allocation',
      severity: 'info',
      payload: {
        action: 'allocation_planned',
        region: target.name,
        sizeBytes: args.request.estimatedSizeBytes,
        resourceId: result.resourceId,
      },
    });

    return result;
  },
};
