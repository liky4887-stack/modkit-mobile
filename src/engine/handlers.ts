import { featureMap } from '@/features/registry';
import type { FeatureHandler, FeatureResult, HandlerContext, WorkflowPhase } from './types';
import { PHASE_FEATURES } from './phases';
import { getFeatureResult } from './realFeatures';
import { featureApi, type FeatureInsight } from '@/api/factory';
import { getInsight, saveInsight } from '@/db/insights';
import { getEdit, saveEdit } from '@/db/edits';
import { getPreview, savePreview } from '@/db/previews';
import { getArtifact, saveArtifact } from '@/db/artifacts';
import { featureApiFull, type FeatureEdit, type FeaturePreview, type FeatureArtifact } from '@/api/factory';

const PHASE_OF: Record<string, WorkflowPhase> = (() => {
  const m: Record<string, WorkflowPhase> = {};
  for (const [phase, ids] of Object.entries(PHASE_FEATURES)) {
    for (const id of ids) m[id] = phase as WorkflowPhase;
  }
  return m;
})();

const FEATURE_LABELS: Record<string, string> = {
  'device-fingerprint': 'Identity & Device Fingerprint',
  'session-integrity': 'Session & Context Integrity',
  'obfuscation-hardening': 'Obfuscation & Hardening',
  'asset-protection': 'Asset Protection',
  'js-bundle-shield': 'JS Bundle Shield',
  'runtime-sensing': 'Runtime Environment Sensing',
  'anti-tamper-hook': 'Anti-Tamper & Hook Detection',
  'network-transport-guard': 'Network & Transport Guard',
  'match-integrity': 'Match & Gameplay Integrity',
  'telemetry-evidence': 'Telemetry & Evidence',
  'risk-scoring-policy': 'Risk Scoring & Policy',
  'ux-degradation': 'UX-Safe Degradation',
  'secure-storage': 'Secure Storage & Key Mgmt',
  'build-release-integrity': 'Build & Release Integrity',
  'ota-governance': 'OTA & Hot Update Governance',
  'privacy-compliance': 'Privacy & Compliance',
  'observability-debug': 'Observability & Debug Bridge',
  'performance-monitor': 'Performance & Degradation',
  'cross-platform-abstraction': 'Cross-Platform Abstraction',
  'governance-killswitch': 'Governance & Kill-Switch',
  'update-trust-chain': 'Update Trust Chain',
  'update-policy-engine': 'Update Policy Engine',
  'safe-staging-canary': 'Safe-Staging & Canary',
  'differential-integrity': 'Differential Integrity',
  'rollback-recovery': 'Rollback & Recovery',
  'signature-ruleset-updates': 'Signature & Rule-Set Updates',
  'update-ux': 'User-Facing Update Experience',
  'update-telemetry-audit': 'Update Telemetry & Audit',
  'policy-orchestration': 'Policy & Orchestration',
};

// Phases that ask DeepSeek per-feature
const REASONING_PHASES: WorkflowPhase[] = ['analyze', 'edit', 'preview'];

export function getHandler(featureId: string): FeatureHandler | null {
  const phase = PHASE_OF[featureId];
  if (!phase) return null;
  const feature = featureMap[featureId];

  return async (ctx: HandlerContext): Promise<FeatureResult> => {
    const start = Date.now();
    const shortName = feature?.shortName ?? featureId;
    const label = FEATURE_LABELS[featureId] ?? featureId;

    if (!feature) {
      return { featureId, shortName, phase, status: 'warn', message: 'Feature not in registry', durationMs: Date.now() - start };
    }

    const real = getFeatureResult(featureId);
    if (!real) {
      return { featureId, shortName, phase, status: 'skipped', message: 'No scan result — run Import first', durationMs: Date.now() - start };
    }

    const data: Record<string, string | number> = {
      hits: real.totalHits,
      dex: real.dexCount,
      patterns: real.patterns.length,
    };
    const firstHit = real.hits[0];
    if (firstHit) {
      data.top_dex = firstHit.dex;
      const firstSignal = firstHit.signalClasses?.[0];
      if (firstSignal) data.top_class = firstSignal;
    }

    const isReasoning = REASONING_PHASES.includes(phase);
    const scanId = (ctx as any).scanId as string | undefined;

    if (isReasoning && scanId) {
      let insight: FeatureInsight | null = null;

      try {
        insight = await getInsight(scanId, featureId);
        if (insight) ctx.log?.('info', `[${shortName}] cached insight`);
      } catch {}

      if (!insight) {
        if (real.status === 'runtime' || real.totalHits === 0) {
          insight = {
            purpose: real.status === 'runtime'
              ? `Runtime behavior — ${label} cannot be verified from a static APK.`
              : `No static signature found for ${label} in the scanned DEX.`,
            howItWorks: real.status === 'runtime'
              ? 'This layer operates at runtime and produces no static signature in the DEX or ZIP.'
              : 'A full DEX scan (all parsed files, 27k+ classes) found no matches for the known patterns.',
            risk: 'low',
            riskReason: real.status === 'runtime'
              ? 'Absence of a static signature means risk cannot be assessed from the artifact alone.'
              : 'Patterns for this feature are absent from the visible DEX.',
            technical: [
              `Scanned ${real.dexCount} DEX files`,
              `Matched patterns: ${real.patterns.length}`,
              real.status === 'runtime' ? 'Runtime-only layer' : 'Static signature absent',
            ],
            recommendation: real.status === 'runtime'
              ? 'Use dynamic instrumentation (Frida) to observe this layer at runtime.'
              : 'Consider deeper analysis (resources.arsc, native libs) if this layer is critical.',
            patchHint: '',
          };
        } else {
          ctx.log?.('info', `[${shortName}] asking DeepSeek…`);
          try {
            insight = await featureApi.analyzeOne({
              apkName: (ctx.apk?.name) ?? 'target.apk',
              apkSize: (ctx.apk?.size) ?? 0,
              apkHash: '',
              featureId,
              featureLabel: label,
              message: real.message,
              totalHits: real.totalHits,
              patterns: real.patterns,
              topDex: real.hits.slice(0, 6).map((h) => h.dex),
              topClasses: real.hits.flatMap((h) => h.signalClasses ?? []).slice(0, 12),
            });
            await saveInsight(scanId, featureId, insight);
            ctx.log?.('success', `[${shortName}] insight ready`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            ctx.log?.('error', `[${shortName}] analyze failed: ${msg}`);
            insight = {
              purpose: real.message,
              howItWorks: 'DeepSeek analysis failed. Base scan data below.',
              risk: 'low',
              riskReason: msg.slice(0, 120),
              technical: real.patterns.slice(0, 5),
              recommendation: 'Retry from the finding detail screen.',
              patchHint: '',
            };
          }
        }
      }

      data.insight_purpose = insight.purpose;
      data.insight_how = insight.howItWorks;
      data.insight_risk = insight.risk;
      data.insight_riskReason = insight.riskReason;
      data.insight_recommendation = insight.recommendation;
      data.insight_patchHint = insight.patchHint;
      data.insight_technical = JSON.stringify(insight.technical);

      const statusMap: Record<string, FeatureResult['status']> = {
        low: 'ok', medium: 'warn', high: 'warn', critical: 'error',
      };
      return {
        featureId, shortName, phase,
        status: statusMap[insight.risk] ?? 'ok',
        message: insight.purpose,
        durationMs: Date.now() - start,
        data,
      };
    }

    // ─── Preview phase: predict patch outcomes ────────────────────
    if (phase === 'preview' && scanId) {
      let preview: FeaturePreview | null = null;
      try {
        preview = await getPreview(scanId, featureId);
        if (preview) ctx.log?.('info', `[${shortName}] cached preview`);
      } catch {}

      if (!preview) {
        if (real.status === 'runtime' || real.totalHits === 0) {
          preview = {
            scenario: real.status === 'runtime'
              ? 'Runtime-only layer — outcome prediction requires dynamic testing.'
              : 'No static signatures found — nothing to predict.',
            ifApplied: ['No change — no patch available.'],
            ifNotApplied: ['No change.'],
            sideEffects: [],
            confidence: 'low',
            recommendation: 'Run dynamic analysis if this layer is critical.',
          };
        } else {
          ctx.log?.('info', `[${shortName}] predicting outcome…`);
          try {
            const [priorInsight, priorEdit] = await Promise.all([
              getInsight(scanId, featureId),
              getEdit(scanId, featureId),
            ]);
            preview = await featureApiFull.previewOne({
              apkName: (ctx.apk?.name) ?? 'target.apk',
              featureId,
              featureLabel: label,
              insight: priorInsight,
              edit: priorEdit,
            });
            await savePreview(scanId, featureId, preview);
            ctx.log?.('success', `[${shortName}] preview ready (${preview.confidence})`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            ctx.log?.('error', `[${shortName}] preview failed: ${msg}`);
            preview = {
              scenario: 'Preview generation failed.',
              ifApplied: [], ifNotApplied: [], sideEffects: [],
              confidence: 'low',
              recommendation: msg.slice(0, 120),
            };
          }
        }
      }

      data.preview_scenario = preview.scenario;
      data.preview_ifApplied = JSON.stringify(preview.ifApplied);
      data.preview_ifNotApplied = JSON.stringify(preview.ifNotApplied);
      data.preview_sideEffects = JSON.stringify(preview.sideEffects);
      data.preview_confidence = preview.confidence;
      data.preview_recommendation = preview.recommendation;

      const statusMap: Record<string, FeatureResult['status']> = {
        low: 'warn', medium: 'warn', high: 'ok',
      };
      return {
        featureId, shortName, phase,
        status: statusMap[preview.confidence] ?? 'ok',
        message: preview.recommendation,
        durationMs: Date.now() - start,
        data,
      };
    }

    // ─── Export phase: produce final deliverable artifact ────────
    if (phase === 'export' && scanId) {
      let artifact: FeatureArtifact | null = null;
      try {
        artifact = await getArtifact(scanId, featureId);
        if (artifact) ctx.log?.('info', `[${shortName}] cached artifact`);
      } catch {}

      if (!artifact) {
        if (real.status === 'runtime' || real.totalHits === 0) {
          artifact = {
            name: `${featureId}.report.txt`,
            type: 'report',
            contents: `Feature: ${label}\nStatus: ${real.status}\nHits: ${real.totalHits}\n\nNo static artifact produced — ${real.status === 'runtime' ? 'runtime-only layer' : 'no signatures found'}.`,
            installInstructions: 'No installation required.',
            verification: 'N/A',
            dependencies: [],
            risk: 'low',
            sizeBytes: 0,
            checksum: '',
          };
        } else {
          ctx.log?.('info', `[${shortName}] building artifact…`);
          try {
            const [priorInsight, priorEdit, priorPreview] = await Promise.all([
              getInsight(scanId, featureId),
              getEdit(scanId, featureId),
              getPreview(scanId, featureId),
            ]);
            artifact = await featureApiFull.exportOne({
              apkName: (ctx.apk?.name) ?? 'target.apk',
              featureId,
              featureLabel: label,
              insight: priorInsight,
              edit: priorEdit,
              preview: priorPreview,
            });
            await saveArtifact(scanId, featureId, artifact);
            ctx.log?.('success', `[${shortName}] artifact ready (${artifact.name})`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            ctx.log?.('error', `[${shortName}] export failed: ${msg}`);
            artifact = {
              name: `${featureId}.error.txt`, type: 'report',
              contents: `Export failed: ${msg}`,
              installInstructions: 'Retry from detail screen.',
              verification: 'N/A', dependencies: [], risk: 'low',
              sizeBytes: 0, checksum: '',
            };
          }
        }
      }

      data.artifact_name = artifact.name;
      data.artifact_type = artifact.type;
      data.artifact_contents = artifact.contents.slice(0, 8000);
      data.artifact_sizeBytes = artifact.sizeBytes ?? 0;
      data.artifact_checksum = artifact.checksum ?? '';
      data.artifact_install = artifact.installInstructions;
      data.artifact_verification = artifact.verification;
      data.artifact_dependencies = JSON.stringify(artifact.dependencies);
      data.artifact_risk = artifact.risk;

      return {
        featureId, shortName, phase,
        status: 'ok',
        message: `${artifact.name} (${artifact.sizeBytes ?? 0} B)`,
        durationMs: Date.now() - start,
        data,
      };
    }

    // ─── Edit phase: generate concrete patch payload ────────────
    if (phase === 'edit' && scanId) {
      let edit: FeatureEdit | null = null;
      try {
        edit = await getEdit(scanId, featureId);
        if (edit) ctx.log?.('info', `[${shortName}] cached edit`);
      } catch {}

      if (!edit) {
        if (real.status === 'runtime' || real.totalHits === 0) {
          edit = {
            approach: 'no-action',
            target: featureId,
            method: '',
            language: 'text',
            payload: '',
            before: '',
            after: '',
            impact: real.status === 'runtime'
              ? 'Runtime-only feature — no static patch possible without dynamic instrumentation.'
              : 'No static signatures found in this APK — nothing to patch.',
            verification: 'Use dynamic instrumentation to observe runtime behavior.',
            risk: 'low',
          };
        } else {
          ctx.log?.('info', `[${shortName}] generating patch…`);
          try {
            const priorInsight = await getInsight(scanId, featureId);
            edit = await featureApiFull.editOne({
              apkName: (ctx.apk?.name) ?? 'target.apk',
              featureId,
              featureLabel: label,
              message: real.message,
              patterns: real.patterns,
              topClasses: real.hits.flatMap((h) => h.signalClasses ?? []).slice(0, 12),
              insight: priorInsight,
            });
            await saveEdit(scanId, featureId, edit);
            ctx.log?.('success', `[${shortName}] patch ready (${edit.approach})`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            ctx.log?.('error', `[${shortName}] edit failed: ${msg}`);
            edit = {
              approach: 'no-action', target: featureId, method: '',
              language: 'text', payload: '', before: '', after: '',
              impact: `Patch generation failed: ${msg.slice(0, 120)}`,
              verification: 'Retry from the finding detail screen.',
              risk: 'low',
            };
          }
        }
      }

      data.edit_approach = edit.approach;
      data.edit_target = edit.target;
      data.edit_method = edit.method;
      data.edit_language = edit.language;
      data.edit_payload = edit.payload.slice(0, 8000);
      data.edit_before = edit.before.slice(0, 2000);
      data.edit_after = edit.after.slice(0, 2000);
      data.edit_impact = edit.impact;
      data.edit_verification = edit.verification;
      data.edit_risk = edit.risk;

      const statusMap: Record<string, FeatureResult['status']> = {
        low: 'ok', medium: 'warn', high: 'warn', critical: 'error',
      };
      const editStatus = edit.approach === 'no-action' ? 'warn' : (statusMap[edit.risk] ?? 'ok');
      return {
        featureId, shortName, phase,
        status: editStatus,
        message: edit.approach === 'no-action'
          ? edit.impact
          : `${edit.approach} → ${edit.target}${edit.method ? '.' + edit.method : ''}`,
        durationMs: Date.now() - start,
        data,
      };
    }

    let status: FeatureResult['status'] = 'ok';
    if (real.status === 'runtime') status = 'warn';
    if (real.status === 'clean') status = 'ok';

    return {
      featureId, shortName, phase,
      status,
      message: real.message,
      durationMs: Date.now() - start,
      data,
    };
  };
}
