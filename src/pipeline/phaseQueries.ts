// Phase query templates. Each phase has a structured query that gets
// sent to the agent loop. Keeping them isolated so prompt iteration doesn't
// touch the runner.

import type { UnitRecord } from './pipelineStore';

export const PHASE_QUERIES = {
  // ── partition ─────────────────────────────────────────────
  // (already inlined in pipelineRunner; move here later)

  // ── investigate (deep, per unit) ──────────────────────────
  investigate(unit: UnitRecord): string {
    const seeds = (() => {
      try {
        const parsed = JSON.parse(unit.classesJson || '[]');
        return Array.isArray(parsed) && parsed.length > 0
          ? parsed.slice(0, 20).join(', ')
          : '(none)';
      } catch { return '(none)'; }
    })();

    return [
      'Investigate the following work unit of a larger privacy and',
      'compliance review. This app is being catalogued for its third-party',
      'SDKs, network endpoints, permission usage, and data-collection',
      'surfaces. Output feeds an SBOM (software bill of materials) audit.',
      '',
      'Unit name: ' + unit.name,
      'Unit kind: ' + unit.kind,
      'Seed strings: ' + seeds,
      '',
      'Your goals:',
      '  1. Identify which classes belong to this unit.',
      '  2. For each class, determine its role (SDK integration point,',
      '     data collector, network caller, config loader, etc.).',
      '  3. List any external SDKs, endpoints, or capabilities this unit',
      '     links to.',
      '  4. Note any classes that call dangerous permission APIs.',
      '',
      'Tools you will use most:',
      '  • find_classes_by_name — enumerate classes matching a prefix',
      '  • find_classes_using_strings — find SDK references by marker',
      '  • decompile_class — read the source of key classes',
      '  • list_class_methods — see what a class exposes',
      '  • find_call_sites_to — trace who invokes a suspicious method',
      '  • permission_callers — see which classes touch permissions',
      '',
      'Budget: 30 tool calls. Work methodically, do not burn budget on',
      'repeated searches.',
      '',
      'When you have enough evidence, return {"final": "..."} where the',
      'answer is a structured markdown report with:',
      '',
      '  ## Unit: ' + unit.name,
      '  **Kind:** ' + unit.kind,
      '  **Classes found:** N',
      '  **Key classes:**',
      '  - com.foo.Bar — role (integration point, etc.)',
      '  **External SDKs:** SDK name → class that references it',
      '  **Network endpoints:** host/url → caller class',
      '  **Permission usage:** permission → classes',
      '  **Notes:** anything anomalous',
    ].join('\n');
  },

  // ── coordinate ────────────────────────────────────────────
  coordinate(units: UnitRecord[], investigations: string[]): string {
    const reportBlocks = investigations.map((ans, i) =>
      '=== UNIT ' + (i + 1) + ': ' + (units[i]?.name || '?') + ' ===\n' + (ans || '(no answer)')
    ).join('\n\n');

    return [
      'You are the coordinator of a privacy and compliance review.',
      'Below are the investigation reports from each work unit of the',
      'app. Read them all, then produce a single consolidated plan.',
      '',
      'The plan must:',
      '  1. Group units by shared concern (e.g. "analytics stack", "auth",',
      '     "network transport", "device identity").',
      '  2. Identify the highest-value findings — cross-unit patterns,',
      '     unexpected SDKs, broad permission use.',
      '  3. Propose a list of actionable remediations. Each remediation',
      '     must name a specific target class and describe the change.',
      '',
      'Do NOT call any tools. This is a synthesis task. Base your answer',
      'only on the reports below.',
      '',
      'Return {"final": "..."} with a markdown plan that ends with a JSON',
      'array of remediation proposals in a fenced ```json block:',
      '',
      '```json',
      '[',
      '  {"id":"r1","title":"...","target_class":"com.foo.Bar",',
      '   "rationale":"...","expected_effect":"..."},',
      '  {"id":"r2", ...}',
      ']',
      '```',
      '',
      reportBlocks,
    ].join('\n');
  },

  // ── propose (per remediation) ─────────────────────────────
  propose(remediation: any, investigationContext: string): string {
    return [
      'You are drafting a concrete change proposal for a privacy and',
      'compliance remediation identified during a review.',
      '',
      'Remediation title: ' + (remediation?.title || '?'),
      'Target class: ' + (remediation?.target_class || '?'),
      'Rationale: ' + (remediation?.rationale || '?'),
      'Expected effect: ' + (remediation?.expected_effect || '?'),
      '',
      'Context from the review:',
      investigationContext,
      '',
      'Your task:',
      '  1. Decompile the target class to understand its current behavior.',
      '  2. Propose a concrete, minimal change that achieves the expected',
      '     effect while preserving application functionality.',
      '  3. Prefer data minimization, disclosure, or hardening — not',
      '     removal, unless removal is clearly correct.',
      '',
      'Return {"final": "..."} where the answer is markdown with:',
      '',
      '  ### Proposal',
      '  **Target:** class name',
      '  **Change type:** instrumentation | configuration | disclosure | hardening',
      '  **Description:** what changes',
      '  **Rationale:** why',
      '  **Verification:** how to confirm',
      '',
      'No code payloads yet — the payload generation is a separate step.',
    ].join('\n');
  },

  // ── export (per proposal) ─────────────────────────────────
  exportArtifact(proposal: string, findingsSummary: string): string {
    return [
      'Produce a final deliverable artifact for the following proposal',
      'from a privacy and compliance review.',
      '',
      'Proposal:',
      proposal,
      '',
      'Findings context:',
      findingsSummary,
      '',
      'Return {"final": "..."} with a markdown artifact that includes:',
      '',
      '  # <artifact title>',
      '  ## Summary',
      '  ## Affected classes',
      '  ## Recommended change (concrete, actionable)',
      '  ## Verification steps',
      '  ## Risks',
      '',
      'The artifact is for the app owner to review. It is documentation,',
      'not an automated patch.',
    ].join('\n');
  },
};
