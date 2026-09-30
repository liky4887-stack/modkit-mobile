export type FeatureCategory =
  | 'binary'
  | 'identity'
  | 'network'
  | 'behavior'
  | 'memory'
  | 'intelligence'
  | 'environment'
  | 'kernel'
  | 'accounts'
  | 'forensics'
  | 'prediction'
  | 'optimization'
  | 'distributed'
  | 'adversarial'
  | 'education'
  | 'policy'
  | 'integrity'
  | 'storage'
  | 'build'
  | 'update'
  | 'privacy'
  | 'observability'
  | 'performance'
  | 'platform'
  | 'governance';

export type FeatureStatus = 'active' | 'standby' | 'warning' | 'disabled';

export interface Feature {
  id: string;
  index: number;
  name: string;
  shortName: string;
  category: FeatureCategory;
  description: string;
  icon: string;
  status: FeatureStatus;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  isSimulated: boolean;
  isAbstract: boolean;
  isEducational: boolean;
}

export interface FeatureStatusUpdate {
  featureId: string;
  status: FeatureStatus;
  enabled: boolean;
  lastActivated: number;
  metrics: Record<string, number>;
}

export type TargetType = 'APK' | 'IPA' | 'OBB';

export type PatchStep =
  | 'import'
  | 'analysis'
  | 'design'
  | 'preview'
  | 'export';

export interface PatchTarget {
  id: string;
  name: string;
  type: TargetType;
  size: string;
  version: string;
  packageId: string;
  createdAt: number;
}

export interface AnalysisResult {
  entryPoints: string[];
  detectionHotspots: DetectionHotspot[];
  structureMap: StructureNode[];
  riskScore: number;
  offsets: OffsetEntry[];
  heuristics: HeuristicEntry[];
}

export interface DetectionHotspot {
  id: string;
  address: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
}

export interface StructureNode {
  id: string;
  name: string;
  type: string;
  offset: string;
  size: string;
  children?: StructureNode[];
}

export interface OffsetEntry {
  address: string;
  region: string;
  description: string;
  writable: boolean;
}

export interface HeuristicEntry {
  id: string;
  name: string;
  confidence: number;
  category: string;
}

export interface PatchDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  riskLevel: 'low' | 'medium' | 'high';
  selected: boolean;
}

export interface PatchDiff {
  id: string;
  address: string;
  before: string;
  after: string;
  label: string;
}

export interface ExportSummary {
  targetName: string;
  targetType: TargetType;
  patchesApplied: number;
  riskScore: number;
  estimatedDetectionRate: number;
  buildSize: string;
  timestamp: number;
}

export type IssueSeverity = 'high' | 'medium' | 'low';

export interface CleaningIssue {
  id: string;
  name: string;
  severity: IssueSeverity;
  category: string;
  description: string;
  recommendation: string;
  detected: boolean;
}

export interface CleaningProfile {
  id: string;
  name: string;
  packageName: string;
  version: string;
  modifiedAt: number;
  riskScore: number;
}

export interface CleaningResult {
  profile: CleaningProfile;
  issues: CleaningIssue[];
  cleanConfig: Record<string, string | number | boolean>;
  riskPrediction: number;
  recommendedActions: string[];
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success' | 'debug';
  source: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface SignatureEntry {
  id: string;
  timestamp: number;
  hash: string;
  entropy: number;
  detectionProbability: number;
  profile: string;
}

export interface DeviceIdSet {
  id: string;
  profileName: string;
  deviceId: string;
  androidId: string;
  imei: string;
  serial: string;
  mac: string;
  active: boolean;
}

export interface PacketRule {
  id: string;
  name: string;
  action: 'drop' | 'delay' | 'modify' | 'randomize';
  pattern: string;
  hitCount: number;
  enabled: boolean;
}

export interface PacketLogEntry {
  id: string;
  timestamp: number;
  direction: 'inbound' | 'outbound';
  protocol: string;
  size: number;
  rule?: string;
  status: 'passed' | 'dropped' | 'modified' | 'delayed';
}

export interface BehaviorConfig {
  aggression: number;
  reactionTime: number;
  randomness: number;
  sessionLength: number;
}

export interface MemoryRegion {
  id: string;
  address: string;
  size: string;
  type: 'code' | 'data' | 'heap' | 'stack' | 'cloaked';
  protection: string;
  cloaked: boolean;
}

export interface OraclePatch {
  id: string;
  version: string;
  compatibility: number;
  patches: string[];
  rationale: string;
  timestamp: number;
}

export interface SandboxSession {
  id: string;
  profile: string;
  device: string;
  os: string;
  network: string;
  status: 'running' | 'completed' | 'failed';
  riskEstimate: number;
  startedAt: number;
  logs: string[];
}

export interface SnapshotEntry {
  id: string;
  label: string;
  timestamp: number;
  changes: string[];
  riskEstimate: number;
}

export interface RiskPrediction {
  score: number;
  factors: RiskFactor[];
  recommendation: string;
}

export interface RiskFactor {
  label: string;
  weight: number;
  value: number;
  description: string;
}

export interface HeuristicCandidate {
  id: string;
  name: string;
  complexity: number;
  stability: number;
  category: string;
  description: string;
}

export interface SocialEngScenario {
  id: string;
  title: string;
  category: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  isTrainingOnly: boolean;
}

export interface FarmAccount {
  id: string;
  name: string;
  group: string;
  status: 'active' | 'cooldown' | 'banned' | 'standby';
  riskLevel: number;
  activityLevel: number;
  createdAt: number;
}

export interface BanWaveForecast {
  timestamp: number;
  probability: number;
  confidence: number;
  trigger: string;
}

export interface InjectionEvent {
  id: string;
  timestamp: number;
  target: string;
  type: string;
  status: 'success' | 'failed' | 'pending';
  payload: string;
}

export interface ShadowSession {
  id: string;
  label: string;
  timestamp: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
  stateHash: string;
  size: string;
}

export interface GenerationEntry {
  generation: number;
  fitness: number;
  mutationRate: number;
  diversity: number;
  patchCount: number;
  bestPatch: string;
}

export interface CodeVariant {
  id: string;
  variantId: string;
  code: string;
  diversity: number;
  reuse: number;
  detectionRisk: number;
}

export interface LatencyPoint {
  timestamp: number;
  latency: number;
  jitter: number;
}

export interface MeshNode {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'degraded';
  load: number;
  region: string;
  tasks: number;
}

export interface AdversarialRound {
  round: number;
  attackerScore: number;
  defenderScore: number;
  strategy: string;
  outcome: 'attacker' | 'defender' | 'draw';
}

export interface NeuralSyncAccount {
  id: string;
  name: string;
  cluster: string;
  syncStrength: number;
  uniqueness: number;
  fingerprint: string;
}

export interface SelfDestructRule {
  id: string;
  trigger: 'time' | 'risk' | 'manual' | 'detection';
  threshold: string;
  targets: string[];
  enabled: boolean;
}

export interface QuantumSnapshot {
  id: string;
  label: string;
  timestamp: number;
  configHash: string;
  changes: string[];
  riskEstimate: number;
}

export interface PolicyRule {
  id: string;
  name: string;
  layer: string;
  enabled: boolean;
  environment: 'dev' | 'staging' | 'prod';
  config: Record<string, string | number | boolean>;
}

export interface StealthLayer {
  id: string;
  index: number;
  name: string;
  shortName: string;
  category: FeatureCategory;
  description: string;
  icon: string;
  status: FeatureStatus;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  isSimulated: boolean;
  isAbstract: boolean;
  isEducational: boolean;
}

export interface UpdateTrustEntry {
  id: string;
  version: string;
  hash: string;
  signer: string;
  timestamp: number;
  valid: boolean;
}

export interface UpdatePolicy {
  id: string;
  name: string;
  minVersion: string;
  maxVersion: string;
  environment: 'dev' | 'staging' | 'prod';
  cohortPercent: number;
  wifiOnly: boolean;
  lowRiskOnly: boolean;
}

export interface CanaryRollout {
  id: string;
  version: string;
  cohort: 'qa' | 'canary' | 'public';
  deviceCount: number;
  crashRate: number;
  status: 'pending' | 'active' | 'completed' | 'rolled-back';
}

export interface DifferentialCheck {
  id: string;
  module: string;
  oldHash: string;
  newHash: string;
  riskLevel: 'low' | 'medium' | 'high';
  reviewRequired: boolean;
}

export interface RollbackSlot {
  id: string;
  version: string;
  bundleHash: string;
  configHash: string;
  knownGood: boolean;
  timestamp: number;
}

export interface SignatureUpdate {
  id: string;
  ruleSet: string;
  version: string;
  signed: boolean;
  changes: string[];
  timestamp: number;
}

export interface StealthRiskScore {
  score: number;
  band: 'normal' | 'watch' | 'restrict' | 'lockdown';
  factors: StealthRiskFactor[];
  timestamp: number;
}

export interface StealthRiskFactor {
  layer: string;
  weight: number;
  value: number;
  description: string;
}

export interface DegradationAction {
  id: string;
  feature: string;
  type: 'soft-block' | 'hard-block' | 'friction' | 'informative';
  message: string;
  active: boolean;
}

export interface KillSwitch {
  id: string;
  name: string;
  target: string;
  active: boolean;
  reason: string;
  activatedAt: number;
}

export interface PerformanceMetric {
  layer: string;
  cpuUsage: number;
  memoryUsage: number;
  frameTimeMs: number;
  networkOverheadKb: number;
  withinBudget: boolean;
}

export interface ComplianceRule {
  id: string;
  region: string;
  signalAllowed: boolean;
  retentionDays: number;
  consentRequired: boolean;
}
