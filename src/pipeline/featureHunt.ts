// Feature-hunt bridge — runs apk_feature_full on the sidecar and writes
// the resulting hits as findings so the FINDINGS tab renders them with
// the same code path it uses for bot findings.
//
// Sidecar side: feature_hunt.py's apk_feature_full returns a report
// with three groups (mod_artifacts / anti_tamper_surface /
// framework_markers) plus a fingerprint. Each entry here becomes one
// row in the findings table, tagged so the source is visible.
import { pipelineStore, type NewFinding, type FindingRecord } from './pipelineStore';

const BACKEND = 'http://127.0.0.1:8792';

export interface FeatureHuntResult {
  jobId: string;
  findingsCount: number;
  modArtifacts: number;
  antiTamper: number;
  frameworkMarkers: number;
  fingerprint: {
    obfuscator: string[];
    packer: string[];
    hook_framework: string[];
  };
  wallMs: number;
  dexScanned: number;
  libsScanned: number;
}

function severityFor(cls: string, conf: number): FindingRecord['severity'] {
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

function hitToFinding(h: any, cls: string): NewFinding {
  const conf = typeof h.confidence === 'number' ? h.confidence : 0.5;
  const evidence = (h.evidence || [])
    .slice(0, 3)
    .map((e: any) => `${e.pattern || '?'} → ${(e.matched || '').slice(0, 80)}`)
    .join(' · ');
  const srcs = Array.isArray(h.sources) ? h.sources.join(',') : (h.source || 'dex');
  return {
    unitId: null,
    severity: severityFor(cls, conf),
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

export async function runFeatureHunt(apkPath: string): Promise<FeatureHuntResult> {
  if (!apkPath || !apkPath.trim()) throw new Error('apkPath required');

  const jobId = await pipelineStore.createStandaloneBotsJob(
    apkPath,
    'standalone-feature-hunt',
  );

  try {
    const t0 = Date.now();
    const r = await fetch(`${BACKEND}/tool/apk_feature_full`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apk_path: apkPath }),
    });
    const j: any = await r.json();
    if (!j.ok) {
      const msg = String(j.error || 'feature scan failed').slice(0, 200);
      await pipelineStore.setJobState(jobId, 'failed', msg);
      throw new Error(msg);
    }

    const mod = j.mod_artifacts || [];
    const anti = j.anti_tamper_surface || [];
    const fw = j.framework_markers || [];
    const fp = j.fingerprint || {};

    const findings: NewFinding[] = [];
    for (const h of mod)  findings.push(hitToFinding(h, 'mod_artifact'));
    for (const h of anti) findings.push(hitToFinding(h, 'anti_tamper_surface'));
    for (const h of fw)   findings.push(hitToFinding(h, 'framework_marker'));

    // Surface the fingerprint as its own finding when anything notable
    // is present — packer and obfuscator are the ones worth a row.
    const notableFp: string[] = [
      ...((fp.packer || []) as string[]).map(p => `packer: ${p}`),
      ...((fp.obfuscator || []) as string[]).map(o => `obfuscator: ${o}`),
    ];
    if (notableFp.length > 0) {
      findings.push({
        unitId: null,
        severity: 'info',
        category: 'fingerprint',
        title: 'APK protection fingerprint',
        risk: notableFp.join(' · '),
        evidenceClass: null,
        evidenceMethod: null,
        evidenceSource: 'feature_hunt:fingerprint',
        patch: {},
        verification: null,
        confidence: 0.9,
        confidenceBand: 'high',
      });
    }

    await pipelineStore.createFindings(jobId, findings);
    await pipelineStore.setJobState(jobId, 'done');

    return {
      jobId,
      findingsCount: findings.length,
      modArtifacts: mod.length,
      antiTamper: anti.length,
      frameworkMarkers: fw.length,
      fingerprint: {
        obfuscator: (fp.obfuscator || []) as string[],
        packer: (fp.packer || []) as string[],
        hook_framework: (fp.hook_framework || []) as string[],
      },
      wallMs: j.wall_ms || (Date.now() - t0),
      dexScanned: j.dex_files_scanned || 0,
      libsScanned: j.libs_scanned || 0,
    };
  } catch (e) {
    await pipelineStore.setJobState(jobId, 'failed', (e as Error).message.slice(0, 200));
    throw e;
  }
}
