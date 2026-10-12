// Shared adapters that turn sidecar tool output into NewFinding rows.
// Both the standalone buttons on FINDINGS and the pipeline phases
// route through here so there is exactly one conversion per source.
import type { NewFinding, FindingRecord } from './pipelineStore';

// ── Bot roster → findings ─────────────────────────────────────────
export function botFindingsToRows(raw: any[]): NewFinding[] {
  return (raw || []).map((f: any) => ({
    unitId: null,
    severity: f.severity || 'info',
    category: f.category || 'bot-detection',
    title: f.title || 'Untitled',
    risk: f.risk || '',
    evidenceClass: f.evidence_class || null,
    evidenceMethod: f.evidence_method || null,
    evidenceSource: f.evidence_source || 'bot:unknown',
    patch: f.patch || {},
    verification: f.verification || null,
    confidence: typeof f.confidence === 'number' ? f.confidence : 0.8,
    confidenceBand: f.confidence_band ?? 'medium',
  }));
}

// ── Feature hunt → findings ───────────────────────────────────────
function severityForFeature(cls: string, conf: number): FindingRecord['severity'] {
  if (cls !== 'mod_artifact') return 'info';
  if (conf >= 0.9) return 'high';
  if (conf >= 0.7) return 'medium';
  if (conf >= 0.3) return 'low';
  return 'info';
}

function bandFor(conf: number): 'high' | 'medium' | 'low' {
  if (conf >= 0.9) return 'high';
  if (conf >= 0.7) return 'medium';
  return 'low';
}

function featureHitToRow(h: any, cls: string): NewFinding {
  const conf = typeof h.confidence === 'number' ? h.confidence : 0.5;
  const evidence = (h.evidence || [])
    .slice(0, 3)
    .map((e: any) => `${e.pattern || '?'} → ${(e.matched || '').slice(0, 80)}`)
    .join(' · ');
  const srcs = Array.isArray(h.sources) ? h.sources.join(',') : (h.source || 'dex');
  return {
    unitId: null,
    severity: severityForFeature(cls, conf),
    category: h.category || 'feature-hunt',
    title: h.feature_name || h.feature_id || 'feature',
    risk: h.notes || '',
    evidenceClass: h.feature_id || null,
    evidenceMethod: evidence || null,
    evidenceSource: `feature_hunt:${cls}:${srcs}`,
    patch: {},
    verification: null,
    confidence: conf,
    confidenceBand: bandFor(conf),
  };
}

export function featureReportToRows(report: any): NewFinding[] {
  const rows: NewFinding[] = [];
  for (const h of report.mod_artifacts       || []) rows.push(featureHitToRow(h, 'mod_artifact'));
  for (const h of report.anti_tamper_surface || []) rows.push(featureHitToRow(h, 'anti_tamper_surface'));
  for (const h of report.framework_markers   || []) rows.push(featureHitToRow(h, 'framework_marker'));

  const fp = report.fingerprint || {};
  const notable: string[] = [
    ...((fp.packer     || []) as string[]).map(p => `packer: ${p}`),
    ...((fp.obfuscator || []) as string[]).map(o => `obfuscator: ${o}`),
  ];
  if (notable.length > 0) {
    rows.push({
      unitId: null,
      severity: 'info',
      category: 'fingerprint',
      title: 'APK protection fingerprint',
      risk: notable.join(' · '),
      evidenceClass: null,
      evidenceMethod: null,
      evidenceSource: 'feature_hunt:fingerprint',
      patch: {},
      verification: null,
      confidence: 0.9,
      confidenceBand: 'high',
    });
  }
  return rows;
}
