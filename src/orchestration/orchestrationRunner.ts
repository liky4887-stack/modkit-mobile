import { PhaseId } from './types';
import { eventBus } from './eventBus';
import { truthLedger } from './truthLedger';
import { progressTracker } from './progressTracker';
import { collisionGuard } from './collisionGuard';
import { strictExecutionProof } from './strictExecutionProof';
import { validationPhase, ValidationInput } from './validationPhase';
import { feedbackLoops, FeedbackAction } from './feedbackLoops';
import { binaryDiffViewer } from './binaryDiffViewer';
import { dependencyMapper } from './dependencyMapper';
import { stateRecovery } from './stateRecovery';
import { crossSessionIntelligence } from './crossSessionIntelligence';
import {
  centralOrchestrator,
  OrchestrationJob,
  OrchestrationAssignment,
} from './centralOrchestrator';

export interface RunRequest {
  scanId: string;
  apkPath: string;
  transformedPath: string;
  phases: PhaseId[];
  segments: OrchestrationJob['segments'];
  workers: OrchestrationJob['workers'];
  totalTokenBudget: number;
  scan?: any;   // optional pre-parsed deep-scan result for dependencyMapper.ingestScan
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

export const orchestrationRunner = {
  async run(req: RunRequest): Promise<RunResult> {
    const correlationId = req.scanId;
    const startedAt = Date.now();

    eventBus.emit({
      scanId: req.scanId, correlationId, phase: 'import',
      functionId: 'orchestration_logs', severity: 'info',
      payload: { action: 'run_start', apkPath: req.apkPath, phases: req.phases },
    });

    // 1. Recover any orphaned segments from a prior interrupted run
    const recovered = await stateRecovery.recoverOrphans(req.scanId);

    // 2. Ingest dependency edges (if scan provided)
    let depEdgeCount = 0;
    if (req.scan) {
      depEdgeCount = await dependencyMapper.ingestScan(req.scanId, req.scan);
      eventBus.emit({
        scanId: req.scanId, correlationId, phase: 'investigate',
        functionId: 'dependency_mapper', severity: 'info',
        payload: { action: 'edges_ingested', count: depEdgeCount },
      });
    }

    // 3. Orchestrate segments
    const assignments = await centralOrchestrator.orchestrateJob({
      scanId: req.scanId,
      correlationId,
      totalTokenBudget: req.totalTokenBudget,
      segments: req.segments,
      workers: req.workers,
    });

    const phasesCompleted: PhaseId[] = [];

    // 4. Diff (if both paths present)
    let diff: any = undefined;
    if (req.phases.includes('validate') && req.apkPath && req.transformedPath) {
      try {
        diff = await binaryDiffViewer.compare({
          scanId: req.scanId, correlationId,
          originalPath: req.apkPath,
          transformedPath: req.transformedPath,
        });
      } catch (err) {
        await crossSessionIntelligence.record({
          constraintType: 'diff_unavailable',
          description: String(err),
          encounteredBy: 'orchestrationRunner',
          affectedSegments: ['diff'],
          strategyAdjustment: 'defer validation, continue with structural checks',
        });
      }
    }

    // 5. Validation (if diff available)
    let validation: any = undefined;
    const feedback: FeedbackAction[] = [];
    if (diff) {
      const ledger = await truthLedger.getByScan(req.scanId);
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

    const ledgerAfter = await truthLedger.getByScan(req.scanId);
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

  originalAndTransformedPresent(req: RunRequest): boolean {
    return !!(req.apkPath && req.transformedPath);
  },

  // Record one transformation with full evidence. Caller supplies the raw
  // worker response; we enforce strict proof + collision check + ledger write.
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

    const collision = await collisionGuard.check({
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

    const ledgerId = await truthLedger.record({
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
