// Pure logic. Given multiple approved variant representations for a
// region, select one deterministically per build seed.
import { eventBus } from './eventBus';

export interface Variant {
  id: string;
  representation: string;
  functionalityHash: string;
  validationStatus: 'approved' | 'pending' | 'rejected';
}

export interface MaskingRequest {
  segmentId: string;
  region: { start: number; end: number };
  approvedVariants: Variant[];
  buildSeed: string;
}

export interface MaskingResult {
  selectedVariant: Variant | null;
  variantCount: number;
  validationPassed: boolean;
  rationale: string;
}

// Deterministic hash for stable per-build selection.
export function stableHash(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function selectVariant(
  variants: Variant[],
  seed: string
): Variant | null {
  const approved = variants.filter(v => v.validationStatus === 'approved');
  if (approved.length === 0) return null;
  const idx = stableHash(seed) % approved.length;
  return approved[idx];
}

export function variantsFunctionallyEquivalent(variants: Variant[]): boolean {
  const approved = variants.filter(v => v.validationStatus === 'approved');
  if (approved.length <= 1) return true;
  const ref = approved[0].functionalityHash;
  for (let i = 1; i < approved.length; i++) {
    if (approved[i].functionalityHash !== ref) return false;
  }
  return true;
}

export const dynamicMasking = {
  apply(args: {
    scanId: string;
    correlationId: string;
    request: MaskingRequest;
  }): MaskingResult {
    const { approvedVariants, buildSeed, segmentId } = args.request;

    if (!variantsFunctionallyEquivalent(approvedVariants)) {
      const result: MaskingResult = {
        selectedVariant: null,
        variantCount: approvedVariants.length,
        validationPassed: false,
        rationale: 'variants not functionally equivalent',
      };
      eventBus.emit({
        scanId: args.scanId, correlationId: args.correlationId,
        phase: 'validate', functionId: 'dynamic_masking',
        severity: 'critical',
        payload: { action: 'masking_rejected', segmentId, reason: result.rationale },
      });
      return result;
    }

    const selected = selectVariant(approvedVariants, segmentId + ':' + buildSeed);

    const result: MaskingResult = {
      selectedVariant: selected,
      variantCount: approvedVariants.length,
      validationPassed: selected !== null,
      rationale: selected
        ? 'selected variant ' + selected.id + ' via seed ' + buildSeed
        : 'no approved variants available',
    };

    eventBus.emit({
      scanId: args.scanId, correlationId: args.correlationId,
      phase: 'validate', functionId: 'dynamic_masking',
      severity: result.validationPassed ? 'info' : 'warn',
      payload: {
        action: 'masking_applied',
        segmentId,
        variantCount: approvedVariants.length,
        selected: selected ? selected.id : null,
      },
    });

    return result;
  },
};
