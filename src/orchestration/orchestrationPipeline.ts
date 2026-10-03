// Orchestration pipeline — composes all 26 modules into one callable
// pass. Pure logic + dependency-injected IO.
import { PhaseId } from './types';
import { eventBus } from './eventBus';
import { validationPhase, ValidationInput } from './validationPhase';
import { feedbackLoops, FeedbackAction } from './feedbackLoops';
import { healingLoops } from './healingLoops';
import { binaryDiffViewer } from './binaryDiffViewer';
import { finalAssemblyAudit } from './finalAssemblyAudit';
import { entropyBalancer, EntropySample, EntropyExpectation } from './entropyBalancer';
import { signatureScrubber, PatternStat } from './signatureScrubber';
import { heuristicMimicry, ClassName } from './heuristicMimicry';
import { temporalShifter, TemporalSample, TemporalExpectation } from './temporalShifter';
import { contextualChameleon, ProposedChange, ContextSnapshot } from './contextualChameleon';
import { dynamicResourceAllocation, RegionCandidate, AllocationRequest } from './dynamicResourceAllocation';
import { antiAnalysisTripwire, InspectionSignal } from './antiAnalysisTripwire';
import { integrityHeartbeat, HeartbeatMetric, MetricObservation } from './integrityHeartbeat';
import { versionContinuityGuard, VersionMetadata, VersionExpectation } from './versionContinuityGuard';
import { fakeUpdateHandshake, HandshakeRequest, PolicyView } from './fakeUpdateHandshake';
import { autoMigration, PriorLedgerEntry } from './autoMigration';
import { RunnerDeps } from './orchestrationRunner';
import { OrchestrationJob } from './centralOrchestrator';

export interface PipelineInput {
  scanId: string;
  apkPath: string;
  transformedPath: string;
  phases: PhaseId[];
  segments: OrchestrationJob['segments'];
  workers: OrchestrationJob['workers'];
  totalTokenBudget: number;

  scan?: any;
  classes?: ClassName[];
  patterns?: PatternStat[];
  entropySamples?: EntropySample[];
  entropyExpectations?: EntropyExpectation[];
  temporalSamples?: TemporalSample[];
  temporalExpectations?: TemporalExpectation[];
  proposedChanges?: ProposedChange[];
  contexts?: Record<string, ContextSnapshot>;
  allocationRequests?: Array<{ request: AllocationRequest; candidates: RegionCandidate[] }>;
  inspectionSignals?: InspectionSignal[];
  heartbeatExpected?: HeartbeatMetric[];
  heartbeatObserved?: MetricObservation[];
  versionObserved?: VersionMetadata;
  versionExpected?: VersionExpectation;
  handshakeRequest?: HandshakeRequest;
  policyView?: PolicyView;
  priorLedger?: PriorLedgerEntry[];
  oldClasses?: string[];
  newClasses?: string[];
  classOffsetShift?: Record<string, number>;
  depConstraints?: Array<{ source: string; target: string; type: string }>;
}

export interface PipelineResult {
  scanId: string;
  startedAt: number;
  finishedAt: number;
  phasesCompleted: PhaseId[];
  recoveredSegments: string[];
  edgeCount: number;
  norms?: any;
  chameleon?: any;
  temporal?: any;
  diff?: any;
  entropy?: any;
  scrubber?: any;
  heartbeat?: any;
  tripwire?: any;
  validation?: any;
  continuity?: any;
  allocations?: any[];
  audit?: any;
  handshake?: any;
  migration?: any;
  healing?: any[];
  feedback: FeedbackAction[];
}

export async function runPipeline(
  deps: RunnerDeps,
  input: PipelineInput
): Promise<PipelineResult> {
  const correlationId = input.scanId;
  const startedAt = Date.now();
  const result: PipelineResult = {
    scanId: input.scanId,
    startedAt,
    finishedAt: 0,
    phasesCompleted: [],
    recoveredSegments: [],
    edgeCount: 0,
    feedback: [],
  };

  eventBus.emit({
    scanId: input.scanId, correlationId, phase: 'import',
    functionId: 'orchestration_logs', severity: 'info',
    payload: { action: 'pipeline_start', phases: input.phases },
  });

  if (input.phases.includes('import')) {
    result.recoveredSegments = await deps.stateRecovery.recoverOrphans(input.scanId);
    if (input.priorLedger && input.oldClasses && input.newClasses) {
      result.migration = autoMigration.plan({
        scanId: input.scanId, correlationId,
        priorLedger: input.priorLedger,
        oldClasses: input.oldClasses,
        newClasses: input.newClasses,
        classOffsetShift: input.classOffsetShift,
      });
    }
    result.phasesCompleted.push('import');
  }

  if (input.phases.includes('investigate')) {
    if (input.scan) {
      result.edgeCount = await deps.dependencyMapper.ingestScan(input.scanId, input.scan);
    }
    if (input.classes && input.classes.length > 0) {
      const m = heuristicMimicry.analyze({
        scanId: input.scanId, correlationId,
        classes: input.classes,
        proposedChanges: (input.proposedChanges || []).map(c => ({
          changeId: c.changeId,
          proposedFqcn: c.changeKind === 'add_class' ? c.proposedContent : c.targetSegment,
        })),
      });
      result.norms = m.norms;
    }
    result.phasesCompleted.push('investigate');
  }

  if (input.phases.includes('analyze')) {
    if (input.proposedChanges && input.contexts) {
      result.chameleon = contextualChameleon.analyze({
        scanId: input.scanId, correlationId,
        changes: input.proposedChanges,
        contexts: input.contexts,
      });
    }
    if (input.temporalSamples && input.temporalExpectations) {
      result.temporal = temporalShifter.analyze({
        scanId: input.scanId, correlationId,
        samples: input.temporalSamples,
        expectations: input.temporalExpectations,
      });
    }
    result.phasesCompleted.push('analyze');
  }

  if (input.phases.includes('edit')) {
    result.allocations = [];
    if (input.allocationRequests) {
      for (const req of input.allocationRequests) {
        result.allocations.push(dynamicResourceAllocation.plan({
          scanId: input.scanId, correlationId,
          request: req.request,
          candidates: req.candidates,
        }));
      }
    }
    result.phasesCompleted.push('edit');
  }

  if (input.phases.includes('validate')) {
    if (input.apkPath && input.transformedPath) {
      try {
        result.diff = await binaryDiffViewer.compare({
          scanId: input.scanId, correlationId,
          originalPath: input.apkPath,
          transformedPath: input.transformedPath,
        });
      } catch (err) {
        await deps.crossSessionIntelligence.record({
          constraintType: 'diff_unavailable',
          description: String(err),
          encounteredBy: 'orchestrationPipeline',
          affectedSegments: ['diff'],
          strategyAdjustment: 'skip diff-dependent checks',
        });
      }
    }

    if (input.entropySamples && input.entropyExpectations) {
      result.entropy = entropyBalancer.analyze({
        scanId: input.scanId, correlationId,
        samples: input.entropySamples,
        expectations: input.entropyExpectations,
      });
    }

    if (input.patterns && input.classes) {
      const norms: string[] = input.classes.map(c => c.fqcn);
      result.scrubber = signatureScrubber.analyze({
        scanId: input.scanId, correlationId,
        stats: input.patterns,
        projectNorms: norms.slice(0, 200),
      });
    }

    if (input.temporalSamples && input.temporalExpectations && !result.temporal) {
      result.temporal = temporalShifter.analyze({
        scanId: input.scanId, correlationId,
        samples: input.temporalSamples,
        expectations: input.temporalExpectations,
      });
    }

    if (input.heartbeatExpected && input.heartbeatObserved) {
      result.heartbeat = integrityHeartbeat.tick({
        scanId: input.scanId, correlationId,
        expected: input.heartbeatExpected,
        observed: input.heartbeatObserved,
      });
    }

    if (input.inspectionSignals) {
      result.tripwire = antiAnalysisTripwire.process({
        scanId: input.scanId, correlationId,
        signals: input.inspectionSignals,
      });
    }

    if (input.versionObserved && input.versionExpected) {
      result.continuity = versionContinuityGuard.check({
        scanId: input.scanId, correlationId,
        observed: input.versionObserved,
        expected: input.versionExpected,
      });
    }

    const ledger = await deps.truthLedger.getByScan(input.scanId);
    const ledgerPending = ledger.filter((e: any) => e.validation_outcome === 'pending').length;
    const structuralDelta = result.diff ? Math.min(1, result.diff.summary.totalChangedBytes / 1e6) : 0;
    const entropyDev = result.entropy
      ? (result.entropy.adjustments.reduce((s: number, a: any) => s + a.deviation, 0)
         / Math.max(1, result.entropy.adjustments.length))
      : 0;
    const concentration = result.diff ? result.diff.concentrationScore : 0;

    const vInput: ValidationInput = {
      scanId: input.scanId, correlationId,
      structuralDelta,
      entropyDeviation: entropyDev,
      concentrationScore: concentration,
      signatureStable: result.continuity ? result.continuity.consistent : true,
      ledgerPendingCount: ledgerPending,
    };
    result.validation = validationPhase.run(vInput);

    if (!result.validation.passed) {
      const actions = feedbackLoops.process({
        scanId: input.scanId, correlationId,
        currentPhase: 'validate',
        validation: result.validation,
        affectedSegments: input.segments.map(s => s.id),
        priorAttempts: 0,
      });
      result.feedback.push(...actions);

      result.healing = [];
      for (const action of actions) {
        result.healing.push(healingLoops.plan({
          scanId: input.scanId, correlationId,
          triggerType: action.rollbackRequired ? 'validation_failure' : 'structural_anomaly',
          affectedSegments: action.segmentsToRevisit,
          failureDetails: action.reason,
          previousAttempts: 0,
        }));
      }
    }

    result.phasesCompleted.push('validate');
  }

  if (input.phases.includes('build')) {
    result.phasesCompleted.push('build');
  }

  if (input.phases.includes('export')) {
    if (input.scan) {
      const rebuilt = input.scan;
      const orig = input.scan.original || rebuilt;
      result.audit = finalAssemblyAudit.run({
        scanId: input.scanId, correlationId,
        original: {
          apkHash: orig.apkHash || '',
          dexCount: orig.dexCount || 0,
          classCount: orig.classCount || 0,
          entryCount: orig.entryCount || 0,
          classes: orig.classes || [],
          files: orig.files || [],
        },
        rebuilt: {
          apkHash: rebuilt.apkHash || '',
          dexCount: rebuilt.dexCount || 0,
          classCount: rebuilt.classCount || 0,
          entryCount: rebuilt.entryCount || 0,
          classes: (input.classes || []).map(c => c.fqcn),
          files: rebuilt.files || [],
        },
        ledgerEntries: (await deps.truthLedger.getByScan(input.scanId)).map((e: any) => ({
          sourceSegment: e.source_segment || e.sourceSegment,
          validationOutcome: e.validation_outcome || e.validationOutcome,
          rationale: e.rationale,
        })),
        depConstraints: input.depConstraints || [],
      });
    }
    if (input.handshakeRequest && input.policyView) {
      result.handshake = fakeUpdateHandshake.handle({
        scanId: input.scanId, correlationId,
        request: input.handshakeRequest,
        view: input.policyView,
      });
    }
    result.phasesCompleted.push('export');
  }

  result.finishedAt = Date.now();
  eventBus.emit({
    scanId: input.scanId, correlationId, phase: 'export',
    functionId: 'orchestration_logs', severity: 'info',
    payload: {
      action: 'pipeline_complete',
      durationMs: result.finishedAt - startedAt,
      phases: result.phasesCompleted,
    },
  });

  return result;
}
