export type PhaseId =
  | 'import' | 'investigate' | 'analyze' | 'edit'
  | 'preview' | 'validate' | 'build' | 'export'
  | 'orchestrator' | 'recovery'
  | 'partition'
  | 'dispatch'
  | 'coordinate'
  | 'propose'
  | 'verify'
  | 'audit';

export type FunctionId =
  | 'feedback_loops' | 'validation_phase' | 'orchestration_logs'
  | 'state_recovery' | 'truth_ledger' | 'dependency_mapper'
  | 'strict_execution_proof' | 'collision_guard' | 'final_assembly_audit'
  | 'healing_loops' | 'central_orchestrator' | 'progress_tracker'
  | 'binary_diff_viewer' | 'signature_scrubber' | 'entropy_balancer'
  | 'heuristic_mimicry' | 'cross_session_intelligence' | 'temporal_shifter'
  | 'contextual_chameleon' | 'anti_analysis_tripwire' | 'dynamic_masking'
  | 'dynamic_resource_allocation' | 'version_continuity_guard'
  | 'fake_update_handshake' | 'auto_migration' | 'integrity_heartbeat';

export type Severity = 'info' | 'warn' | 'critical';

export type SegmentStatus =
  | 'pending' | 'assigned' | 'analyzing' | 'transforming'
  | 'validating' | 'completed' | 'failed' | 'rolled_back';

export interface OrchestrationEvent {
  id: string;
  timestamp: number;
  scanId: string;
  correlationId: string;
  phase: PhaseId;
  functionId: FunctionId;
  severity: Severity;
  payload: Record<string, unknown>;
}

export interface OffsetRange { start: number; end: number; }
