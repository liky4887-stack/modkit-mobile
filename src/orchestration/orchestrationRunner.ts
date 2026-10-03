import { PhaseId } from './types';
import { eventBus } from './eventBus';
import { strictExecutionProof } from './strictExecutionProof';
import { validationPhase, ValidationInput } from './validationPhase';
import { feedbackLoops, FeedbackAction } from './feedbackLoops';
import { binaryDiffViewer } from './binaryDiffViewer';
import {
  OrchestrationJob,
  OrchestrationAssignment,
  OrchestratorDeps,
  noopDeps,
  makeOrchestrator,
} from './centralOrchestrator';

// Structural dep interfaces — no concrete imports of SQLite-backed modules.
export interface RunnerDeps {
  truthLedger: {
    record(e: any): Promise<string>;
    getByScan(scanId: string): Promise<any[]>;
    getBySegment(segmentId: string): Promise<any[]>;
    markValidated(id: string, outcome: 'passed' | 'failed' | 'rolled_back'): Promise<void>;
    rollback(id: string): Promise<void>;
    detectConflicts(scanId: string): Promise<any[]>;
  };
  progressTracker: {
    upsertSegment(args: any): Promise<void>;
    updateStatus(segmentId: string, status: string, tokenUsed?: number): Promise<void>;
    snapshot(scanId: string): Promise<any>;
  };
  collisionGuard: {
    check(proposal: any): Promise<{ action: string; reason: string; winner?: string; mergedOffsets?: any[] }>;
  };
  dependencyMapper: {
    recordEdge(scanId: string, e: any): Promise<string>;
    ingestScan(scanId: string, scan: any): Promise<number>;
    getDownstream(scanId: string, assetId: string, depth?: number): Promise<string[]>;
    getDownstreamForSegments(scanId: string, segments: string[]): Promise<string[]>;
    stats(scanId: string): Promise<{ edges: number; sources: number; targets: number }>;
  };
  stateRecovery: {
    checkpoint(segmentId: string, status: string, partial?: unknown): Promise<void>;
    findOrphans(staleMs?: number): Promise<any[]>;
    bumpRetry(segmentId: string): Promise<number>;
    recoverOrphans(scanId: string, staleMs?: number): Promise<string[]>;
  };
  orchestrator: {
    orchestrateJob(job: OrchestrationJob): Promise<OrchestrationAssignment[]>;
    segmentForClass(className: string, estimatedTokens: number): any;
    segmentForNativeLib(libPath: string, estimatedTokens: number): any;
  };
  crossSessionIntelligence: {
    record(r: any): Promise<string>;
    lookup(segmentId: string, constraintType?: string): Promise<any[]>;
    all(): Promise<any[]>;
  };
}

export interface RunRequest {
  scanId: string;
  apkPath: string;
  transformedPath: string;
  phases: PhaseId[];
  segments: OrchestrationJob['segments'];
  workers: OrchestrationJob['workers'];
  totalTokenBudget: number;
  scan?: any;
}

export interface RunResult {
  scanId: string;
  correlationId: string;
  startedAt: number;
  finishedAt: number;
  phasesCompleted: PhaseId[];
  assignments: OrchestrationAssignment[];
  diff?: any;
  validation?: any;
  feedback: FeedbackAction[];
  recoveredSegments: string[];
  ledgerPending: number;
}

export function makeRunner(deps: RunnerDeps) {
  return {
    async run(req: RunRequest): Promise<RunResult> {
      const correlationId = req.scanId;
      const startedAt = Date.now();

      eventBus.emit({
        scanId: req.scanId, correlationId, phase: 'import',
        functionId: 'orchestration_logs', severity: 'info',
        payload: { action: 'run_start', apkPath: req.apkPath, phases: req.phases },
      });

      const recovered = await deps.stateRecovery.recoverOrphans(req.scanId);

      let depEdgeCount = 0;
      if (req.scan) {
        depEdgeCount = await deps.dependencyMapper.ingestScan(req.scanId, req.scan);
        eventBus.emit({
          scanId: req.scanId, correlationId, phase: 'investigate',
          functionId: 'dependency_mapper', severity: 'info',
          payload: { action: 'edges_ingested', count: depEdgeCount },
        });
      }

      const assignments = await deps.orchestrator.orchestrateJob({
        scanId: req.scanId,
        correlationId,
        totalTokenBudget: req.totalTokenBudget,
        segments: req.segments,
        workers: req.workers,
      });

      const phasesCompleted: PhaseId[] = [];

      let diff: any = undefined;
      if (req.phases.includes('validate') && req.apkPath && req.transformedPath) {
        try {
          diff = await binaryDiffViewer.compare({
            scanId: req.scanId, correlationId,
            originalPath: req.apkPath,
            transformedPath: req.transformedPath,
          });
        } catch (err) {
          await deps.crossSessionIntelligence.record({
            constraintType: 'diff_unavailable',
            description: String(err),
            encounteredBy: 'orchestrationRunner',
            affectedSegments: ['diff'],
            strategyAdjustment: 'defer validation, continue with structural checks',
          });
        }
      }

      let validation: any = undefined;
      const feedback: FeedbackAction[] = [];
      if (diff) {
        const ledger = await deps.truthLedger.getByScan(req.scanId);
        const ledgerPending = ledger.filter((e: any) => e.validation_outcome === 'pending').length;

        const vInput: ValidationInput = {
          scanId: req.scanId, correlationId,
          structuralDelta: Math.min(1, diff.summary.totalChangedBytes / 1e6),
          entropyDeviation: 0,
          concentrationScore: diff.concentrationScore,
          signatureStable: diff.summary.classesAdded === 0 && diff.summary.classesRemoved === 0,
          ledgerPendingCount: ledgerPending,
        };
        validation = validationPhase.run(vInput);
        phasesCompleted.push('validate');

        if (!validation.passed) {
          const actions = feedbackLoops.process({
            scanId: req.scanId, correlationId,
            currentPhase: 'validate',
            validation,
            affectedSegments: assignments.map(a => a.segmentId),
            priorAttempts: 0,
          });
          feedback.push(...actions);
        }
      }

      const ledgerAfter = await deps.truthLedger.getByScan(req.scanId);
      const ledgerPending = ledgerAfter.filter((e: any) => e.validation_outcome === 'pending').length;

      const finishedAt = Date.now();
      eventBus.emit({
        scanId: req.scanId, correlationId, phase: 'export',
        functionId: 'orchestration_logs', severity: 'info',
        payload: {
          action: 'run_complete',
          durationMs: finishedAt - startedAt,
          phases: phasesCompleted,
          ledgerPending,
        },
      });

      return {
        scanId: req.scanId,
        correlationId,
        startedAt,
        finishedAt,
        phasesCompleted,
        assignments,
        diff,
        validation,
        feedback,
        recoveredSegments: recovered,
        ledgerPending,
      };
    },

    async recordTransformation(args: {
      scanId: string;
      segmentId: string;
      phase: PhaseId;
      workerId: string;
      safetyScore: number;
      rawResponse: string;
      claimedOffsets?: { start: number; end: number }[];
      beforeHash?: string;
      afterHash?: string;
      rationale: string;
    }): Promise<{ ok: boolean; reason?: string; ledgerId?: string }> {
      const proof = strictExecutionProof.validate({
        scanId: args.scanId,
        correlationId: args.scanId,
        segmentId: args.segmentId,
        phase: args.phase === 'validate' ? 'analyze' : (args.phase as any),
        rawResponse: args.rawResponse,
        claimedOffsets: args.claimedOffsets,
        beforeHash: args.beforeHash,
        afterHash: args.afterHash,
      });
      if (!proof.valid || !proof.evidence) {
        return { ok: false, reason: 'proof_invalid:' + (proof.rejectionReason || 'unknown') };
      }

      const collision = await deps.collisionGuard.check({
        scanId: args.scanId,
        correlationId: args.scanId,
        segmentId: args.segmentId,
        workerId: args.workerId,
        phase: args.phase,
        offsets: proof.evidence.offsets,
        safetyScore: args.safetyScore,
      });
      if (collision.action === 'reject') {
        return { ok: false, reason: 'collision_reject' };
      }

      const ledgerId = await deps.truthLedger.record({
        correlationId: args.scanId,
        scanId: args.scanId,
        phase: args.phase,
        sourceSegment: args.segmentId,
        targetOffsets: proof.evidence.offsets,
        rationale: args.rationale || proof.evidence.rationale,
        beforeHash: proof.evidence.beforeHash,
        afterHash: proof.evidence.afterHash,
        validationOutcome: 'pending',
      });

      return { ok: true, ledgerId };
    },
  };
}
