// The partition prompt. Sent once per job after the class dump.
// DeepSeek reads the APK's shape and returns independent work units.

export const PARTITION_PROMPT_VERSION = 'v1';

export interface PartitionInput {
  apkName: string;
  apkSize: number;
  dexTotal: number;
  totalClasses: number;
  featureSummary: string;         // one line per feature: "id: N hits, top dex"
  topPackages: Array<{ top: string; count: number }>;
  signalClasses: string[];        // from deep-scan hits, flat list
}

export function buildPartitionPrompt(input: PartitionInput): string {
  const featureLines = input.featureSummary
    .split('\n')
    .filter(l => l.trim().length > 0)
    .slice(0, 40)
    .map(l => '  ' + l.trim())
    .join('\n');

  const pkgLines = input.topPackages
    .slice(0, 25)
    .map(p => '  ' + p.top + '  (' + p.count + ' classes)')
    .join('\n');

  const signalLines = input.signalClasses
    .slice(0, 80)
    .map(c => '  ' + c)
    .join('\n');

  return [
    'You are partitioning an Android application for distributed binary analysis.',
    '',
    'APPLICATION',
    '  name: ' + input.apkName,
    '  size: ' + (input.apkSize / 1024 / 1024).toFixed(1) + ' MB',
    '  dex files: ' + input.dexTotal,
    '  total classes: ' + input.totalClasses,
    '',
    'FEATURES DETECTED (already scanned)',
    featureLines || '  (none)',
    '',
    'TOP PACKAGES BY CLASS COUNT',
    pkgLines || '  (none)',
    '',
    'SIGNAL CLASSES (matched by feature scans)',
    signalLines || '  (none)',
    '',
    'TASK',
    'Split this application into independent work units. Each unit must:',
    '  - Fit within one conversation context (target 40–120 classes).',
    '  - Be logically cohesive (one package subtree OR one subsystem).',
    '  - Have a clear brief of what to investigate.',
    '  - Not overlap with other units more than necessary.',
    '',
    'RULES',
    '  - Prefer package-based splitting.',
    '  - Native libs and assets become separate units if present.',
    '  - If a top-level package has >200 classes, split it by second-level sub-package.',
    '  - Every signal class must appear in at least one unit.',
    '  - Aim for 20–40 units total.',
    '',
    'OUTPUT',
    'Return ONLY valid JSON, no prose, no markdown:',
    '{',
    '  "units": [',
    '    {',
    '      "name": "short-id (kebab-case, max 32 chars)",',
    '      "kind": "package | native_lib | asset | config | subsystem",',
    '      "brief": "one sentence describing what to investigate here",',
    '      "classes": ["com.example.Foo", "..."],',
    '      "dexFiles": ["classesN.dex", "..."]',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}
