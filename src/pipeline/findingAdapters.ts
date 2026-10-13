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

function featureHitFromFleet(h: any): NewFinding {
  const cls = h.finding_class || 'mod_artifact';
  const conf = typeof h.confidence === 'number' ? h.confidence : 0.5;
  const ev = (h.evidence || [])
    .slice(0, 3)
    .map((e: any) => `${e.pattern || '?'} → ${(e.matched || '').slice(0, 80)}`)
    .join(' · ');
  return {
    unitId: null,
    severity: h.severity || (cls !== 'mod_artifact' ? 'info'
              : conf >= 0.9 ? 'critical'
              : conf >= 0.7 ? 'high'
              : conf >= 0.5 ? 'medium'
              : conf >= 0.3 ? 'low' : 'info'),
    category: h.category || 'feature-hunt',
    title: h.feature_name || h.feature_id || 'feature',
    risk: h.risk || h.notes || '',
    evidenceClass: h.feature_id || null,
    evidenceMethod: ev || null,
    evidenceSource: `feature_hunt:${cls}:${h.source || 'dex'}`,
    patch: {},
    verification: null,
    confidence: conf,
    confidenceBand: conf >= 0.9 ? 'high' : conf >= 0.7 ? 'medium' : 'low',
  };
}

export function featureReportToRows(report: any): NewFinding[] {
  const rows: NewFinding[] = [];
  const hasFleetShape = report
    && Array.isArray(report.hits)
    && (Array.isArray(report.mod_artifacts)
        || Array.isArray(report.anti_tamper_surface)
        || Array.isArray(report.framework_markers));
  if (hasFleetShape) {
    for (const h of (report.mod_artifacts       || [])) rows.push(featureHitFromFleet(h));
    for (const h of (report.anti_tamper_surface || [])) rows.push(featureHitFromFleet(h));
    for (const h of (report.framework_markers   || [])) rows.push(featureHitFromFleet(h));
    return rows;
  }
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

// ── Nested APK diff → findings ────────────────────────────────────
// The sidecar returns findings[] already in near-final shape. We
// normalise field names (snake_case → camel) and add the adapter's
// standard wrapping.
export function nestedDiffToRows(report: any): NewFinding[] {
  const raw = report && Array.isArray(report.findings) ? report.findings : [];
  return raw.map((f: any) => ({
    unitId: null,
    severity: f.severity || 'info',
    category: f.category || 'nested_container',
    title: f.title || 'Nested APK',
    risk: f.risk || '',
    evidenceClass: f.evidence_class || null,
    evidenceMethod: f.evidence_method || null,
    evidenceSource: f.evidence_source || 'nested_diff',
    patch: f.patch || {},
    verification: f.verification || null,
    confidence: typeof f.confidence === 'number' ? f.confidence : 0.7,
    confidenceBand: f.confidence_band ?? 'medium',
  }));
}

// ── Structural .so analysis → findings ────────────────────────────
// The structural tool buckets findings by class already
// (mod_artifacts / anti_tamper_surface / framework_markers). Each
// carries feature_id, feature_name, confidence, evidence[] and a
// lib field naming the .so it came from.
export function structuralReportToRows(report: any): NewFinding[] {
  const rows: NewFinding[] = [];
  const all: any[] = [
    ...(report.mod_artifacts       || []),
    ...(report.anti_tamper_surface || []),
    ...(report.framework_markers   || []),
  ];

  for (const f of all) {
    const cls = f.finding_class || 'framework_marker';
    const conf = typeof f.confidence === 'number' ? f.confidence : 0.5;
    const ev = (f.evidence || [])
      .slice(0, 4)
      .map((e: any) => `${e.pattern || '?'} → ${(e.matched || '').slice(0, 80)}`)
      .join(' · ');
    rows.push({
      unitId: null,
      severity: f.severity || (cls !== 'mod_artifact' ? 'info'
                : conf >= 0.9 ? 'critical'
                : conf >= 0.7 ? 'high'
                : conf >= 0.5 ? 'medium'
                : conf >= 0.3 ? 'low' : 'info'),
      category: f.category || 'structural',
      title: f.feature_name || f.feature_id || 'structural',
      risk: f.risk || '',
      evidenceClass: f.feature_id || null,
      evidenceMethod: ev || null,
      evidenceSource: `structural:${cls}:${f.lib || 'apk'}`,
      patch: {},
      verification: null,
      confidence: conf,
      confidenceBand: conf >= 0.9 ? 'high' : conf >= 0.7 ? 'medium' : 'low',
    });
  }
  return rows;
}

// ── Anti-cheat integrity → findings ───────────────────────────────
// Two kinds of rows: per-library details (roster match) and
// aggregate summaries (anti-cheat present / intact / modified).
// Both arrive bucketed by finding_class already, we just normalize
// to NewFinding row shape.
export function anticheatReportToRows(report: any): NewFinding[] {
  const rows: NewFinding[] = [];
  const all: any[] = [
    ...(report.mod_artifacts       || []),
    ...(report.anti_tamper_surface || []),
    ...(report.framework_markers   || []),
  ];

  for (const f of all) {
    const cls = f.finding_class || 'anti_tamper_surface';
    const conf = typeof f.confidence === 'number' ? f.confidence : 0.8;
    const ev = (f.evidence || [])
      .slice(0, 4)
      .map((e: any) => `${e.pattern || '?'} → ${(e.matched || '').slice(0, 80)}`)
      .join(' · ');
    rows.push({
      unitId: null,
      severity: f.severity || (cls !== 'mod_artifact' ? 'info'
                : conf >= 0.9 ? 'critical'
                : conf >= 0.7 ? 'high'
                : 'medium'),
      category: f.category || 'anticheat',
      title: f.feature_name || f.feature_id || 'anticheat',
      risk: f.risk || '',
      evidenceClass: f.feature_id || null,
      evidenceMethod: ev || null,
      evidenceSource: `anticheat:${cls}:${f.lib || f.vendor || 'ace'}`,
      patch: {},
      verification: null,
      confidence: conf,
      confidenceBand: conf >= 0.9 ? 'high' : conf >= 0.7 ? 'medium' : 'low',
    });
  }
  return rows;
}
