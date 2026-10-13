// PHASE GUARDS — pre-flight and post-flight verification.
//
// Every phase in the pipeline runs through two checks:
//
//   preCheck  — does this phase have the input it needs?
//   postCheck — does the summary it produced actually look like work
//               was done, or did the phase "succeed" while producing
//               nothing?
//
// If a guard fails, the runner throws. The phase is marked failed in
// the DB, the job stops, and the reason is persisted. That prevents
// "fake completion" — a phase that returned an empty string and the
// loop just moved on.
//
// This is the control layer that holds the flow together.
import { pipelineStore, type PhaseId, type JobRecord } from './pipelineStore';

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

// ── Pre-flight: verify the phase has its input ──────────────────────
export async function preCheck(
  phase: PhaseId,
  job: JobRecord,
): Promise<GuardResult> {
  switch (phase) {
    case 'import':
      if (!job.apkPath) return { ok: false, reason: 'no apkPath set on job' };
      return { ok: true };

    case 'decombine':
      if (!job.apkPath) return { ok: false, reason: 'import did not set apkPath' };
      return { ok: true };

    case 'bots':
    case 'features':
    case 'nested':
    case 'structural':
    case 'anticheat':
    case 'gates':
      if (!job.apkPath) return { ok: false, reason: phase + ': no apkPath' };
      return { ok: true };

    case 'review_gate':
      // requires findings to exist (even zero is ok as long as prior
      // phases ran)
      return { ok: true };

    case 'recombine': {
      // recombine can legitimately run with an empty selection (the
      // EXPORT-ONLY path). Nothing to pre-check.
      return { ok: true };
    }

    case 'export':
    case 'audit':
      return { ok: true };

    default:
      return { ok: true };
  }
}

// ── Post-flight: verify the summary is not fake-complete ────────────
export async function postCheck(
  phase: PhaseId,
  job: JobRecord,
  summary: string,
): Promise<GuardResult> {
  const s = summary || '';

  // Every post-check: reject empty summary outright. A phase that
  // returned '' did not do work and should not be marked done.
  if (!s.trim()) {
    return { ok: false, reason: phase + ': empty summary (phase did not return a result)' };
  }

  switch (phase) {
    case 'import': {
      if (!s.includes('pkg=')) {
        return { ok: false, reason: 'import summary missing pkg= (load may have failed silently)' };
      }
      return { ok: true };
    }

    case 'decombine': {
      // Valid outcomes:
      //   "not combined — plain APK"        (nothing to unpack)
      //   "unpacked · apk N.N GB + obb N MB" (unpacked and reloaded)
      //   "decombine error: ..."             (rejected below)
      if (/error|failed|exception/i.test(s)) {
        return { ok: false, reason: 'decombine reported error: ' + s.slice(0, 160) };
      }
      if (s.includes('not combined') || s.includes('plain apk') ||
          s.includes('plain APK') || s.includes('unpacked') ||
          s.includes('inner apk')) {
        return { ok: true };
      }
      return { ok: false, reason: 'decombine: ambiguous result — ' + s.slice(0, 120) };
    }

    case 'bots': {
      if (/error|failed/i.test(s)) {
        return { ok: false, reason: 'bots error in summary: ' + s.slice(0, 160) };
      }
      if (!/\d+\s+findings/.test(s)) {
        return { ok: false, reason: 'bots: no finding count (work not confirmed)' };
      }
      return { ok: true };
    }

    case 'features': {
      if (/error|failed/i.test(s)) {
        return { ok: false, reason: 'features error in summary: ' + s.slice(0, 160) };
      }
      if (!/\d+\s+findings/.test(s)) {
        return { ok: false, reason: 'features: no finding count' };
      }
      return { ok: true };
    }

    case 'nested': {
      if (/error|failed/i.test(s)) {
        return { ok: false, reason: 'nested error in summary: ' + s.slice(0, 160) };
      }
      if (/no nested/i.test(s)) return { ok: true };
      if (/\d+\s+findings/.test(s)) return { ok: true };
      return { ok: false, reason: 'nested: ambiguous summary — ' + s.slice(0, 120) };
    }

    case 'structural': {
      if (/error|failed/i.test(s)) {
        return { ok: false, reason: 'structural error: ' + s.slice(0, 160) };
      }
      if (/\d+\s+findings/.test(s)) return { ok: true };
      return { ok: false, reason: 'structural: no finding count' };
    }

    case 'anticheat': {
      if (/error|failed/i.test(s)) {
        return { ok: false, reason: 'anticheat error: ' + s.slice(0, 160) };
      }
      if (/\d+\s+findings/.test(s)) return { ok: true };
      return { ok: false, reason: 'anticheat: no finding count' };
    }

    case 'gates': {
      if (/error|failed/i.test(s)) {
        return { ok: false, reason: 'gates error: ' + s.slice(0, 160) };
      }
      // Valid gates summary shape: "N license · login found|no login · N patchable features"
      if (!/license/i.test(s)) {
        return { ok: false, reason: 'gates: no license count in summary' };
      }
      return { ok: true };
    }

    case 'review_gate': {
      if (/error/i.test(s) && !/no error/i.test(s)) {
        return { ok: false, reason: 'review_gate error: ' + s.slice(0, 160) };
      }
      return { ok: true };
    }

    case 'recombine': {
      // If the summary says "skipped" — user chose EXPORT ONLY. Valid.
      if (/skipped|no patches/i.test(s)) return { ok: true };

      // Otherwise, the summary must include a filename and patch count.
      // e.g. "2 patches → DxCheat-bypassed.apk (7930 KB)"
      if (!/\d+\s+patches/.test(s)) {
        return { ok: false, reason: 'recombine: no patch count in summary' };
      }

      // Independent verification: read the plan and confirm the output
      // path + size were persisted AND size > 0.
      const plan: any = await pipelineStore.getJobPlan(job.id).catch(() => null);
      const out = plan?.recombined_apk;
      const size = plan?.recombined_size;
      if (!out) {
        return { ok: false, reason: 'recombine: recombined_apk not persisted in plan' };
      }
      if (!size || size < 1024) {
        return { ok: false, reason: 'recombine: output size is 0 or missing' };
      }
      return { ok: true };
    }

    case 'export': {
      if (/error|failed/i.test(s)) {
        return { ok: false, reason: 'export error: ' + s.slice(0, 160) };
      }
      if (!/report/i.test(s)) {
        return { ok: false, reason: 'export: no report path in summary' };
      }
      return { ok: true };
    }

    case 'audit':
      return { ok: true };

    default:
      return { ok: true };
  }
}
