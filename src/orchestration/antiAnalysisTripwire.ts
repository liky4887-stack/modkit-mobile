// Pure logic. Given an inspection signal stream, decide response.
// No state held; the caller owns the ring buffer / DB writes.
import { eventBus } from './eventBus';

export interface InspectionSignal {
  source: 'backend' | 'runtime' | 'network';
  pattern: 'rapid_queries' | 'deep_scan' | 'dynamic_probe' | 'timing_anomaly';
  intensity: number;    // 0..1
  affectedSegments: string[];
  timestamp: number;
}

export interface SurfaceAdjustment {
  segmentId: string;
  originalSurface: string;
  adjustedSurface: string;
  functionallyEquivalent: boolean;
}

export interface TripwireResponse {
  action: 'monitor' | 'adjust_surface' | 'degrade_gracefully' | 'log_escalate';
  adjustments: SurfaceAdjustment[];
  logged: boolean;
  rationale: string;
}

// Classify a batch of signals. Uses max intensity, but weighted by
// recent activity (window = last 60s).
export function classifySignals(
  signals: InspectionSignal[],
  windowMs = 60000
): { intensity: number; dominantPattern: InspectionSignal['pattern'] | null } {
  if (signals.length === 0) return { intensity: 0, dominantPattern: null };

  const now = Date.now();
  const recent = signals.filter(s => now - s.timestamp <= windowMs);
  if (recent.length === 0) return { intensity: 0, dominantPattern: null };

  const byPattern = new Map<string, number>();
  let max = 0;
  let dominant: InspectionSignal['pattern'] = recent[0].pattern;
  for (const s of recent) {
    byPattern.set(s.pattern, (byPattern.get(s.pattern) || 0) + s.intensity);
    if (s.intensity > max) {
      max = s.intensity;
      dominant = s.pattern;
    }
  }

  // Recency-weighted intensity: max + small bonus for cluster count
  const clusterBonus = Math.min(0.2, recent.length * 0.02);
  const intensity = Math.min(1, max + clusterBonus);
  return { intensity, dominantPattern: dominant };
}

export function decideResponse(intensity: number): TripwireResponse['action'] {
  if (intensity < 0.3) return 'monitor';
  if (intensity < 0.6) return 'adjust_surface';
  if (intensity < 0.8) return 'degrade_gracefully';
  return 'log_escalate';
}

export function pickAdjustments(
  action: TripwireResponse['action'],
  affectedSegments: string[]
): SurfaceAdjustment[] {
  if (action === 'monitor' || action === 'log_escalate') return [];
  const out: SurfaceAdjustment[] = [];
  const count = action === 'adjust_surface' ? Math.min(3, affectedSegments.length)
                                           : affectedSegments.length;
  for (let i = 0; i < count; i++) {
    out.push({
      segmentId: affectedSegments[i],
      originalSurface: 'default',
      adjustedSurface: 'masked',
      functionallyEquivalent: true,
    });
  }
  return out;
}

export const antiAnalysisTripwire = {
  process(args: {
    scanId: string;
    correlationId: string;
    signals: InspectionSignal[];
    windowMs?: number;
  }): TripwireResponse {
    const { intensity } = classifySignals(args.signals, args.windowMs);
    const action = decideResponse(intensity);
    const affected = Array.from(
      new Set(args.signals.flatMap(s => s.affectedSegments))
    );
    const adjustments = pickAdjustments(action, affected);

    const rationale = 'intensity=' + intensity.toFixed(2)
      + ' action=' + action
      + ' adjustments=' + adjustments.length;

    eventBus.emit({
      scanId: args.scanId, correlationId: args.correlationId,
      phase: 'validate', functionId: 'anti_analysis_tripwire',
      severity: action === 'log_escalate' ? 'critical'
              : action === 'degrade_gracefully' ? 'warn' : 'info',
      payload: {
        action: action,
        intensity: Number(intensity.toFixed(3)),
        adjustments: adjustments.length,
      },
    });

    return {
      action,
      adjustments,
      logged: true,
      rationale,
    };
  },
};
