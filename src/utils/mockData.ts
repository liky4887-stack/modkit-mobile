import type {
  LogEntry,
  SignatureEntry,
  DeviceIdSet,
  PacketRule,
  PacketLogEntry,
  MemoryRegion,
  SandboxSession,
  OraclePatch,
  SnapshotEntry,
  RiskFactor,
  HeuristicCandidate,
  SocialEngScenario,
  FarmAccount,
  BanWaveForecast,
  InjectionEvent,
  ShadowSession,
  GenerationEntry,
  CodeVariant,
  LatencyPoint,
  MeshNode,
  AdversarialRound,
  NeuralSyncAccount,
  SelfDestructRule,
  QuantumSnapshot,
  CleaningIssue,
  CleaningProfile,
  CleaningResult,
  PatchTarget,
  AnalysisResult,
  DetectionHotspot,
  StructureNode,
  OffsetEntry,
  HeuristicEntry,
  PatchDefinition,
  PatchDiff,
  ExportSummary,
  BehaviorConfig,
  PolicyRule,
  UpdateTrustEntry,
  UpdatePolicy,
  CanaryRollout,
  DifferentialCheck,
  RollbackSlot,
  SignatureUpdate,
  StealthRiskScore,
  DegradationAction,
  KillSwitch,
  PerformanceMetric,
  ComplianceRule,
} from '@/types';
import { mockGen } from './mockGen';

const { hex, hexLower, pick, randInt, randFloat, id } = mockGen;

const LOG_SOURCES = ['signature-engine', 'packet-manipulator', 'behavioral-mimic', 'memory-cloaking', 'patch-oracle', 'adversarial-net', 'system'];
const LOG_MESSAGES = [
  'Signature rotation cycle complete',
  'Entropy threshold reached, rotating profile',
  'Packet rule matched: outbound telemetry blocked',
  'Behavioral pattern deviation detected, smoothing applied',
  'Memory region cloaked at offset 0x{addr}',
  'Oracle patch suggestion generated for v{ver}',
  'Adversarial round {n}: attacker score {score}',
  'Sandbox session initialized',
  'Detection probability recalculated: {pct}%',
  'Neural sync cluster updated',
  'Genetic generation {n} fitness: {fit}',
  'Latency optimization applied: {ms}ms reduction',
];

export function genLog(): LogEntry {
  const levels: LogEntry['level'][] = ['info', 'warn', 'error', 'success', 'debug'];
  return {
    id: id(),
    timestamp: Date.now(),
    level: pick(levels),
    source: pick(LOG_SOURCES),
    message: LOG_MESSAGES[randInt(0, LOG_MESSAGES.length - 1)]
      .replace('{addr}', hex(8))
      .replace('{ver}', `${randInt(1, 9)}.${randInt(0, 9)}.${randInt(0, 9)}`)
      .replace('{n}', String(randInt(1, 100)))
      .replace('{score}', String(randInt(30, 95)))
      .replace('{pct}', String(randInt(10, 90)))
      .replace('{fit}', String(randFloat(0.3, 0.99)))
      .replace('{ms}', String(randInt(5, 80))),
  };
}

export function genLogs(count: number): LogEntry[] {
  return Array.from({ length: count }, () => genLog());
}

export function genSignature(): SignatureEntry {
  return {
    id: id(),
    timestamp: Date.now(),
    hash: hexLower(64),
    entropy: randFloat(3.5, 8.0),
    detectionProbability: randFloat(0.01, 0.3),
    profile: pick(['alpha', 'beta', 'gamma', 'delta']),
  };
}

export function genSignatures(count: number): SignatureEntry[] {
  return Array.from({ length: count }, () => genSignature());
}

export function genDeviceIdSet(): DeviceIdSet {
  return {
    id: id(),
    profileName: pick(['Profile-A', 'Profile-B', 'Profile-C', 'Profile-D']),
    deviceId: hexLower(16),
    androidId: hexLower(16),
    imei: `${randInt(100000, 999999)}${randInt(100000, 999999)}`,
    serial: hexUpper(12),
    mac: Array.from({ length: 6 }, () => hex(2)).join(':'),
    active: false,
  };
}

function hexUpper(len: number): string {
  return hex(len);
}

export function genDeviceIdSets(count: number): DeviceIdSet[] {
  return Array.from({ length: count }, () => genDeviceIdSet());
}

export function genPacketRule(): PacketRule {
  const actions: PacketRule['action'][] = ['drop', 'delay', 'modify', 'randomize'];
  return {
    id: id(),
    name: pick(['Telemetry Block', 'Ad Request Filter', 'Analytics Drop', 'Beacon Delay', 'Header Randomize']),
    action: pick(actions),
    pattern: pick(['/api/telemetry', '/api/analytics', '/api/crash', '/sdk/beacon', '/track/*']),
    hitCount: randInt(0, 500),
    enabled: Math.random() > 0.3,
  };
}

export function genPacketRules(count: number): PacketRule[] {
  return Array.from({ length: count }, () => genPacketRule());
}

export function genPacketLog(): PacketLogEntry {
  const statuses: PacketLogEntry['status'][] = ['passed', 'dropped', 'modified', 'delayed'];
  const status = pick(statuses);
  return {
    id: id(),
    timestamp: Date.now(),
    direction: pick(['inbound', 'outbound']),
    protocol: pick(['TCP', 'UDP', 'HTTP', 'HTTPS', 'WS']),
    size: randInt(64, 4096),
    status,
    rule: status !== 'passed' ? pick(['rule-001', 'rule-002', 'rule-003']) : undefined,
  };
}

export function genPacketLogs(count: number): PacketLogEntry[] {
  return Array.from({ length: count }, () => genPacketLog());
}

export function genMemoryRegions(count: number): MemoryRegion[] {
  const types: MemoryRegion['type'][] = ['code', 'data', 'heap', 'stack', 'cloaked'];
  return Array.from({ length: count }, () => {
    const type = pick(types);
    return {
      id: id(),
      address: `0x${hex(8)}`,
      size: `${randInt(4, 256)}KB`,
      type,
      protection: pick(['r-x', 'rw-', 'r--', 'rwx']),
      cloaked: type === 'cloaked',
    };
  });
}

export function genSandboxSession(): SandboxSession {
  const statuses: SandboxSession['status'][] = ['running', 'completed', 'failed'];
  return {
    id: id(),
    profile: pick(['Pixel 8 Pro', 'iPhone 15 Pro', 'Galaxy S24', 'OnePlus 12']),
    device: pick(['arm64-v8a', 'armeabi-v7a', 'x86_64']),
    os: pick(['Android 14', 'Android 13', 'iOS 17', 'iOS 18']),
    network: pick(['WiFi', '5G', '4G LTE', 'Ethernet']),
    status: pick(statuses),
    riskEstimate: randFloat(0.05, 0.8),
    startedAt: Date.now() - randInt(1000, 3600000),
    logs: Array.from({ length: randInt(3, 8) }, () => `[${new Date().toISOString()}] ${pick(['init', 'scan', 'patch', 'verify', 'done'])} - ${pick(['ok', 'warn', 'err'])}`),
  };
}

export function genSandboxSessions(count: number): SandboxSession[] {
  return Array.from({ length: count }, () => genSandboxSession());
}

export function genOraclePatch(): OraclePatch {
  return {
    id: id(),
    version: `${randInt(1, 9)}.${randInt(0, 9)}.${randInt(0, 9)}`,
    compatibility: randFloat(0.6, 0.99),
    patches: Array.from({ length: randInt(2, 5) }, () => pick(['bypass-integrity', 'obfuscate-telemetry', 'strip-debug', 'rotate-signature', 'cloak-memory'])),
    rationale: pick([
      'Updated SDK requires new signature rotation pattern',
      'New anti-cheat module detected, requires patch adaptation',
      'API endpoint changes require packet rule updates',
      'Binary structure shift detected, offset recalculation needed',
    ]),
    timestamp: Date.now() - randInt(0, 86400000),
  };
}

export function genOraclePatches(count: number): OraclePatch[] {
  return Array.from({ length: count }, () => genOraclePatch());
}

export function genSnapshot(): SnapshotEntry {
  return {
    id: id(),
    label: `snapshot-${hexLower(4)}`,
    timestamp: Date.now(),
    changes: Array.from({ length: randInt(1, 5) }, () => pick(['config.updated', 'signature.rotated', 'rule.added', 'profile.changed', 'patch.applied'])),
    riskEstimate: randFloat(0.05, 0.5),
  };
}

export function genSnapshots(count: number): SnapshotEntry[] {
  return Array.from({ length: count }, () => genSnapshot());
}

export function genRiskFactors(count: number): RiskFactor[] {
  const labels = ['Signature Diversity', 'Behavioral Consistency', 'Network Fingerprint', 'Memory Footprint', 'Timing Regularity', 'Account Age', 'Hardware Uniqueness'];
  return Array.from({ length: Math.min(count, labels.length) }, (_, i) => ({
    label: labels[i],
    weight: randFloat(0.1, 0.4),
    value: randFloat(0, 1),
    description: pick([
      'Lower diversity increases detection risk',
      'Higher consistency reduces suspicion',
      'Distinct network patterns are flagged',
      'Large memory footprint is traceable',
      'Regular timing patterns are detectable',
      'New accounts face higher scrutiny',
      'Common hardware IDs are correlated',
    ]),
  }));
}

export function genHeuristicCandidates(count: number): HeuristicCandidate[] {
  return Array.from({ length: count }, () => ({
    id: id(),
    name: `heuristic_${hexLower(6)}`,
    complexity: randFloat(0.2, 0.95),
    stability: randFloat(0.3, 0.99),
    category: pick(['evasion', 'obfuscation', 'timing', 'fingerprint', 'behavioral']),
    description: pick([
      'Rotating checksum with entropy injection',
      'Polymorphic wrapper for entry point',
      'Timing jitter with gaussian distribution',
      'Fingerprint noise injection at runtime',
      'Behavioral pattern smoothing filter',
    ]),
  }));
}

export function genSocialEngScenarios(): SocialEngScenario[] {
  return [
    { id: id(), title: 'Phishing Awareness Drill', category: 'phishing', description: 'Identify red flags in a simulated phishing email. Training exercise for security awareness teams.', difficulty: 'beginner', isTrainingOnly: true },
    { id: id(), title: 'Pretext Calling Scenario', category: 'pretexting', description: 'Understand how attackers build trust via fabricated scenarios. Defensive awareness training.', difficulty: 'intermediate', isTrainingOnly: true },
    { id: id(), title: 'Baiting Attack Walkthrough', category: 'baiting', description: 'Learn how curiosity-based attacks lure targets into unsafe actions. Educational walkthrough.', difficulty: 'beginner', isTrainingOnly: true },
    { id: id(), title: 'Tailgating Recognition', category: 'physical', description: 'Recognize social engineering in physical security contexts. Awareness module.', difficulty: 'intermediate', isTrainingOnly: true },
    { id: id(), title: 'Quid Pro Quo Analysis', category: 'exchange', description: 'Analyze how benefit-exchange schemes manipulate targets. Case study format.', difficulty: 'advanced', isTrainingOnly: true },
  ];
}

export function genFarmAccounts(count: number): FarmAccount[] {
  const statuses: FarmAccount['status'][] = ['active', 'cooldown', 'banned', 'standby'];
  return Array.from({ length: count }, () => ({
    id: id(),
    name: `acct_${hexLower(6)}`,
    group: pick(['Group-A', 'Group-B', 'Group-C']),
    status: pick(statuses),
    riskLevel: randFloat(0.05, 0.8),
    activityLevel: randFloat(0, 1),
    createdAt: Date.now() - randInt(3600000, 86400000 * 30),
  }));
}

export function genBanWaveForecast(hours: number): BanWaveForecast[] {
  return Array.from({ length: hours }, (_, i) => ({
    timestamp: Date.now() + i * 3600000,
    probability: randFloat(0.02, 0.6),
    confidence: randFloat(0.5, 0.95),
    trigger: pick(['telemetry spike', 'signature match', 'behavioral anomaly', 'mass report', 'manual review']),
  }));
}

export function genInjectionEvents(count: number): InjectionEvent[] {
  const statuses: InjectionEvent['status'][] = ['success', 'failed', 'pending'];
  return Array.from({ length: count }, () => ({
    id: id(),
    timestamp: Date.now(),
    target: pick(['com.target.app', 'libnative.so', 'main.dex', 'libunity.so']),
    type: pick(['hook', 'replace', 'patch', 'cloak']),
    status: pick(statuses),
    payload: hexLower(32),
  }));
}

export function genShadowSessions(count: number): ShadowSession[] {
  const statuses: ShadowSession['syncStatus'][] = ['synced', 'pending', 'conflict'];
  return Array.from({ length: count }, () => ({
    id: id(),
    label: `session-${hexLower(4)}`,
    timestamp: Date.now() - randInt(0, 86400000),
    syncStatus: pick(statuses),
    stateHash: hexLower(40),
    size: `${randFloat(0.1, 15, 1)}MB`,
  }));
}

export function genGenerations(count: number): GenerationEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    generation: i + 1,
    fitness: randFloat(0.3, 0.99),
    mutationRate: randFloat(0.01, 0.3),
    diversity: randFloat(0.2, 0.9),
    patchCount: randInt(3, 15),
    bestPatch: pick(['bypass-integrity-v2', 'obfuscate-telemetry-v3', 'rotate-signature-v1', 'cloak-memory-v4', 'strip-debug-v2']),
  }));
}

export function genCodeVariants(count: number): CodeVariant[] {
  return Array.from({ length: count }, () => ({
    id: id(),
    variantId: `variant_${hexLower(4)}`,
    code: Array.from({ length: randInt(3, 8) }, () => `0x${hex(8)}  ${pick(['mov', 'push', 'pop', 'jmp', 'call', 'ret'])}  ${pick(['eax', 'ebx', 'ecx', 'edx'])}, 0x${hex(4)}`).join('\n'),
    diversity: randFloat(0.3, 0.95),
    reuse: randFloat(0.1, 0.6),
    detectionRisk: randFloat(0.05, 0.5),
  }));
}

export function genLatencyPoints(count: number): LatencyPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: Date.now() + i * 1000,
    latency: randFloat(5, 200),
    jitter: randFloat(1, 30),
  }));
}

export function genMeshNodes(count: number): MeshNode[] {
  const statuses: MeshNode['status'][] = ['online', 'offline', 'degraded'];
  return Array.from({ length: count }, () => ({
    id: id(),
    name: `node-${hexLower(4)}`,
    status: pick(statuses),
    load: randFloat(0, 1),
    region: pick(['us-east', 'us-west', 'eu-central', 'ap-south', 'sa-east']),
    tasks: randInt(0, 50),
  }));
}

export function genAdversarialRounds(count: number): AdversarialRound[] {
  const outcomes: AdversarialRound['outcome'][] = ['attacker', 'defender', 'draw'];
  return Array.from({ length: count }, (_, i) => ({
    round: i + 1,
    attackerScore: randInt(20, 95),
    defenderScore: randInt(20, 95),
    strategy: pick(['signature-rotation', 'memory-cloaking', 'packet-filtering', 'behavioral-mimic', 'timing-jitter']),
    outcome: pick(outcomes),
  }));
}

export function genNeuralSyncAccounts(count: number): NeuralSyncAccount[] {
  return Array.from({ length: count }, () => ({
    id: id(),
    name: `acct_${hexLower(6)}`,
    cluster: pick(['Cluster-A', 'Cluster-B', 'Cluster-C']),
    syncStrength: randFloat(0.3, 0.95),
    uniqueness: randFloat(0.2, 0.9),
    fingerprint: hexLower(32),
  }));
}

export function genSelfDestructRules(): SelfDestructRule[] {
  return [
    { id: id(), trigger: 'time', threshold: '24h', targets: ['logs', 'cache'], enabled: true },
    { id: id(), trigger: 'risk', threshold: '>0.8', targets: ['configs', 'signatures', 'profiles'], enabled: true },
    { id: id(), trigger: 'detection', threshold: 'immediate', targets: ['all'], enabled: false },
    { id: id(), trigger: 'manual', threshold: 'on-demand', targets: ['selected'], enabled: true },
  ];
}

export function genQuantumSnapshots(count: number): QuantumSnapshot[] {
  return Array.from({ length: count }, () => ({
    id: id(),
    label: `q-snapshot-${hexLower(4)}`,
    timestamp: Date.now() - randInt(0, 86400000),
    configHash: hexLower(40),
    changes: Array.from({ length: randInt(1, 4) }, () => pick(['config.updated', 'signature.rotated', 'rule.added'])),
    riskEstimate: randFloat(0.05, 0.4),
  }));
}

export function genCleaningIssues(): CleaningIssue[] {
  const issues: Omit<CleaningIssue, 'id' | 'detected'>[] = [
    { name: 'Telemetry Beacon Signature', severity: 'high', category: 'network', description: 'Outbound telemetry calls match known modified-app signatures.', recommendation: 'Randomize beacon endpoint and inject timing jitter.' },
    { name: 'Debug Symbol Leak', severity: 'medium', category: 'binary', description: 'Debug symbols present in binary increase detectability.', recommendation: 'Strip debug symbols and obfuscate remaining metadata.' },
    { name: 'Hardcoded Patch Offset', severity: 'high', category: 'binary', description: 'Static patch offsets are detectable by integrity scanners.', recommendation: 'Replace with dynamic offset resolution.' },
    { name: 'Behavioral Fingerprint Anomaly', severity: 'medium', category: 'behavior', description: 'Action timing deviates from baseline human patterns.', recommendation: 'Apply behavioral smoothing with gaussian jitter.' },
    { name: 'Memory Region Exposure', severity: 'low', category: 'memory', description: 'Patched memory regions are readable by anti-cheat.', recommendation: 'Enable memory cloaking for modified regions.' },
    { name: 'Account Correlation Risk', severity: 'medium', category: 'accounts', description: 'Multiple accounts share fingerprint parameters.', recommendation: 'Diversify fingerprint profiles per account.' },
  ];
  return issues.map((issue) => ({
    ...issue,
    id: id(),
    detected: Math.random() > 0.3,
  }));
}

export function genCleaningProfile(): CleaningProfile {
  return {
    id: id(),
    name: pick(['GameMod Pro', 'UltraPatch', 'StealthClient', 'ModifiedApp v2']),
    packageName: pick(['com.target.game', 'com.example.app', 'com.test.client']),
    version: `${randInt(1, 9)}.${randInt(0, 9)}.${randInt(0, 9)}`,
    modifiedAt: Date.now() - randInt(3600000, 86400000 * 7),
    riskScore: randFloat(0.3, 0.9),
  };
}

export function genCleaningResult(): CleaningResult {
  const issues = genCleaningIssues();
  const detected = issues.filter((i) => i.detected);
  return {
    profile: genCleaningProfile(),
    issues,
    cleanConfig: {
      'signature_rotation': 'enabled',
      'telemetry_jitter_ms': randInt(50, 500),
      'debug_strip': true,
      'memory_cloak': 'enabled',
      'behavioral_smoothing': randFloat(0.5, 0.95),
      'fingerprint_diversity': randFloat(0.6, 0.99),
    },
    riskPrediction: randFloat(0.05, 0.4),
    recommendedActions: [
      'Rotate all binary signatures before next session',
      'Enable behavioral smoothing with 0.8+ consistency',
      'Strip debug symbols from final build',
      'Diversify fingerprint across all active accounts',
    ],
  };
}

export function genPatchTargets(count: number): PatchTarget[] {
  const types: PatchTarget['type'][] = ['APK', 'IPA', 'OBB'];
  return Array.from({ length: count }, () => ({
    id: id(),
    name: pick(['GameClient.apk', 'AppStore.ipa', 'GameData.obb', 'SocialApp.apk', 'ProTool.ipa']),
    type: pick(types),
    size: `${randFloat(5, 250, 1)}MB`,
    version: `${randInt(1, 9)}.${randInt(0, 9)}.${randInt(0, 9)}`,
    packageId: pick(['com.target.game', 'com.example.app', 'com.test.client', 'com.dev.tool']),
    createdAt: Date.now() - randInt(3600000, 86400000 * 30),
  }));
}

export function genAnalysisResult(): AnalysisResult {
  const hotspots: DetectionHotspot[] = Array.from({ length: randInt(3, 7) }, () => ({
    id: id(),
    address: `0x${hex(8)}`,
    type: pick(['integrity-check', 'telemetry', 'debug-detect', 'root-detect', 'emulator-detect']),
    severity: pick(['high', 'medium', 'low'] as const),
    description: pick([
      'Runtime integrity verification call',
      'Telemetry beacon dispatch',
      'Debugger attachment detection',
      'Root access check',
      'Emulator environment detection',
    ]),
  }));

  const structureMap: StructureNode[] = [
    { id: id(), name: 'classes.dex', type: 'DEX', offset: '0x000000', size: '12.4MB', children: [
      { id: id(), name: 'com.target.GameActivity', type: 'CLASS', offset: '0x001200', size: '45KB' },
      { id: id(), name: 'com.target.SecurityCheck', type: 'CLASS', offset: '0x003400', size: '18KB' },
    ]},
    { id: id(), name: 'libnative.so', type: 'ELF', offset: '0xC00000', size: '3.2MB' },
    { id: id(), name: 'assets/', type: 'DIR', offset: '0xF00000', size: '45MB' },
    { id: id(), name: 'AndroidManifest.xml', type: 'XML', offset: '0x000080', size: '4KB' },
  ];

  const offsets: OffsetEntry[] = Array.from({ length: randInt(5, 12) }, () => ({
    address: `0x${hex(8)}`,
    region: pick(['.text', '.data', '.rodata', '.bss', 'DEX', 'ELF']),
    description: pick(['function entry', 'string literal', 'vtable', 'JNI call', 'callback ptr']),
    writable: Math.random() > 0.5,
  }));

  const heuristics: HeuristicEntry[] = Array.from({ length: randInt(3, 6) }, () => ({
    id: id(),
    name: pick(['anti-debug-check', 'root-detection', 'emulator-detect', 'integrity-hash', 'telemetry-beacon', 'signature-verify']),
    confidence: randFloat(0.5, 0.99),
    category: pick(['security', 'network', 'binary', 'runtime']),
  }));

  return {
    entryPoints: Array.from({ length: randInt(2, 5) }, () => `0x${hex(8)}`),
    detectionHotspots: hotspots,
    structureMap,
    riskScore: randFloat(0.3, 0.9),
    offsets,
    heuristics,
  };
}

export function genPatchDefinitions(): PatchDefinition[] {
  return [
    { id: id(), name: 'Bypass Integrity Checks', description: 'Neutralize runtime integrity verification calls.', category: 'security', riskLevel: 'high', selected: false },
    { id: id(), name: 'Obfuscate Telemetry', description: 'Randomize telemetry endpoints and inject timing delays.', category: 'network', riskLevel: 'medium', selected: false },
    { id: id(), name: 'Strip Debug Symbols', description: 'Remove debug metadata from binary headers.', category: 'binary', riskLevel: 'low', selected: false },
    { id: id(), name: 'Rotate Signatures', description: 'Apply polymorphic signature rotation to modified regions.', category: 'identity', riskLevel: 'medium', selected: false },
    { id: id(), name: 'Cloak Memory Regions', description: 'Enable memory cloaking for patched code sections.', category: 'memory', riskLevel: 'high', selected: false },
    { id: id(), name: 'Behavioral Smoothing', description: 'Inject human-like timing jitter into automated actions.', category: 'behavior', riskLevel: 'low', selected: false },
  ];
}

export function genPatchDiffs(patches: PatchDefinition[]): PatchDiff[] {
  return patches
    .filter((p) => p.selected)
    .map((p) => ({
      id: id(),
      address: `0x${hex(8)}`,
      before: pick([
        `bl 0x${hex(8)}  ; integrity_check`,
        `mov w0, #1  ; telemetry_enabled`,
        `ldr x0, [x1]  ; debug_ptr`,
        `cmp w0, #0  ; root_check`,
      ]),
      after: pick([
        `nop  ; integrity_check bypassed`,
        `mov w0, #0  ; telemetry_disabled`,
        `nop  ; debug_ptr cloaked`,
        `b 0x${hex(8)}  ; root_check skipped`,
      ]),
      label: p.name,
    }));
}

export function genExportSummary(target: PatchTarget, patches: PatchDefinition[]): ExportSummary {
  const applied = patches.filter((p) => p.selected).length;
  return {
    targetName: target.name,
    targetType: target.type,
    patchesApplied: applied,
    riskScore: randFloat(0.1, 0.5),
    estimatedDetectionRate: randFloat(0.02, 0.15),
    buildSize: `${randFloat(target.size ? 5 : 5, 250, 1)}MB`,
    timestamp: Date.now(),
  };
}

export function genBehaviorConfig(): BehaviorConfig {
  return {
    aggression: randFloat(0.2, 0.8),
    reactionTime: randFloat(150, 500),
    randomness: randFloat(0.1, 0.6),
    sessionLength: randInt(30, 240),
  };
}

export function genPolicyRules(count: number): PolicyRule[] {
  const layers = ['policy-orchestration', 'session-integrity', 'network-transport-guard', 'risk-scoring-policy', 'ota-governance', 'privacy-compliance'];
  const envs: PolicyRule['environment'][] = ['dev', 'staging', 'prod'];
  return Array.from({ length: count }, () => ({
    id: id(),
    name: pick(['Strict TLS Pinning', 'Low-Risk Update Gate', 'Telemetry Batch Window', 'Root Detection Watch', 'Canary Cohort 5%', 'Privacy EU Mode']),
    layer: pick(layers),
    enabled: Math.random() > 0.2,
    environment: pick(envs),
    config: {
      threshold: randFloat(0.1, 0.9),
      timeout_ms: randInt(1000, 30000),
      enabled: Math.random() > 0.3,
    },
  }));
}

export function genUpdateTrustEntries(count: number): UpdateTrustEntry[] {
  return Array.from({ length: count }, () => ({
    id: id(),
    version: `${randInt(1, 9)}.${randInt(0, 9)}.${randInt(0, 9)}`,
    hash: hexLower(64),
    signer: pick(['release-key-alpha', 'release-key-beta', 'release-key-gamma', 'release-key-delta']),
    timestamp: Date.now() - randInt(0, 86400000 * 30),
    valid: Math.random() > 0.1,
  }));
}

export function genUpdatePolicies(count: number): UpdatePolicy[] {
  return Array.from({ length: count }, () => ({
    id: id(),
    name: pick(['WiFi-Only Stable', 'Staging Cohort', 'Low-Risk Canary', 'Global Rollout', 'Emergency Patch']),
    minVersion: `${randInt(1, 8)}.${randInt(0, 9)}.0`,
    maxVersion: `${randInt(9, 15)}.${randInt(0, 9)}.0`,
    environment: pick(['dev', 'staging', 'prod'] as const),
    cohortPercent: randInt(1, 100),
    wifiOnly: Math.random() > 0.4,
    lowRiskOnly: Math.random() > 0.5,
  }));
}

export function genCanaryRollouts(count: number): CanaryRollout[] {
  const statuses: CanaryRollout['status'][] = ['pending', 'active', 'completed', 'rolled-back'];
  const cohorts: CanaryRollout['cohort'][] = ['qa', 'canary', 'public'];
  return Array.from({ length: count }, () => ({
    id: id(),
    version: `${randInt(1, 9)}.${randInt(0, 9)}.${randInt(0, 9)}`,
    cohort: pick(cohorts),
    deviceCount: randInt(10, 50000),
    crashRate: randFloat(0, 5, 2),
    status: pick(statuses),
  }));
}

export function genDifferentialChecks(count: number): DifferentialCheck[] {
  const modules = ['anti-cheat-glue', 'network-guard', 'js-bundle-core', 'integrity-checker', 'telemetry-schema', 'session-validator'];
  return Array.from({ length: count }, () => ({
    id: id(),
    module: pick(modules),
    oldHash: hexLower(40),
    newHash: hexLower(40),
    riskLevel: pick(['low', 'medium', 'high'] as const),
    reviewRequired: Math.random() > 0.6,
  }));
}

export function genRollbackSlots(count: number): RollbackSlot[] {
  return Array.from({ length: count }, () => ({
    id: id(),
    version: `${randInt(1, 9)}.${randInt(0, 9)}.${randInt(0, 9)}`,
    bundleHash: hexLower(64),
    configHash: hexLower(40),
    knownGood: Math.random() > 0.3,
    timestamp: Date.now() - randInt(0, 86400000 * 7),
  }));
}

export function genSignatureUpdates(count: number): SignatureUpdate[] {
  return Array.from({ length: count }, () => ({
    id: id(),
    ruleSet: pick(['anti-tamper', 'environment-heuristics', 'risk-weights', 'hook-signatures', 'emulator-patterns']),
    version: `${randInt(1, 9)}.${randInt(0, 9)}.${randInt(0, 9)}`,
    signed: Math.random() > 0.05,
    changes: Array.from({ length: randInt(1, 5) }, () => pick(['added-signature', 'updated-weight', 'removed-false-positive', 'new-heuristic', 'threshold-adjusted'])),
    timestamp: Date.now() - randInt(0, 86400000 * 14),
  }));
}

export function genStealthRiskScore(): StealthRiskScore {
  const score = randInt(0, 100);
  const band: StealthRiskScore['band'] = score <= 20 ? 'normal' : score <= 50 ? 'watch' : score <= 80 ? 'restrict' : 'lockdown';
  return {
    score,
    band,
    factors: Array.from({ length: randInt(3, 6) }, () => ({
      layer: pick(['runtime-sensing', 'anti-tamper-hook', 'network-transport-guard', 'session-integrity', 'match-integrity', 'performance-monitor']),
      weight: randFloat(0.1, 0.4),
      value: randFloat(0, 1),
      description: pick([
        'Environment anomalies detected',
        'Hook signatures matched',
        'Network replay token mismatch',
        'Session context changed mid-session',
        'Gameplay action sequence implausible',
        'Protection module exceeding budget',
      ]),
    })),
    timestamp: Date.now(),
  };
}

export function genDegradationActions(count: number): DegradationAction[] {
  const types: DegradationAction['type'][] = ['soft-block', 'hard-block', 'friction', 'informative'];
  return Array.from({ length: count }, () => ({
    id: id(),
    feature: pick(['Ranked Mode', 'Competitive Queue', 'Inventory Trading', 'Matchmaking', 'Leaderboard Submission', 'In-App Purchases']),
    type: pick(types),
    message: pick([
      'Additional verification required for this action.',
      'This feature is temporarily restricted due to security policy.',
      'Please re-authenticate to continue.',
      'Matchmaking may take longer than usual.',
      'This action has been blocked for account safety.',
    ]),
    active: Math.random() > 0.4,
  }));
}

export function genKillSwitches(count: number): KillSwitch[] {
  return Array.from({ length: count }, () => ({
    id: id(),
    name: pick(['Disable Risk Rule v3', 'Rollback Signature Set', 'Force Strict TLS', 'Emergency Lockdown', 'Disable OTA Channel']),
    target: pick(['risk-scoring-policy', 'signature-ruleset-updates', 'network-transport-guard', 'governance-killswitch', 'ota-governance']),
    active: Math.random() > 0.7,
    reason: pick([
      'False positive rate exceeded threshold',
      'Signature set causing crashes on Android 14',
      'Security incident: forced posture change',
      'OTA channel compromised, disabling updates',
      'Rule set incompatible with new game version',
    ]),
    activatedAt: Date.now() - randInt(0, 86400000),
  }));
}

export function genPerformanceMetrics(count: number): PerformanceMetric[] {
  const layers = ['obfuscation-hardening', 'asset-protection', 'js-bundle-shield', 'runtime-sensing', 'anti-tamper-hook', 'network-transport-guard', 'telemetry-evidence'];
  return Array.from({ length: count }, () => {
    const cpu = randFloat(0.5, 15, 1);
    const mem = randFloat(1, 50, 1);
    const frame = randFloat(0.1, 8, 1);
    const net = randFloat(0, 20, 1);
    return {
      layer: pick(layers),
      cpuUsage: cpu,
      memoryUsage: mem,
      frameTimeMs: frame,
      networkOverheadKb: net,
      withinBudget: cpu < 10 && mem < 30 && frame < 5,
    };
  });
}

export function genComplianceRules(): ComplianceRule[] {
  return [
    { id: id(), region: 'EU/GDPR', signalAllowed: true, retentionDays: 30, consentRequired: true },
    { id: id(), region: 'ES/CCPA', signalAllowed: true, retentionDays: 45, consentRequired: false },
    { id: id(), region: 'BR/LGPD', signalAllowed: true, retentionDays: 60, consentRequired: true },
    { id: id(), region: 'Global', signalAllowed: true, retentionDays: 90, consentRequired: false },
    { id: id(), region: 'Restricted', signalAllowed: false, retentionDays: 0, consentRequired: true },
  ];
}
