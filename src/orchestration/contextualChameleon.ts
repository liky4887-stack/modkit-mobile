// Pure logic. Checks a proposed change against surrounding context:
// naming, API usage, string style, package structure.
import { eventBus } from './eventBus';

export interface ContextSnapshot {
  packageName: string;
  parentClasses: string[];
  siblingMethods: string[];
  calledBy: string[];
  calls: string[];
  stringConstants: string[];
}

export interface ProposedChange {
  changeId: string;
  targetSegment: string;
  proposedContent: string;
  changeKind: 'rename' | 'add_method' | 'add_string' | 'add_class';
}

export interface ContextViolation {
  type: 'naming' | 'api_usage' | 'string_style' | 'package_structure';
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ContextVerdict {
  changeId: string;
  consistent: boolean;
  violations: ContextViolation[];
  suggestedAdjustment?: string;
}

function lastSegment(fqcn: string): string {
  const parts = fqcn.split('.');
  return parts[parts.length - 1] || '';
}

function caseOf(token: string): 'pascal' | 'camel' | 'snake' | 'unknown' {
  if (/^[a-z][a-zA-Z0-9]*$/.test(token)) return 'camel';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(token)) return 'pascal';
  if (/^[a-z][a-z0-9_]*$/.test(token)) return 'snake';
  return 'unknown';
}

export function checkContext(
  change: ProposedChange,
  ctx: ContextSnapshot
): ContextVerdict {
  const violations: ContextViolation[] = [];

  // --- naming consistency ---
  if (change.changeKind === 'rename' || change.changeKind === 'add_class') {
    const proposedName = lastSegment(change.proposedContent);
    const observedCase = caseOf(proposedName);
    const siblingCases = ctx.parentClasses.map(p => caseOf(lastSegment(p)));
    const dominant = siblingCases.filter(c => c !== 'unknown').sort((a, b) =>
      siblingCases.filter(x => x === b).length - siblingCases.filter(x => x === a).length
    )[0];
    if (dominant && observedCase !== dominant) {
      violations.push({
        type: 'naming',
        description: 'case ' + observedCase + ' vs sibling norm ' + dominant,
        severity: 'medium',
      });
    }
  }

  // --- string style ---
  if (change.changeKind === 'add_string') {
    const proposed = change.proposedContent.replace(/^"|"$/g, '');
    const existing = ctx.stringConstants;
    if (existing.length > 0) {
      const avgLen = existing.reduce((s, x) => s + x.length, 0) / existing.length;
      if (Math.abs(proposed.length - avgLen) > avgLen) {
        violations.push({
          type: 'string_style',
          description: 'length ' + proposed.length + ' far from avg ' + avgLen.toFixed(1),
          severity: 'low',
        });
      }
      // pattern: does project use snake_case labels?
      const snakeStyle = existing.filter(s => /^[a-z_]+$/.test(s)).length / existing.length;
      if (snakeStyle > 0.7 && !/^[a-z_]+$/.test(proposed)) {
        violations.push({
          type: 'string_style',
          description: 'expected snake_case label style',
          severity: 'medium',
        });
      }
    }
  }

  // --- API usage: method signature shape ---
  if (change.changeKind === 'add_method') {
    const methodName = change.proposedContent.split('(')[0].trim();
    const observedCase = caseOf(methodName);
    const siblingCases = ctx.siblingMethods.map(m => caseOf(m.split('(')[0].trim()));
    const camel = siblingCases.filter(c => c === 'camel').length;
    const pascal = siblingCases.filter(c => c === 'pascal').length;
    const dominant = camel >= pascal ? 'camel' : 'pascal';
    if (siblingCases.length > 0 && observedCase !== dominant) {
      violations.push({
        type: 'api_usage',
        description: 'method case ' + observedCase + ' vs dominant ' + dominant,
        severity: 'medium',
      });
    }
  }

  // --- package structure ---
  const proposedParts = change.proposedContent.split('.');
  if (change.changeKind === 'add_class' && proposedParts.length > 0) {
    const top = proposedParts.slice(0, 2).join('.');
    const ctxTop = ctx.packageName.split('.').slice(0, 2).join('.');
    if (top !== ctxTop) {
      violations.push({
        type: 'package_structure',
        description: 'top package ' + top + ' vs context ' + ctxTop,
        severity: 'high',
      });
    }
  }

  const high = violations.filter(v => v.severity === 'high').length;
  const consistent = violations.length === 0 || high === 0 && violations.length <= 1;
  let suggestedAdjustment: string | undefined;
  if (!consistent && violations[0].type === 'package_structure') {
    suggestedAdjustment = 'move under ' + ctx.packageName;
  }

  return { changeId: change.changeId, consistent, violations, suggestedAdjustment };
}

export const contextualChameleon = {
  analyze(args: {
    scanId: string;
    correlationId: string;
    changes: ProposedChange[];
    contexts: Record<string, ContextSnapshot>;   // keyed by segment
  }): { verdicts: ContextVerdict[]; rejected: number } {
    const verdicts: ContextVerdict[] = [];
    for (const c of args.changes) {
      const ctx = args.contexts[c.targetSegment];
      if (!ctx) continue;
      verdicts.push(checkContext(c, ctx));
    }

    const rejected = verdicts.filter(v => !v.consistent).length;

    eventBus.emit({
      scanId: args.scanId, correlationId: args.correlationId,
      phase: 'analyze', functionId: 'contextual_chameleon',
      severity: rejected > 0 ? 'warn' : 'info',
      payload: {
        action: 'context_analyzed',
        total: verdicts.length,
        rejected,
      },
    });

    return { verdicts, rejected };
  },
};
