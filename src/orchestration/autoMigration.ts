// Pure logic. Given a ledger from an old base version and a diff
// between old and new bases, attempt to re-map successful transforms
// onto the new base. Failed mappings are returned for review.
import { eventBus } from './eventBus';
import { OffsetRange } from './types';

export interface PriorLedgerEntry {
  id: string;
  sourceSegment: string;
  targetOffsets: OffsetRange[];
  rationale: string;
  validationOutcome: string;
  beforeHash: string;
  afterHash: string;
}

export interface BaseDelta {
  // classes added in new base (present in new, not old)
  classesAdded: string[];
  // classes removed in new base
  classesRemoved: string[];
  // classes present in both (mappable)
  classesCommon: string[];
  // per-class offset shift if computable
  classOffsetShift?: Record<string, number>;
}

export interface MigrationResult {
  successful: PriorLedgerEntry[];
  failed: Array<{ entry: PriorLedgerEntry; reason: string }>;
  newLedger: PriorLedgerEntry[];
  validationRequired: boolean;
  migrationRate: number;    // 0..1
}

export function computeDelta(oldClasses: string[], newClasses: string[]): BaseDelta {
  const oldSet = new Set(oldClasses);
  const newSet = new Set(newClasses);
  const classesAdded: string[] = [];
  const classesRemoved: string[] = [];
  const classesCommon: string[] = [];

  for (const c of newSet) {
    if (oldSet.has(c)) classesCommon.push(c);
    else classesAdded.push(c);
  }
  for (const c of oldSet) {
    if (!newSet.has(c)) classesRemoved.push(c);
  }
  return { classesAdded, classesRemoved, classesCommon };
}

export function remapEntry(
  entry: PriorLedgerEntry,
  delta: BaseDelta
): { ok: true; remapped: PriorLedgerEntry } | { ok: false; reason: string } {
  const cls = entry.sourceSegment;
  if (delta.classesRemoved.indexOf(cls) >= 0) {
    return { ok: false, reason: 'class removed in new base' };
  }

  // Segment must have been validated previously
  if (entry.validationOutcome !== 'passed') {
    return { ok: false, reason: 'prior entry did not pass validation: ' + entry.validationOutcome };
  }

  const shift = delta.classOffsetShift ? (delta.classOffsetShift[cls] || 0) : 0;
  const remapped: PriorLedgerEntry = {
    ...entry,
    targetOffsets: entry.targetOffsets.map(o => ({
      start: o.start + shift,
      end: o.end + shift,
    })),
    validationOutcome: 'pending',   // must re-validate
  };
  return { ok: true, remapped };
}

export function migrateLedger(
  prior: PriorLedgerEntry[],
  delta: BaseDelta
): MigrationResult {
  const successful: PriorLedgerEntry[] = [];
  const failed: Array<{ entry: PriorLedgerEntry; reason: string }> = [];

  for (const entry of prior) {
    const r = remapEntry(entry, delta);
    if (r.ok) successful.push(r.remapped);
    else failed.push({ entry, reason: r.reason });
  }

  const total = prior.length;
  const migrationRate = total === 0 ? 1 : successful.length / total;

  return {
    successful,
    failed,
    newLedger: successful,
    validationRequired: true,
    migrationRate,
  };
}

export const autoMigration = {
  plan(args: {
    scanId: string;
    correlationId: string;
    priorLedger: PriorLedgerEntry[];
    oldClasses: string[];
    newClasses: string[];
    classOffsetShift?: Record<string, number>;
  }): MigrationResult {
    const delta = computeDelta(args.oldClasses, args.newClasses);
    if (args.classOffsetShift) delta.classOffsetShift = args.classOffsetShift;

    const result = migrateLedger(args.priorLedger, delta);

    eventBus.emit({
      scanId: args.scanId, correlationId: args.correlationId,
      phase: 'import', functionId: 'auto_migration',
      severity: result.failed.length > 0 ? 'warn' : 'info',
      payload: {
        action: 'migration_planned',
        priorEntries: args.priorLedger.length,
        successful: result.successful.length,
        failed: result.failed.length,
        migrationRate: Number(result.migrationRate.toFixed(3)),
        classesAdded: delta.classesAdded.length,
        classesRemoved: delta.classesRemoved.length,
      },
    });

    return result;
  },
};
