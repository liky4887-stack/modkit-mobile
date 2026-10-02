import type {
  SignatureEntry,
  LogEntry,
  MemoryRegion,
  AdversarialRound,
  GenerationEntry,
  BanWaveForecast,
  LatencyPoint,
  MeshNode,
  PatchTarget,
  AnalysisResult,
  PatchDefinition,
  PatchDiff,
  ExportSummary,
  CleaningProfile,
  CleaningResult,
  LogLevel,
} from '@/types';

let seed = 1337;
function rand(): number {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}

function hex(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += '0123456789abcdef'[Math.floor(rand() * 16)];
  return out;
}

export function genSignatures(count: number): SignatureEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `sig-${i}-${hex(4)}`,
    hash: hex(64),
    entropy: 3.5 + rand() * 4.5,
    detectionProbability: rand() * 0.5,
    rotatedAt: Date.now() - i * 3600000,
  }));
}

const LOG_MESSAGES: { level: LogLevel; source: string; message: string }[] = [
  { level: 'info', source: 'aimbot', message: 'FOV target acquired — locking' },
  { level: 'success', source: 'aimbot', message: 'Target locked: headshot angle' },
  { level: 'warn', source: 'esp-wallhack', message: 'Enemy within 50m — rendering box' },
  { level: 'info', source: 'esp-wallhack', message: 'Loot filter updated: M416, AWM' },
  { level: 'debug', source: 'speed-hack', message: 'Speed multiplier set to 1.35x' },
  { level: 'success', source: 'recoil-control', message: 'Recoil pattern loaded: M416' },
  { level: 'warn', source: 'anti-ban', message: 'Signature rotation scheduled' },
  { level: 'error', source: 'magic-bullet', message: 'Redirect failed — target out of range' },
  { level: 'info', source: 'radar-hack', message: 'Full map sync complete' },
  { level: 'success', source: 'no-recoil', message: 'Zero recoil engaged' },
  { level: 'debug', source: 'teleport', message: 'Coordinate cache warmed' },
  { level: 'warn', source: 'god-mode', message: 'Damage handler hooked' },
  { level: 'info', source: 'item-esp', message: 'High-tier loot detected: 3 items' },
  { level: 'success', source: 'fast-loot', message: 'Auto-pickup active' },
  { level: 'debug', source: 'vehicle-esp', message: 'Vehicle spawn data refreshed' },
  { level: 'warn', source: 'invisible', message: 'Cloak shader applied' },
  { level: 'error', source: 'anti-ban', message: 'Detection probe blocked' },
  { level: 'info', source: 'wall-shoot', message: 'Penetration enabled: all surfaces' },
  { level: 'success', source: 'auto-headshot', message: 'Hitbox override active' },
  { level: 'debug', source: 'grenade-helper', message: 'Trajectory arc computed' },
];

export function genLogs(count: number): LogEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const m = LOG_MESSAGES[Math.floor(rand() * LOG_MESSAGES.length)];
    return {
      id: `log-${Date.now()}-${i}-${hex(4)}`,
      timestamp: Date.now() - i * 5000,
      level: m.level,
      source: m.source,
      message: m.message,
    };
  });
}

export function genMemoryRegions(count: number): MemoryRegion[] {
  const types: MemoryRegion['type'][] = ['code', 'data', 'heap', 'stack', 'module'];
  return Array.from({ length: count }, (_, i) => ({
    id: `mem-${i}`,
    address: `0x${hex(8).toUpperCase()}`,
    type: types[Math.floor(rand() * types.length)],
    size: `${(rand() * 512).toFixed(1)} KB`,
    cloaked: rand() > 0.6,
  }));
}

export function genAdversarialRounds(count: number): AdversarialRound[] {
  return Array.from({ length: count }, (_, i) => {
    const a = Math.floor(rand() * 100);
    const d = Math.floor(rand() * 100);
    return {
      round: i + 1,
      attackerScore: a,
      defenderScore: d,
      outcome: a > d ? 'attacker' : d > a ? 'defender' : 'draw',
    };
  });
}

export function genGenerations(count: number): GenerationEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    generation: i + 1,
    fitness: 0.3 + rand() * 0.7,
    bestPatch: `patch_${hex(6)}`,
  }));
}

export function genBanWaveForecast(count: number): BanWaveForecast[] {
  return Array.from({ length: count }, (_, i) => ({
    hour: i + 1,
    probability: rand() * 0.8,
  }));
}

export function genLatencyPoints(count: number): LatencyPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `lat-${i}`,
    latency: 20 + rand() * 120,
    jitter: rand() * 15,
  }));
}

export function genMeshNodes(count: number): MeshNode[] {
  const regions = ['NA-East', 'NA-West', 'EU-Central', 'EU-West', 'ASIA-SE', 'SA-East'];
  const statuses: MeshNode['status'][] = ['online', 'online', 'online', 'degraded', 'offline'];
  return Array.from({ length: count }, (_, i) => ({
    id: `node-${i}`,
    name: `relay-${hex(4)}`,
    region: regions[Math.floor(rand() * regions.length)],
    load: rand(),
    status: statuses[Math.floor(rand() * statuses.length)],
  }));
}

export function genPatchTargets(count: number): PatchTarget[] {
  const names = ['PUBG Mobile 3.2.0', 'PUBG Mobile 3.1.0', 'BGMI 3.2.0', 'PUBG Mobile Lite 0.26'];
  const types: PatchTarget['type'][] = ['APK', 'APK', 'APK', 'OBB'];
  return Array.from({ length: count }, (_, i) => ({
    id: `target-${i}`,
    name: names[i % names.length],
    packageId: 'com.tencent.ig',
    version: `3.${i}.0`,
    size: `${(1.5 + rand() * 2).toFixed(1)} GB`,
    type: types[i % types.length],
    riskScore: rand(),
  }));
}

export function genAnalysisResult(): AnalysisResult {
  return {
    riskScore: rand(),
    entryPoints: ['0x004A2B10', '0x004B1C40', '0x0050F880', '0x0061A220'],
    detectionHotspots: [
      { id: 'hs-1', address: '0x004A2B10', type: 'integrity_check', severity: 'high' },
      { id: 'hs-2', address: '0x004B1C40', type: 'anti_debug', severity: 'medium' },
      { id: 'hs-3', address: '0x0050F880', type: 'memory_scan', severity: 'low' },
      { id: 'hs-4', address: '0x0061A220', type: 'signature_match', severity: 'high' },
    ],
    structureMap: [
      { id: 's-1', name: 'libUE4.so', type: 'native', size: '48.2 MB' },
      { id: 's-2', name: 'classes.dex', type: 'dalvik', size: '12.4 MB' },
      { id: 's-3', name: 'assets/', type: 'data', size: '1.2 GB' },
      { id: 's-4', name: 'AndroidManifest.xml', type: 'xml', size: '48 KB' },
    ],
    heuristics: [
      { id: 'h-1', name: 'Memory tampering', confidence: rand() },
      { id: 'h-2', name: 'Signature anomaly', confidence: rand() },
      { id: 'h-3', name: 'Behavioral deviation', confidence: rand() },
      { id: 'h-4', name: 'Root detection', confidence: rand() },
    ],
  };
}

export function genPatchDefinitions(): PatchDefinition[] {
  return [
    { id: 'p-1', name: 'Bypass Integrity Check', description: 'NOP the integrity verification routine at 0x004A2B10.', category: 'security', riskLevel: 'high', selected: true },
    { id: 'p-2', name: 'Disable Anti-Debug', description: 'Patch ptrace detection and debugger checks.', category: 'security', riskLevel: 'medium', selected: true },
    { id: 'p-3', name: 'Spoof Device ID', description: 'Replace hardware identifiers with randomized values.', category: 'identity', riskLevel: 'medium', selected: false },
    { id: 'p-4', name: 'Memory Signature Cloak', description: 'Obfuscate known cheat signatures in memory.', category: 'forensics', riskLevel: 'high', selected: false },
    { id: 'p-5', name: 'Network Packet Filter', description: 'Drop telemetry packets before they leave the device.', category: 'network', riskLevel: 'high', selected: false },
  ];
}

export function genPatchDiffs(patches: PatchDefinition[]): PatchDiff[] {
  const selected = patches.filter((p) => p.selected);
  return selected.map((p, i) => ({
    id: `diff-${i}`,
    label: p.name,
    address: `0x${(0x4A2B10 + i * 0x1000).toString(16).toUpperCase()}`,
    before: `if (checkIntegrity() != VALID) { exit(0); }`,
    after: `if (false) { exit(0); } // patched`,
  }));
}

export function genExportSummary(target: PatchTarget, patches: PatchDefinition[]): ExportSummary {
  return {
    targetName: target.name,
    targetType: target.type,
    patchesApplied: patches.filter((p) => p.selected).length,
    buildSize: target.size,
    riskScore: rand(),
    estimatedDetectionRate: rand() * 0.3,
  };
}

export function genCleaningProfiles(count: number): CleaningProfile[] {
  const names = ['PUBG Mobile Modified', 'BGMI Modded', 'PUBG Lite Tweaked', 'PUBG CN Variant'];
  return Array.from({ length: count }, (_, i) => ({
    id: `profile-${i}`,
    name: names[i % names.length],
    packageName: 'com.tencent.ig',
    version: `3.${i}.1`,
    riskScore: rand(),
  }));
}

export function genCleaningResult(): CleaningResult {
  const profiles = genCleaningProfiles(1);
  return {
    profile: profiles[0],
    issues: [
      { id: 'ci-1', label: 'Cheat signature detected', detail: 'Known aimbot pattern found in memory', severity: 'high', detected: true },
      { id: 'ci-2', label: 'Modified APK signature', detail: 'APK signing certificate does not match original', severity: 'high', detected: true },
      { id: 'ci-3', label: 'Suspicious permissions', detail: 'Overlay and accessibility permissions requested', severity: 'medium', detected: true },
      { id: 'ci-4', label: 'Root binaries present', detail: 'su and magisk binaries found on device', severity: 'high', detected: true },
      { id: 'ci-5', label: 'Debug flags enabled', detail: 'android:debuggable=true in manifest', severity: 'medium', detected: false },
      { id: 'ci-6', label: 'Emulator detected', detail: 'Running on emulated hardware', severity: 'low', detected: false },
    ],
  };
}
