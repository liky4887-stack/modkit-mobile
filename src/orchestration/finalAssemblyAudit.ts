// Pure logic. Given an original scan, a rebuilt scan, ledger entries,
// and dep constraints, decide accept/remediate/reject.
import { eventBus } from './eventBus';

export interface ScanSnapshot {
  apkHash: string;
  dexCount: number;
  classCount: number;
  entryCount: number;
  classes?: string[];
  files?: string[];
}

export interface AssemblyAuditInput {
  scanId: string;
  correlationId: string;
  original: ScanSnapshot;
  rebuilt: ScanSnapshot;
  ledgerEntries: Array<{
    sourceSegment: string;
    validationOutcome: string;
    rationale?: string;
  }>;
  depConstraints: Array<{ source: string; target: string; type: string }>;
  residualPatterns?: string[];   // e.g. ['__modkit_', '__orchestrator_', 'mkit_trace']
}

export interface AuditFinding {
  kind:
    | 'class_drift'
    | 'file_drift'
    | 'dex_drift'
    | 'ledger_pending'
    | 'dep_violation'
    | 'residual_marker';
  severity: 'info' | 'warn' | 'critical';
  detail: string;
}

export interface AssemblyAuditResult {
  passed: boolean;
  findings: AuditFinding[];
  finalDecision: 'accept' | 'remediate' | 'reject';
  integrityScore: number;   // 1.0 = perfect
}

const DEFAULT_RESIDUALS = ['__modkit_', '__orchestrator_', 'mkit_trace', '__healing_'];

export function auditAssembly(input: AssemblyAuditInput): AssemblyAuditResult {
  const findings: AuditFinding[] = [];
  const residuals = input.residualPatterns || DEFAULT_RESIDUALS;

  // 1. DEX file count
  if (input.original.dexCount !== input.rebuilt.dexCount) {
    findings.push({
      kind: 'dex_drift',
      severity: 'warn',
      detail: 'dex count ' + input.original.dexCount + ' -> ' + input.rebuilt.dexCount,
    });
  }

  // 2. Class set drift
  const origClasses = new Set(input.original.classes || []);
  const newClasses = new Set(input.rebuilt.classes || []);
  if (origClasses.size > 0 && newClasses.size > 0) {
    const added: string[] = [];
    const removed: string[] = [];
    for (const c of newClasses) if (!origClasses.has(c)) added.push(c);
    for (const c of origClasses) if (!newClasses.has(c)) removed.push(c);
    if (added.length > 0) {
      findings.push({
        kind: 'class_drift',
        severity: added.length > 10 ? 'critical' : 'warn',
        detail: 'classes added: ' + added.length + ' (first: ' + added.slice(0, 3).join(', ') + ')',
      });
    }
    if (removed.length > 0) {
      findings.push({
        kind: 'class_drift',
        severity: removed.length > 10 ? 'critical' : 'warn',
        detail: 'classes removed: ' + removed.length,
      });
    }
  }

  // 3. File drift
  const origFiles = new Set(input.original.files || []);
  const newFiles = new Set(input.rebuilt.files || []);
  if (origFiles.size > 0 && newFiles.size > 0) {
    const addedFiles: string[] = [];
    const removedFiles: string[] = [];
    for (const f of newFiles) if (!origFiles.has(f)) addedFiles.push(f);
    for (const f of origFiles) if (!newFiles.has(f)) removedFiles.push(f);
    if (addedFiles.length > 0 || removedFiles.length > 0) {
      findings.push({
        kind: 'file_drift',
        severity: 'info',
        detail: 'files +' + addedFiles.length + ' -' + removedFiles.length,
      });
    }
  }

  // 4. Ledger reconciliation
  const pending = input.ledgerEntries.filter(e => e.validationOutcome === 'pending');
  if (pending.length > 0) {
    findings.push({
      kind: 'ledger_pending',
      severity: 'critical',
      detail: pending.length + ' ledger entries still pending',
    });
  }

  // 5. Dependency constraints
  const touchedSegments = new Set(input.ledgerEntries.map(e => e.sourceSegment));
  const violated: string[] = [];
  for (const dep of input.depConstraints) {
    if (touchedSegments.has(dep.source) && !touchedSegments.has(dep.target)) {
      // Touched source but not its target — potential downstream break
      violated.push(dep.source + '->' + dep.target + ':' + dep.type);
    }
  }
  if (violated.length > 0) {
    findings.push({
      kind: 'dep_violation',
      severity: violated.length > 3 ? 'critical' : 'warn',
      detail: violated.length + ' untouched targets behind touched sources',
    });
  }

  // 6. Residual markers
  const residualHits: string[] = [];
  const filesLower = Array.from(newFiles).map(f => f.toLowerCase());
  for (const pattern of residuals) {
    const pl = pattern.toLowerCase();
    for (const f of filesLower) {
      if (f.indexOf(pl) >= 0) {
        residualHits.push(f);
        break;
      }
    }
  }
  if (residualHits.length > 0) {
    findings.push({
      kind: 'residual_marker',
      severity: 'critical',
      detail: 'orchestration trace present: ' + residualHits.slice(0, 3).join(', '),
    });
  }

  // Score
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const warnCount = findings.filter(f => f.severity === 'warn').length;
  const integrityScore = Math.max(0, 1 - criticalCount * 0.4 - warnCount * 0.1);

  let finalDecision: 'accept' | 'remediate' | 'reject';
  if (criticalCount === 0 && warnCount === 0) finalDecision = 'accept';
  else if (criticalCount === 0) finalDecision = 'remediate';
  else finalDecision = 'reject';

  return {
    passed: criticalCount === 0 && warnCount === 0,
    findings,
    finalDecision,
    integrityScore,
  };
}

export const finalAssemblyAudit = {
  run(input: AssemblyAuditInput): AssemblyAuditResult {
    const result = auditAssembly(input);
    eventBus.emit({
      scanId: input.scanId, correlationId: input.correlationId,
      phase: 'export', functionId: 'final_assembly_audit',
      severity: result.finalDecision === 'reject' ? 'critical'
              : result.finalDecision === 'remediate' ? 'warn' : 'info',
      payload: {
        action: 'audit_complete',
        decision: result.finalDecision,
        integrityScore: result.integrityScore,
        findings: result.findings.length,
      },
    });
    return result;
  },
};
