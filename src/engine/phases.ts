import type { WorkflowPhase } from './types';

export const PHASES: { id: WorkflowPhase; label: string; description: string }[] = [
  { id: 'investigate', label: 'Investigate', description: 'Read-only inspection of uploaded files' },
  { id: 'analyze',     label: 'Analyze',     description: 'Risk scoring and threat detection' },
  { id: 'edit',        label: 'Edit',        description: 'Design and validate defensive configurations' },
  { id: 'preview',     label: 'Preview',     description: 'Validate proposed changes' },
  { id: 'build',       label: 'Build',       description: 'Sign and package the output' },
  { id: 'export',      label: 'Export',      description: 'Deliver via policy-governed channels' },
];

export const PHASE_FEATURES: Record<WorkflowPhase, string[]> = {
  investigate: [
    'runtime-sensing',
    'device-fingerprint',
    'session-integrity',
    'anti-tamper-hook',
    'asset-protection',
    'obfuscation-hardening',
    'js-bundle-shield',
    'differential-integrity',
  ],
  analyze: [
    'telemetry-evidence',
    'network-transport-guard',
    'match-integrity',
    'performance-monitor',
    'risk-scoring-policy',
    'privacy-compliance',
    'observability-debug',
  ],
  edit: [
    'differential-integrity',
    'secure-storage',
    'policy-orchestration',
    'signature-ruleset-updates',
  ],
  preview: [
    'secure-storage',
    'ota-governance',
  ],
  build: [
    'build-release-integrity',
    'cross-platform-abstraction',
    'update-trust-chain',
  ],
  export: [
    'update-policy-engine',
    'safe-staging-canary',
    'rollback-recovery',
    'signature-ruleset-updates',
    'ota-governance',
    'update-ux',
    'update-telemetry-audit',
    'governance-killswitch',
    'policy-orchestration',
    'ux-degradation',
  ],
};
