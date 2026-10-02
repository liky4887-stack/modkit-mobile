export type FeatureCategory =
  | 'identity'
  | 'network'
  | 'behavior'
  | 'memory'
  | 'intelligence'
  | 'accounts'
  | 'prediction'
  | 'forensics'
  | 'education';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type FeatureStatus = 'active' | 'standby' | 'warning' | 'disabled' | 'error';

export interface Feature {
  id: string;
  index: number;
  name: string;
  shortName: string;
  description: string;
  category: FeatureCategory;
  riskLevel: RiskLevel;
  status: FeatureStatus;
  icon: string;
  isSimulated: boolean;
  isEducational: boolean;
  isAbstract: boolean;
}

export interface FeatureMetrics {
  uptime?: number;
  events?: number;
  riskScore?: number;
}

export interface FeatureState {
  enabled: boolean;
  status: FeatureStatus;
  metrics: FeatureMetrics;
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  source: string;
  message: string;
}

export interface SignatureEntry {
  id: string;
  hash: string;
  entropy: number;
  detectionProbability: number;
  rotatedAt: number;
}

export interface MemoryRegion {
  id: string;
  address: string;
  type: 'code' | 'data' | 'heap' | 'stack' | 'module';
  size: string;
  cloaked: boolean;
}

export interface AdversarialRound {
  round: number;
  attackerScore: number;
  defenderScore: number;
  outcome: 'attacker' | 'defender' | 'draw';
}

export interface GenerationEntry {
  generation: number;
  fitness: number;
  bestPatch: string;
}

export interface BanWaveForecast {
  hour: number;
  probability: number;
}

export interface LatencyPoint {
  id: string;
  latency: number;
  jitter: number;
}

export interface MeshNode {
  id: string;
  name: string;
  region: string;
  load: number;
  status: 'online' | 'degraded' | 'offline';
}

export type TargetType = 'APK' | 'IPA' | 'OBB';

export interface PatchTarget {
  id: string;
  name: string;
  packageId: string;
  version: string;
  size: string;
  type: TargetType;
  riskScore: number;
}

export interface AnalysisResult {
  riskScore: number;
  entryPoints: string[];
  detectionHotspots: { id: string; address: string; type: string; severity: RiskLevel }[];
  structureMap: { id: string; name: string; type: string; size: string }[];
  heuristics: { id: string; name: string; confidence: number }[];
}

export interface PatchDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  riskLevel: RiskLevel;
  selected: boolean;
}

export interface PatchDiff {
  id: string;
  label: string;
  address: string;
  before: string;
  after: string;
}

export interface ExportSummary {
  targetName: string;
  targetType: TargetType;
  patchesApplied: number;
  buildSize: string;
  riskScore: number;
  estimatedDetectionRate: number;
}

export interface CleaningProfile {
  id: string;
  name: string;
  packageName: string;
  version: string;
  riskScore: number;
}

export interface CleaningIssue {
  id: string;
  label: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
  detected: boolean;
}

export interface CleaningResult {
  profile: CleaningProfile;
  issues: CleaningIssue[];
}
