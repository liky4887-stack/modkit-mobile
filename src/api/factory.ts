export interface FileEntry { path: string; bytes: number; }
export interface BuildResult { projectId: string; files: FileEntry[]; previewUrl: string; summary: string; }
export interface Project { id: string; name: string; slug: string; description: string; createdAt: string; updatedAt: string; archived: boolean; }
export interface Engine { id: string; label: string; configured: boolean; health?: { healthy?: boolean; bearerValid?: boolean; lastChatOk?: boolean; }; }
export interface FactoryHealth {
  ok: boolean;
  status: {
    credentialsConfigured: boolean;
    bearerValid: boolean;
    lastChatOk: boolean;
    lastChatError: string | null;
    powWasmLoaded: boolean;
  };
}
export interface BuildLogLine { level: 'info' | 'ok' | 'warn' | 'error'; msg: string; ts: number; }

export const FACTORY_BASE =
  process.env.EXPO_PUBLIC_FACTORY_URL ?? 'http://127.0.0.1:8790';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FACTORY_BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch {
    throw new Error(`non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.ok === false) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export const factoryApi = {
  health: () => call<FactoryHealth>('/deepseek/health'),
  engines: () => call<{ ok: boolean; engines: Engine[] }>('/engines'),
  projects: () => call<{ ok: boolean; projects: Project[] }>('/projects'),
  files: (id: string) => call<{ ok: boolean; files: FileEntry[] }>(`/projects/${id}/files`),
  file: (id: string, path: string) => call<{ ok: boolean; content: string }>(`/projects/${id}/files/${path}`),
  build: (id: string, body: { prompt: string; engine?: string; skillsBlock?: string }) =>
    call<{ ok: boolean; result: BuildResult }>(`/projects/${id}/build`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  previewUrl: (id: string) => `${FACTORY_BASE}/projects/${id}/preview/index.html`,
};

export interface ExecResult {
  exitCode: number; stdout: string; stderr: string;
  durationMs: number; truncated: boolean;
  command: string; args: string[]; cwd: string;
}

const SOVEREIGN_HOME = '/data/data/com.termux/files/home/sovereign-factory/scripts';
const APK_INSPECT_SCRIPT = `${SOVEREIGN_HOME}/apk-inspect.cjs`;
const PATCH_PLAN_SCRIPT = `${SOVEREIGN_HOME}/patch-plan.cjs`;
const DEEP_SCAN_SCRIPT = `${SOVEREIGN_HOME}/deep-scan.mjs`;

export const factoryExec = {
  run: (command: string, args: string[] = [], opts: { cwd?: string; timeoutMs?: number } = {}) =>
    call<{ ok: boolean; result: ExecResult }>('/executeCommand', {
      method: 'POST', body: JSON.stringify({ command, args, ...opts }),
    }),

  apkInspect: async (apkPath: string, mode: 'list'|'manifest'|'scan'|'full'): Promise<any> => {
    const r = await factoryExec.run('node', [APK_INSPECT_SCRIPT, apkPath, mode], { timeoutMs: 180_000 });
    if (r.result.exitCode !== 0) throw new Error(r.result.stderr || `inspect exit ${r.result.exitCode}`);
    try { return JSON.parse(r.result.stdout); }
    catch { throw new Error('inspect non-JSON: ' + r.result.stdout.slice(0, 200)); }
  },

  apkExists: async (apkPath: string): Promise<boolean> => {
    try {
      const r = await factoryExec.run('ls', ['-la', apkPath], { timeoutMs: 5000 });
      return r.result.exitCode === 0;
    } catch { return false; }
  },
};

// ── Deep scan: real per-feature APK scanning with class attribution ──
export type FeatureCheckStatus = 'ok' | 'clean' | 'runtime' | 'unknown';

export interface FeatureHit {
  dex: string;
  size: number;
  patterns: string[];
  classCount: number;
  signalClasses: string[];
  relatedClasses: string[];
}

export interface FeatureCheckResult {
  id: string;
  status: FeatureCheckStatus;
  message: string;
  totalHits: number;
  dexCount: number;
  patterns: string[];
  hits: FeatureHit[];
}

export interface FeatureCheckResponse {
  ok: boolean;
  apk: string;
  apkSize: number;
  dexTotal: number;
  dexParsed: number;
  totalClasses: number;
  elapsedMs: number;
  features: Record<string, FeatureCheckResult>;
}

// Runtime-only features — no static scan applies
const RUNTIME_ONLY = new Set([
  'match-integrity','risk-scoring-policy','ux-degradation','update-trust-chain',
  'update-policy-engine','safe-staging-canary','signature-ruleset-updates',
  'update-ux','update-telemetry-audit','policy-orchestration',
]);

const FEATURE_LABELS: Record<string, string> = {
  'device-fingerprint': 'Identity & Device Fingerprint',
  'session-integrity': 'Session & Context Integrity',
  'obfuscation-hardening': 'Obfuscation & Hardening',
  'asset-protection': 'Asset Protection',
  'js-bundle-shield': 'JS Bundle Shield',
  'runtime-sensing': 'Runtime Environment Sensing',
  'anti-tamper-hook': 'Anti-Tamper & Hook Detection',
  'network-transport-guard': 'Network & Transport Guard',
  'match-integrity': 'Match & Gameplay Integrity',
  'telemetry-evidence': 'Telemetry & Evidence',
  'risk-scoring-policy': 'Risk Scoring & Policy',
  'ux-degradation': 'UX-Safe Degradation',
  'secure-storage': 'Secure Storage & Key Mgmt',
  'build-release-integrity': 'Build & Release Integrity',
  'ota-governance': 'OTA & Hot Update Governance',
  'privacy-compliance': 'Privacy & Compliance',
  'observability-debug': 'Observability & Debug Bridge',
  'performance-monitor': 'Performance & Degradation',
  'cross-platform-abstraction': 'Cross-Platform Abstraction',
  'governance-killswitch': 'Governance & Kill-Switch',
  'update-trust-chain': 'Update Trust Chain',
  'update-policy-engine': 'Update Policy Engine',
  'safe-staging-canary': 'Safe-Staging & Canary',
  'differential-integrity': 'Differential Integrity',
  'rollback-recovery': 'Rollback & Recovery',
  'signature-ruleset-updates': 'Signature & Rule-Set Updates',
  'update-ux': 'User-Facing Update Experience',
  'update-telemetry-audit': 'Update Telemetry & Audit',
  'policy-orchestration': 'Policy & Orchestration',
};

export const featureApi = {
  checkAll: async (apkPath: string): Promise<FeatureCheckResponse> => {
    const r = await factoryExec.run('node', [DEEP_SCAN_SCRIPT, apkPath], { timeoutMs: 180_000 });
    if (r.result.exitCode !== 0) throw new Error(r.result.stderr || `deep-scan exit ${r.result.exitCode}`);
    let parsed: any;
    try { parsed = JSON.parse(r.result.stdout); }
    catch { throw new Error('deep-scan non-JSON: ' + r.result.stdout.slice(0, 200)); }
    if (!parsed.ok) throw new Error(parsed.error || 'deep-scan failed');

    const features: Record<string, FeatureCheckResult> = {};
    const allIds = new Set([...Object.keys(parsed.features), ...RUNTIME_ONLY]);

    for (const id of allIds) {
      const label = FEATURE_LABELS[id] || id;
      if (RUNTIME_ONLY.has(id) && (!parsed.features[id] || parsed.features[id].totalHits === 0)) {
        features[id] = {
          id, status: 'runtime',
          message: 'Runtime behavior — no static signature in the APK',
          totalHits: 0, dexCount: 0, patterns: [], hits: [],
        };
        continue;
      }
      const r2 = parsed.features[id];
      if (!r2 || r2.totalHits === 0) {
        features[id] = {
          id, status: 'clean',
          message: 'No signatures found in scanned DEX',
          totalHits: 0, dexCount: 0, patterns: [], hits: [],
        };
        continue;
      }
      features[id] = {
        id, status: 'ok',
        message: `${r2.totalHits} DEX file${r2.totalHits === 1 ? '' : 's'} · ${r2.patterns.length} pattern${r2.patterns.length === 1 ? '' : 's'}`,
        totalHits: r2.totalHits,
        dexCount: r2.dexCount,
        patterns: r2.patterns,
        hits: r2.hits,
      };
    }

    return {
      ok: true,
      apk: parsed.apk,
      apkSize: parsed.apkSize,
      dexTotal: parsed.dexTotal,
      dexParsed: parsed.dexParsed,
      totalClasses: parsed.totalClasses,
      elapsedMs: parsed.elapsedMs,
      features,
    };
  },
};

// ── Patch plan (unchanged) ────────────────────────────────────────
export type PatchGoal = 'report' | 'root-bypass' | 'sig-bypass' | 'remove-feature';
export interface PatchFinding { id: string; target: string; evidence: string; risk: 'low'|'medium'|'high'; defeat: string; }
export interface PatchStep { step: number; file: string; action: 'edit'|'inject'|'remove'; payload?: string; rationale: string; }
export interface PatchPlan { summary: string; findings: PatchFinding[]; patchPlan: PatchStep[]; nextSteps?: string[]; raw?: string; }

export const patchApi = {
  plan: async (apkPath: string, goal: PatchGoal): Promise<PatchPlan> => {
    const r = await factoryExec.run('node', [PATCH_PLAN_SCRIPT, apkPath, goal], { timeoutMs: 240_000 });
    if (r.result.exitCode !== 0) throw new Error(r.result.stderr || `patch-plan exit ${r.result.exitCode}`);
    let parsed: any;
    try { parsed = JSON.parse(r.result.stdout); }
    catch { throw new Error('patch-plan non-JSON: ' + r.result.stdout.slice(0, 200)); }
    if (!parsed.ok) throw new Error(parsed.error || 'plan failed');
    return parsed.plan as PatchPlan;
  },
};

// ── Two-APK diff ──────────────────────────────────────────────────
export interface ApkMeta {
  path: string;
  name: string;
  sizeBytes: number;
  dexCount: number;
  classCount: number;
  entryCount: number;
  totalCompressed: number;
  totalUncompressed: number;
}

export interface DiffSummary {
  classesAdded: number;
  classesRemoved: number;
  filesAdded: number;
  filesRemoved: number;
  sizeDeltaBytes: number;
  dexDelta: number;
  classDelta: number;
}

export interface DiffFeatureDelta {
  aHits: number;
  bHits: number;
  delta: number;
  addedDex: string[];
  removedDex: string[];
}

export interface ApkDiff {
  ok: boolean;
  elapsedMs: number;
  apkA: ApkMeta;
  apkB: ApkMeta;
  summary: DiffSummary;
  classes: { added: string[]; removed: string[]; addedTotal: number; removedTotal: number };
  files: { added: string[]; removed: string[]; addedTotal: number; removedTotal: number };
  extensions: Array<{ ext: string; a: number; b: number; delta: number }>;
  features: Record<string, DiffFeatureDelta>;
}

const DIFF_APKS_SCRIPT = `${SOVEREIGN_HOME}/diff-apks.mjs`;

export const diffApi = {
  compare: async (apkA: string, apkB: string): Promise<ApkDiff> => {
    const r = await factoryExec.run('node', [DIFF_APKS_SCRIPT, apkA, apkB], { timeoutMs: 300_000 });
    if (r.result.exitCode !== 0) throw new Error(r.result.stderr || `diff exit ${r.result.exitCode}`);
    let parsed: any;
    try { parsed = JSON.parse(r.result.stdout); }
    catch { throw new Error('diff non-JSON: ' + r.result.stdout.slice(0, 200)); }
    if (!parsed.ok) throw new Error(parsed.error || 'diff failed');
    return parsed as ApkDiff;
  },
};

// ── Multi-turn DeepSeek chat ─────────────────────────────────────
export interface ChatResponse {
  ok: boolean;
  response: {
    code: number;
    msg: string;
    data: { content: string; chat_session_id: string; message_id: string | null };
  };
}

export const chatApi = {
  send: async (
    prompt: string,
    opts: { thinking?: boolean; search?: boolean } = {},
  ): Promise<string> => {
    const r = await call<ChatResponse>('/deepseek/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt, ...opts }),
    });
    if (!r.ok || r.response?.code !== 0) {
      throw new Error(r.response?.msg || 'chat failed');
    }
    return r.response.data.content;
  },
};
