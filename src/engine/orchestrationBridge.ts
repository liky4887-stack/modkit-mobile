// Bridge: connects the existing patch page workflow to the orchestration
// trainer. Runs orchestration alongside the legacy runner — same log stream,
// same phase semantics.
import { orchestrationTrainer } from '@/orchestration/orchestrationTrainer';
import { eventBus } from '@/orchestration/eventBus';
import type { WorkflowPhase, UploadedFile } from './types';
import type { PhaseId } from '@/orchestration/types';

// Map the UI's WorkflowPhase to orchestration PhaseId(s).
function mapPhase(wp: WorkflowPhase): PhaseId[] {
  switch (wp) {
    case 'investigate': return ['import', 'investigate'];
    case 'analyze':     return ['analyze'];
    case 'edit':        return ['edit'];
    case 'preview':     return ['validate'];
    case 'build':       return ['build'];
    case 'export':      return ['export'];
  }
}

export interface BridgeContext {
  scanId: string;
  apk: UploadedFile | null;
  obb: UploadedFile | null;
  log: (level: 'info' | 'success' | 'warn' | 'error' | 'debug', message: string) => void;
}

export interface BridgeResult {
  phase: WorkflowPhase;
  ok: boolean;
  durationMs: number;
  summary: string;
}

// Subscribe to orchestration events and mirror them into the UI log.
let unsub: (() => void) | null = null;

export function startOrchestrationLogStream(
  ctx: BridgeContext
): () => void {
  if (unsub) { unsub(); unsub = null; }
  unsub = eventBus.subscribe((e: any) => {
    if (!e || e.scanId !== ctx.scanId) return;
    const level =
      e.severity === 'critical' ? 'error' :
      e.severity === 'warn' ? 'warn' : 'debug';
    const action = e.payload && e.payload.action ? e.payload.action : 'event';
    try {
      ctx.log(level as any, '[orch:' + e.functionId + '] ' + action);
    } catch {}
  });
  return () => { if (unsub) { unsub(); unsub = null; } };
}

export function stopOrchestrationLogStream(): void {
  if (unsub) { unsub(); unsub = null; }
}

export async function runOrchestrationForPhase(
  wp: WorkflowPhase,
  ctx: BridgeContext,
  extras: {
    scan?: any;
    classes?: any[];
    patterns?: any[];
    entropySamples?: any[];
    entropyExpectations?: any[];
    temporalSamples?: any[];
    temporalExpectations?: any[];
    proposedChanges?: any[];
    contexts?: any;
    allocationRequests?: any[];
    inspectionSignals?: any[];
    heartbeatExpected?: any[];
    heartbeatObserved?: any[];
    versionObserved?: any;
    versionExpected?: any;
    handshakeRequest?: any;
    policyView?: any;
    priorLedger?: any[];
    oldClasses?: string[];
    newClasses?: string[];
    depConstraints?: any[];
    segments?: any[];
    workers?: any[];
    totalTokenBudget?: number;
    transformedPath?: string;
  }
): Promise<BridgeResult> {
  const t0 = Date.now();
  const phases = mapPhase(wp);

  try {
    const result = await orchestrationTrainer.train({
      scanId: ctx.scanId,
      apkPath: ctx.apk?.uri || '',
      transformedPath: extras.transformedPath || ctx.apk?.uri || '',
      phases,
      segments: extras.segments || [],
      workers: extras.workers || [
        { id: 'w1', model: 'deepseek-chat', maxContextTokens: 64000, currentLoad: 0, healthy: true },
      ],
      totalTokenBudget: extras.totalTokenBudget || 500000,
      scan: extras.scan,
      classes: extras.classes,
      patterns: extras.patterns,
      entropySamples: extras.entropySamples,
      entropyExpectations: extras.entropyExpectations,
      temporalSamples: extras.temporalSamples,
      temporalExpectations: extras.temporalExpectations,
      proposedChanges: extras.proposedChanges,
      contexts: extras.contexts,
      allocationRequests: extras.allocationRequests,
      inspectionSignals: extras.inspectionSignals,
      heartbeatExpected: extras.heartbeatExpected,
      heartbeatObserved: extras.heartbeatObserved,
      versionObserved: extras.versionObserved,
      versionExpected: extras.versionExpected,
      handshakeRequest: extras.handshakeRequest,
      policyView: extras.policyView,
      priorLedger: extras.priorLedger,
      oldClasses: extras.oldClasses,
      newClasses: extras.newClasses,
      depConstraints: extras.depConstraints,
    });

    const dur = Date.now() - t0;
    const validation = result.validation && result.validation.promotionDecision
      ? ' → ' + result.validation.promotionDecision
      : '';
    const audit = result.audit && result.audit.finalDecision
      ? ' audit=' + result.audit.finalDecision
      : '';
    const summary = 'phases=' + result.phasesCompleted.join(',') + validation + audit;
    return { phase: wp, ok: true, durationMs: dur, summary };
  } catch (err) {
    const dur = Date.now() - t0;
    return {
      phase: wp,
      ok: false,
      durationMs: dur,
      summary: 'orchestration error: ' + (err instanceof Error ? err.message : String(err)),
    };
  }
}
