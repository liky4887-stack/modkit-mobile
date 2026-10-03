// Partition runner: gather APK shape, prompt DeepSeek, parse units, persist.
import { pipelineStore, JobRecord } from './pipelineStore';
import { classCache } from '@/classdata/classCache';
import { deepseekClient } from '@/chat/deepseekClient';
import { eventBus } from '@/orchestration/eventBus';
import {
  buildPartitionPrompt,
  PARTITION_PROMPT_VERSION,
  PartitionInput,
} from './partitionPrompt';

export interface PartitionResult {
  jobId: string;
  unitCount: number;
  elapsedMs: number;
  chatId: string;
  dsSessionId: string | null;
  rawReplyChars: number;
}

interface UnitJson {
  name: string;
  kind: string;
  brief?: string;
  classes?: string[];
  dexFiles?: string[];
}

function validateUnit(u: any, idx: number): UnitJson | null {
  if (!u || typeof u !== 'object') return null;
  const name = typeof u.name === 'string' && u.name.length > 0
    ? u.name.slice(0, 64)
    : 'unit-' + idx;
  const kind = typeof u.kind === 'string' && u.kind.length > 0 ? u.kind : 'package';
  const brief = typeof u.brief === 'string' ? u.brief.slice(0, 400) : '';
  const classes = Array.isArray(u.classes)
    ? u.classes.filter((c: any) => typeof c === 'string').slice(0, 500)
    : [];
  const dexFiles = Array.isArray(u.dexFiles)
    ? u.dexFiles.filter((c: any) => typeof c === 'string').slice(0, 200)
    : [];
  return { name, kind, brief, classes, dexFiles };
}

export const partitionRunner = {
  async run(job: JobRecord): Promise<PartitionResult> {
    const t0 = Date.now();
    const scanId = job.scanId || job.id;

    eventBus.emit({
      scanId, correlationId: job.id, phase: 'import',
      functionId: 'orchestration_logs', severity: 'info',
      payload: { action: 'partition_start', jobId: job.id },
    });

    // ── 1. Gather APK shape from existing data ────────────────────
    const totalInCache = await classCache.count(scanId);
    if (totalInCache === 0) {
      throw new Error('partition: class_cache empty for scan ' + scanId + ' — run class dump first');
    }

    const topPackages = await classCache.packageSummary(scanId, 25);

    // Pull signal classes from the previous deep-scan (if any): use the
    // classes we know are interesting — the top of the cache is fine as a proxy.
    // In Session 06 we'll wire the actual deep-scan feature hits. For now,
    // sample the top 80 distinct class names from top packages.
    const signalClasses: string[] = [];
    for (const p of topPackages.slice(0, 10)) {
      const rows = await classCache.byPackagePrefix(scanId, p.top, 8);
      for (const r of rows) if (!signalClasses.includes(r.fqcn)) signalClasses.push(r.fqcn);
      if (signalClasses.length >= 80) break;
    }

    // Feature summary: real feature hits come from deep-scan. We don't
    // have that wired in the pipeline yet, so use package counts as a
    // proxy signal. Session 06 replaces this with real feature hits.
    const featureSummary = topPackages
      .slice(0, 20)
      .map(p => p.top + ': ' + p.count + ' classes in package')
      .join('\n');

    const input: PartitionInput = {
      apkName: job.apkName || job.apkPath.split('/').pop() || 'target.apk',
      apkSize: job.apkSize,
      dexTotal: 1111,     // TODO: real value from class dump summary
      totalClasses: totalInCache,
      featureSummary,
      topPackages,
      signalClasses,
    };

    // ── 2. Call DeepSeek ──────────────────────────────────────────
    const prompt = buildPartitionPrompt(input);
    const result = await deepseekClient.send(prompt, {
      jobId: job.id,
      phase: 'partition',
      purpose: 'partition_apk',
      promptVersion: PARTITION_PROMPT_VERSION,
      mode: 'chat',
      maxRetries: 2,
      timeoutMs: 180000,
    });

    await pipelineStore.bumpDs(job.id, {
      calls: 1,
      elapsedMs: result.elapsedMs,
      tokens: result.tokensIn + result.tokensOut,
      sessionId: result.dsSessionId,
    });

    // ── 3. Parse the reply ────────────────────────────────────────
    const parsed = deepseekClient.extractJson<{ units: UnitJson[] }>(result.content);
    if (!parsed || !Array.isArray(parsed.units) || parsed.units.length === 0) {
      throw new Error('partition: no units in reply (' + result.content.slice(0, 200) + ')');
    }

    const units: UnitJson[] = [];
    parsed.units.forEach((u, i) => {
      const v = validateUnit(u, i);
      if (v) units.push(v);
    });

    if (units.length === 0) {
      throw new Error('partition: all units failed validation');
    }

    // ── 4. Persist units ──────────────────────────────────────────
    await pipelineStore.replaceUnits(job.id, units);

    const elapsedMs = Date.now() - t0;
    eventBus.emit({
      scanId, correlationId: job.id, phase: 'import',
      functionId: 'orchestration_logs', severity: 'info',
      payload: {
        action: 'partition_done',
        jobId: job.id,
        unitCount: units.length,
        elapsedMs,
      },
    });

    return {
      jobId: job.id,
      unitCount: units.length,
      elapsedMs,
      chatId: result.chatId,
      dsSessionId: result.dsSessionId,
      rawReplyChars: result.content.length,
    };
  },
};
