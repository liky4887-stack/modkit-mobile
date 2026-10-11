// Markdown report generator for bot findings.
// Reads the findings for a job from the local DB, renders a structured
// report with an executive summary, per-category sections, and an
// evidence appendix. Writes the markdown to /sdcard/Download/modkit-reports/
// via the backend's /file/write route (same one the pipeline export uses).
import { pipelineStore, type FindingRecord, type JobRecord } from '@/pipeline/pipelineStore';

const BACKEND = 'http://127.0.0.1:8792';
const REPORT_DIR = '/storage/emulated/0/Download/modkit-reports';

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;

function sevIcon(s: string): string {
  return { critical: '[CRIT]', high: '[HIGH]', medium: '[MED] ', low: '[LOW] ', info: '[INFO]' }[s] || '[????]';
}

function severityCounts(findings: FindingRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of findings) out[f.severity] = (out[f.severity] || 0) + 1;
  return out;
}

function categoryCounts(findings: FindingRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of findings) {
    const cat = String(f.category).split(':')[0];
    out[cat] = (out[cat] || 0) + 1;
  }
  return out;
}

function renderHeader(job: JobRecord, findings: FindingRecord[]): string {
  const sev = severityCounts(findings);
  const cats = categoryCounts(findings);
  const lines = [
    `# Mobile Security Report — ${job.apkName || job.id.slice(0, 12)}`,
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Job ID:** \`${job.id}\``,
    `**APK path:** \`${job.apkPath}\``,
    `**Total findings:** ${findings.length}`,
    '',
    '## Severity Summary',
    '',
    '| Severity | Count |',
    '|---|---|',
  ];
  for (const s of SEV_ORDER) {
    lines.push(`| ${s} | ${sev[s] || 0} |`);
  }
  lines.push('');
  lines.push('## Categories');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('|---|---|');
  for (const [cat, n] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${cat} | ${n} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderExecutive(findings: FindingRecord[]): string {
  const critical = findings.filter(f => f.severity === 'critical' || f.severity === 'high');
  if (critical.length === 0) {
    return '## Executive Summary\n\nNo critical or high findings.\n\n';
  }
  const lines = ['## Executive Summary', '', `The scan flagged **${critical.length}** critical/high findings:`, ''];
  for (const f of critical) {
    lines.push(`- ${sevIcon(f.severity)} **${f.title}**`);
    lines.push(`  - Risk: ${f.risk}`);
    lines.push(`  - Evidence: \`${f.evidenceClass || '(none)'}\`${f.evidenceMethod ? ' · ' + f.evidenceMethod : ''}`);
    lines.push('');
  }
  return lines.join('\n');
}

function renderFindingsByCategory(findings: FindingRecord[]): string {
  const byCat: Record<string, FindingRecord[]> = {};
  for (const f of findings) {
    const cat = String(f.category).split(':')[0];
    byCat[cat] = byCat[cat] || [];
    byCat[cat].push(f);
  }
  const lines = ['## Findings', ''];
  const cats = Object.keys(byCat).sort();
  for (const cat of cats) {
    const items = byCat[cat];
    lines.push(`### ${cat} (${items.length})`);
    lines.push('');
    for (const f of items) {
      lines.push(`#### ${sevIcon(f.severity)} ${f.title}`);
      lines.push('');
      lines.push(`- **Category:** \`${f.category}\``);
      lines.push(`- **Evidence class:** \`${f.evidenceClass || '(none)'}\``);
      if (f.evidenceMethod) lines.push(`- **Evidence method:** \`${f.evidenceMethod}\``);
      if (f.evidenceSource) lines.push(`- **Detected by:** \`${f.evidenceSource}\``);
      lines.push('');
      lines.push('**Risk**');
      lines.push('');
      lines.push(f.risk);
      lines.push('');
      if (f.patch && Object.keys(f.patch).length > 0) {
        lines.push('**Proposed patch**');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(f.patch, null, 2));
        lines.push('```');
        lines.push('');
      }
      if (f.verification) {
        lines.push(`**Verification:** ${f.verification}`);
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}

function renderAppendix(findings: FindingRecord[]): string {
  const lines = ['## Appendix — Evidence Index', '', '| Severity | Title | Class | Source |', '|---|---|---|---|'];
  for (const f of findings) {
    const t = String(f.title).replace(/\|/g, '\\|');
    const c = String(f.evidenceClass || '').replace(/\|/g, '\\|');
    const s = String(f.evidenceSource || '').replace(/\|/g, '\\|');
    lines.push(`| ${f.severity} | ${t} | \`${c}\` | ${s} |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function buildReportMarkdown(job: JobRecord, findings: FindingRecord[]): string {
  return [
    renderHeader(job, findings),
    renderExecutive(findings),
    renderFindingsByCategory(findings),
    renderAppendix(findings),
  ].join('\n');
}

export async function exportReport(jobId: string): Promise<{ path: string; markdown: string }> {
  const job = await pipelineStore.getJob(jobId);
  if (!job) throw new Error('job not found: ' + jobId);
  const findings = await pipelineStore.listFindings(jobId);
  if (findings.length === 0) throw new Error('no findings to export');

  const markdown = buildReportMarkdown(job, findings);
  const safeName = (job.apkName || job.id).replace(/[^A-Za-z0-9._-]/g, '_');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const path = `${REPORT_DIR}/${safeName}-${ts}.md`;

  const r = await fetch(`${BACKEND}/file/write`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, content: markdown }),
  });
  const j: any = await r.json();
  if (!j.ok) throw new Error(j.error || 'write failed');

  return { path, markdown };
}
