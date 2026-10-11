// Standalone bot run — no pipeline, no LLM, no phases.
// Loads an APK, runs the deterministic bot roster via /tools/bots_run,
// writes findings to the local DB under a synthetic job row so the
// FINDINGS tab can display them with the same code path it uses for
// pipeline-produced findings.
import { pipelineStore } from './pipelineStore';

const BACKEND = 'http://127.0.0.1:8792';

export interface StandaloneBotsResult {
  jobId: string;
  findingsCount: number;
  summary: string;
  errors: number;
  rejected: number;
  wallMs: number;
}

export async function runStandaloneBots(apkPath: string): Promise<StandaloneBotsResult> {
  if (!apkPath || !apkPath.trim()) {
    throw new Error('apkPath required');
  }
  const jobId = await pipelineStore.createStandaloneBotsJob(apkPath);

  try {
    const t0 = Date.now();
    const r = await fetch(`${BACKEND}/tools/bots_run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apk_path: apkPath }),
    });
    const j: any = await r.json();

    if (!j.ok) {
      const err = j.error || 'bots_run failed';
      await pipelineStore.setJobState(jobId, 'failed', String(err).slice(0, 200));
      throw new Error(err);
    }

    const raw = j.findings || [];
    const normalized = raw.map((f: any) => ({
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
    }));
    await pipelineStore.createFindings(jobId, normalized);
    await pipelineStore.setJobState(jobId, 'done');

    return {
      jobId,
      findingsCount: normalized.length,
      summary: j.summary || '',
      errors: (j.errors || []).length,
      rejected: (j.rejected || []).length,
      wallMs: Date.now() - t0,
    };
  } catch (e) {
    await pipelineStore.setJobState(jobId, 'failed', (e as Error).message.slice(0, 200));
    throw e;
  }
}
