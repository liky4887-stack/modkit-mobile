import type { Feature } from '@/types';

export const features: Feature[] = [
  { id: 'signature-engine', index: 1, name: 'Dynamic Signature Engine', shortName: 'Signature', category: 'identity', description: 'Continuously rotates binary identity fingerprints to evade static detection.', icon: 'Fingerprint', status: 'active', riskLevel: 'medium', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'hwid-spoofer', index: 2, name: 'Hardware ID Spoofer', shortName: 'HWID', category: 'identity', description: 'Simulates alternative device identifier generation for testing.', icon: 'Cpu', status: 'standby', riskLevel: 'high', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'packet-manipulator', index: 3, name: 'Packet Manipulator', shortName: 'Packets', category: 'network', description: 'Logical layer for request/response transformation rules.', icon: 'Network', status: 'standby', riskLevel: 'medium', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'behavioral-mimic', index: 4, name: 'Heuristic Behavioral Mimic', shortName: 'Mimic', category: 'behavior', description: 'Models and simulates normal human gameplay patterns.', icon: 'Activity', status: 'active', riskLevel: 'low', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'memory-cloaking', index: 5, name: 'Memory Cloaking Layer', shortName: 'Cloak', category: 'memory', description: 'Abstract layer representing obfuscated memory regions.', icon: 'EyeOff', status: 'standby', riskLevel: 'high', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'patch-oracle', index: 6, name: 'Auto Patching Oracle', shortName: 'Oracle', category: 'intelligence', description: 'Suggests conceptual patches when target app updates.', icon: 'Sparkles', status: 'active', riskLevel: 'low', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'virtual-env', index: 7, name: 'Virtualized Environment', shortName: 'Sandbox', category: 'environment', description: 'In-app virtual env model to run scenario simulations.', icon: 'Box', status: 'standby', riskLevel: 'medium', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'kernel-bridge', index: 8, name: 'Kernel Level Rootkit Bridge', shortName: 'Kernel', category: 'kernel', description: 'Conceptual interface only. No real kernel or rootkit code.', icon: 'AlertTriangle', status: 'disabled', riskLevel: 'critical', isSimulated: false, isAbstract: true, isEducational: true },
  { id: 'neural-sync', index: 9, name: 'Cross Account Neural Sync', shortName: 'Sync', category: 'accounts', description: 'Neural model simulating shared behavior profiles across accounts.', icon: 'Share2', status: 'standby', riskLevel: 'high', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'self-destruct', index: 10, name: 'Self Destructing Artifact Layer', shortName: 'Purge', category: 'forensics', description: 'Simulated policy engine for cleaning logs, configs, and traces.', icon: 'Trash2', status: 'standby', riskLevel: 'medium', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'quantum-rollback', index: 11, name: 'Quantum State Rollback', shortName: 'Rollback', category: 'forensics', description: 'Snapshot and rollback of configuration and conceptual system state.', icon: 'Rewind', status: 'standby', riskLevel: 'low', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'anti-cheat-sim', index: 12, name: 'Predictive Anti Cheat Simulation', shortName: 'Predict', category: 'prediction', description: 'Local model that predicts if a config is likely to be detected.', icon: 'ShieldCheck', status: 'active', riskLevel: 'none', isSimulated: true, isAbstract: false, isEducational: true },
  { id: 'zero-day-gen', index: 13, name: 'Zero Day Heuristic Generator', shortName: 'ZeroDay', category: 'intelligence', description: 'Heuristic generator that proposes new evasion patterns.', icon: 'Lightbulb', status: 'standby', riskLevel: 'high', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'social-eng', index: 14, name: 'AI Driven Social Engineering', shortName: 'SocialEng', category: 'education', description: 'EDUCATIONAL ONLY module describing how social engineering operates.', icon: 'GraduationCap', status: 'active', riskLevel: 'none', isSimulated: false, isAbstract: true, isEducational: true },
  { id: 'account-farm', index: 15, name: 'Automated Account Farm Manager', shortName: 'Farm', category: 'accounts', description: 'Manager for multiple pseudo account profiles.', icon: 'Users', status: 'standby', riskLevel: 'high', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'ban-wave-predictor', index: 16, name: 'Neural Network Ban Wave Predictor', shortName: 'BanWave', category: 'prediction', description: 'Model that forecasts potential ban waves from telemetry patterns.', icon: 'TrendingDown', status: 'active', riskLevel: 'none', isSimulated: true, isAbstract: false, isEducational: true },
  { id: 'memory-injector', index: 17, name: 'Real Time Memory Injector', shortName: 'Injector', category: 'memory', description: 'High level abstraction for on-the-fly adjustments.', icon: 'Zap', status: 'disabled', riskLevel: 'critical', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'shadow-mirror', index: 18, name: 'Cloud Based Shadow Mirror', shortName: 'Mirror', category: 'environment', description: 'Conceptual shadow session mirror stored remotely.', icon: 'Cloud', status: 'standby', riskLevel: 'medium', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'genetic-patches', index: 19, name: 'Genetic Algorithm For Patches', shortName: 'Genetic', category: 'intelligence', description: 'Evolves patch configurations over generations.', icon: 'GitBranch', status: 'active', riskLevel: 'low', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'polymorphic-engine', index: 20, name: 'Polymorphic Code Engine', shortName: 'Polymorph', category: 'binary', description: 'Conceptual engine that mutates signatures while preserving behavior.', icon: 'Shuffle', status: 'standby', riskLevel: 'high', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'latency-optimizer', index: 21, name: 'Neural Link Latency Optimizer', shortName: 'Latency', category: 'optimization', description: 'Optimizes simulated latency and responsiveness of configurations.', icon: 'Gauge', status: 'active', riskLevel: 'none', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'mesh-compute', index: 22, name: 'Distributed Mesh Compute Layer', shortName: 'Mesh', category: 'distributed', description: 'Simulated distributed compute across devices/nodes.', icon: 'Share', status: 'standby', riskLevel: 'medium', isSimulated: true, isAbstract: false, isEducational: false },
  { id: 'adversarial-net', index: 23, name: 'Adaptive Adversarial Network', shortName: 'Adversarial', category: 'adversarial', description: 'Two AIs competing - one defender, one attacker, both simulated locally.', icon: 'Swords', status: 'active', riskLevel: 'low', isSimulated: true, isAbstract: false, isEducational: true },
];

export const featureMap: Record<string, Feature> = Object.fromEntries(
  features.map((f) => [f.id, f]),
);

export function getFeatureById(id: string): Feature | undefined {
  return featureMap[id];
}

export function getFeaturesByCategory(category: string): Feature[] {
  return features.filter((f) => f.category === category);
}
