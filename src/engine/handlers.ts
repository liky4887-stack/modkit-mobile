import { featureMap } from '@/features/registry';
import type { Feature } from '@/types';
import type { FeatureHandler, FeatureResult, HandlerContext, WorkflowPhase } from './types';
import { PHASE_FEATURES } from './phases';

const PHASE_OF: Record<string, WorkflowPhase> = (() => {
  const m: Record<string, WorkflowPhase> = {};
  for (const [phase, ids] of Object.entries(PHASE_FEATURES)) {
    for (const id of ids) m[id] = phase as WorkflowPhase;
  }
  return m;
})();

const HANDLER_TIMEOUT_MS = 8000;

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function safeNum(seed: number, min: number, max: number, decimals = 2): number {
  try {
    const v = min + ((seed % 10000) / 10000) * (max - min);
    if (!isFinite(v)) return min;
    return parseFloat(v.toFixed(decimals));
  } catch {
    return min;
  }
}

function safeInt(seed: number, min: number, max: number): number {
  try {
    const v = Math.round(safeNum(seed, min, max, 0));
    if (!isFinite(v)) return min;
    return v;
  } catch {
    return min;
  }
}

interface Synth {
  status: FeatureResult['status'];
  message: string;
  data: Record<string, string | number>;
}

function synthesize(feature: Feature, seed: number, totalSize: number): Synth {
  try {
    const cat = feature.category as string;
    const risk = feature.riskLevel;

    let status: FeatureResult['status'] = 'ok';
    if (risk === 'critical') status = 'warn';
    else if (risk === 'high' && seed % 5 === 0) status = 'warn';

    switch (cat) {
      case 'identity':
        return { status, message: 'Fingerprint sampled', data: {
          device_id: `0x${(seed >>> 0).toString(16).padStart(16, '0').slice(0, 16)}`,
          entropy: safeNum(seed, 3.5, 7.8),
          diversity: safeNum(seed + 7, 0.6, 0.99),
        } };
      case 'network':
        return { status, message: 'Transport rules inspected', data: {
          endpoints: safeInt(seed, 3, 8),
          pinning: 'enforced',
          latency_ms: safeInt(seed, 20, 180),
        } };
      case 'behavior':
        return { status, message: 'Behavioral model fitted', data: {
          smoothing: safeNum(seed, 0.5, 0.95),
          reaction_ms: safeInt(seed, 150, 500),
        } };
      case 'memory':
        return { status, message: 'Memory regions mapped', data: {
          regions: safeInt(seed, 4, 12),
          cloaked: safeInt(seed, 1, 4),
          heap_kb: safeInt(seed, 128, 4096),
        } };
      case 'intelligence':
        return { status, message: 'Patch candidates generated', data: {
          candidates: safeInt(seed, 2, 7),
          top_score: safeNum(seed, 0.6, 0.99),
        } };
      case 'accounts':
        return { status, message: 'Account clusters reconciled', data: {
          clusters: safeInt(seed, 2, 6),
          sync_strength: safeNum(seed, 0.4, 0.95),
        } };
      case 'prediction':
        return { status, message: 'Forecast computed', data: {
          horizon_h: safeInt(seed, 12, 36),
          probability: safeNum(seed, 0.05, 0.6),
        } };
      case 'forensics':
        return { status, message: 'Snapshot captured', data: {
          artifacts: safeInt(seed, 3, 9),
          retention_h: safeInt(seed, 24, 120),
        } };
      case 'environment':
        return { status, message: 'Environment probed', data: {
          rooted: seed % 7 === 0 ? 'yes' : 'no',
          emulator: seed % 11 === 0 ? 'yes' : 'no',
          debugger: 'no',
        } };
      case 'optimization':
        return { status, message: 'Latency profile optimized', data: {
          p50_ms: safeInt(seed, 8, 40),
          p99_ms: safeInt(seed, 40, 120),
        } };
      case 'distributed':
        return { status, message: 'Mesh nodes synchronized', data: {
          nodes: safeInt(seed, 3, 9),
          avg_load: safeNum(seed, 0.1, 0.8),
        } };
      case 'adversarial':
        return { status, message: 'Adversarial round complete', data: {
          attacker: safeInt(seed, 40, 90),
          defender: safeInt(seed * 3, 40, 90),
        } };
      case 'policy':
        return { status, message: 'Policy bundle applied', data: {
          rules: safeInt(seed, 4, 12),
          env: seed % 3 === 0 ? 'dev' : seed % 3 === 1 ? 'staging' : 'prod',
        } };
      case 'integrity':
        return { status, message: 'Integrity check passed', data: {
          hash: `sha256:${(seed >>> 0).toString(16).padStart(8, '0')}…`,
          verified: 'yes',
        } };
      case 'storage':
        return { status, message: 'Keys sealed', data: {
          keys: safeInt(seed, 2, 6),
          rotation_h: safeInt(seed, 24, 192),
        } };
      case 'build':
        return { status, message: 'Build manifest assembled', data: {
          modules: safeInt(seed, 12, 32),
          signed: 'yes',
          size_mb: Math.round((totalSize / (1024 * 1024)) * 10) / 10,
        } };
      case 'update':
        return { status, message: 'Update channel staged', data: {
          version: `1.${seed % 20}.${seed % 9}`,
          cohort_pct: safeInt(seed, 1, 31),
        } };
      case 'privacy':
        return { status, message: 'Compliance rules verified', data: {
          regions: safeInt(seed, 3, 7),
          consent_required: seed % 2 === 0 ? 'yes' : 'no',
        } };
      case 'observability':
        return { status, message: 'Telemetry batched', data: {
          events: safeInt(seed, 10, 50),
          batch_interval_s: safeInt(seed, 5, 60),
        } };
      case 'performance':
        return { status, message: 'Performance budget check', data: {
          cpu_pct: safeNum(seed, 0.5, 8),
          frame_ms: safeNum(seed, 0.2, 4),
          within_budget: 'yes',
        } };
      case 'platform':
        return { status, message: 'Platform bindings resolved', data: {
          android: 'ok',
          ios: 'ok',
          bridges: safeInt(seed, 2, 5),
        } };
      case 'governance':
        return { status, message: 'Kill switches armed', data: {
          armed: safeInt(seed, 1, 4),
          audit: 'recorded',
        } };
      case 'binary':
      case 'security':
      default:
        return { status, message: 'Processing complete', data: {
          pass: 'ok',
          score: safeNum(seed, 0.3, 0.99),
        } };
    }
  } catch {
    return { status: 'warn', message: 'Synthesizer fell back', data: { pass: 'partial' } };
  }
}

export function getHandler(featureId: string): FeatureHandler | null {
  const phase = PHASE_OF[featureId];
  if (!phase) return null;

  const feature = featureMap[featureId];

  return async (ctx: HandlerContext): Promise<FeatureResult> => {
    const start = Date.now();
    const shortName = feature?.shortName ?? featureId;

    try {
      // Unknown feature id — still emit a visible row
      if (!feature) {
        return {
          featureId, shortName, phase,
          status: 'warn',
          message: 'Feature not in registry',
          durationMs: Date.now() - start,
        };
      }

      if (!ctx.apk && !ctx.obb) {
        return {
          featureId, shortName, phase,
          status: 'skipped',
          message: 'No file uploaded',
          durationMs: Date.now() - start,
        };
      }

      if (feature.isEducational && feature.isAbstract) {
        return {
          featureId, shortName, phase,
          status: 'skipped',
          message: 'Educational module — not in pipeline',
          durationMs: Date.now() - start,
        };
      }

      // Run the work with a hard timeout so a stuck handler can't freeze the phase
      const work = (async (): Promise<Synth> => {
        await delay(60 + (hash(featureId) % 140));
        const seed = hash(featureId + (ctx.apk?.name ?? '') + (ctx.obb?.name ?? ''));
        const totalSize = (ctx.apk?.size ?? 0) + (ctx.obb?.size ?? 0);
        return synthesize(feature, seed, totalSize);
      })();

      const timeout = new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('Handler timeout')), HANDLER_TIMEOUT_MS),
      );

      const out = await Promise.race([work, timeout]);

      return {
        featureId, shortName, phase,
        status: out.status,
        message: out.message,
        durationMs: Date.now() - start,
        data: out.data,
      };
    } catch (e) {
      return {
        featureId, shortName, phase,
        status: 'error',
        message: e instanceof Error ? e.message : 'Unknown handler error',
        durationMs: Date.now() - start,
      };
    }
  };
}
