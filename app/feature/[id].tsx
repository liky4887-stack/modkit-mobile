import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { TopBar, Panel, Toggle, RiskMeter, StatusBadge, WarningBanner, StatCard, CodeBlock, Slider, LogLine } from '@/components';
import { FeatureIcon } from '@/components/FeatureIcon';
import { getFeatureById } from '@/features/registry';
import { useAppStore } from '@/store/useAppStore';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Info } from 'lucide-react-native';
import { genLogs, genSignatures, genMemoryRegions, genAdversarialRounds, genGenerations, genBanWaveForecast, genLatencyPoints, genMeshNodes } from '@/utils/mockData';
import type { LogEntry, SignatureEntry, MemoryRegion, AdversarialRound, GenerationEntry, BanWaveForecast, LatencyPoint, MeshNode } from '@/types';

export default function FeatureDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const feature = id ? getFeatureById(id) : undefined;
  const { featureStates, toggleFeature, addLog } = useAppStore();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [signatures, setSignatures] = useState<SignatureEntry[]>([]);
  const [memoryRegions, setMemoryRegions] = useState<MemoryRegion[]>([]);
  const [rounds, setRounds] = useState<AdversarialRound[]>([]);
  const [generations, setGenerations] = useState<GenerationEntry[]>([]);
  const [forecasts, setForecasts] = useState<BanWaveForecast[]>([]);
  const [latency, setLatency] = useState<LatencyPoint[]>([]);
  const [meshNodes, setMeshNodes] = useState<MeshNode[]>([]);
  const [aggression, setAggression] = useState(0.5);
  const [reactionTime, setReactionTime] = useState(300);
  const [randomness, setRandomness] = useState(0.3);
  const [sessionLength, setSessionLength] = useState(120);

  useEffect(() => {
    setLogs(genLogs(8));
    if (feature) {
      if (feature.id === 'signature-engine') setSignatures(genSignatures(8));
      if (feature.id === 'memory-cloaking' || feature.id === 'memory-injector') setMemoryRegions(genMemoryRegions(10));
      if (feature.id === 'adversarial-net') setRounds(genAdversarialRounds(10));
      if (feature.id === 'genetic-patches') setGenerations(genGenerations(8));
      if (feature.id === 'ban-wave-predictor') setForecasts(genBanWaveForecast(12));
      if (feature.id === 'latency-optimizer') setLatency(genLatencyPoints(20));
      if (feature.id === 'mesh-compute') setMeshNodes(genMeshNodes(6));
    }
  }, [feature]);

  if (!feature) {
    return (
      <View style={styles.container}>
        <TopBar title="NOT FOUND" onLeftPress={() => router.back()} showBack />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Feature not found.</Text>
        </View>
      </View>
    );
  }

  const state = featureStates[feature.id];
  const isAbstract = feature.isAbstract || feature.isEducational;

  return (
    <View style={styles.container}>
      <TopBar
        title={feature.shortName.toUpperCase()}
        subtitle={feature.category}
        onLeftPress={() => router.back()}
        showBack
        statusColor={state?.enabled ? colors.accent : colors.textTertiary}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={[styles.headerIcon, { borderColor: (feature.riskLevel === 'critical' ? colors.danger : colors.accent) + '30' }]}>
            <FeatureIcon name={feature.icon} size={28} color={feature.riskLevel === 'critical' ? colors.danger : colors.accent} />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{feature.name}</Text>
            <Text style={styles.headerDesc}>{feature.description}</Text>
            <View style={styles.headerTags}>
              {feature.isSimulated && <View style={[styles.tag, { backgroundColor: colors.infoGlow }]}><Text style={[styles.tagText, { color: colors.info }]}>SIMULATED</Text></View>}
              {isAbstract && <View style={[styles.tag, { backgroundColor: colors.purpleGlow }]}><Text style={[styles.tagText, { color: colors.purple }]}>EDUCATIONAL</Text></View>}
              <View style={[styles.tag, { backgroundColor: feature.riskLevel === 'critical' ? colors.dangerGlow : feature.riskLevel === 'high' ? colors.warningGlow : colors.accentGlow }]}>
                <Text style={[styles.tagText, { color: feature.riskLevel === 'critical' ? colors.danger : feature.riskLevel === 'high' ? colors.warning : colors.accent }]}>
                  {feature.riskLevel.toUpperCase()} RISK
                </Text>
              </View>
            </View>
          </View>
        </View>

        {isAbstract && (
          <View style={styles.sectionSpacing}>
            <WarningBanner
              message={feature.id === 'kernel-bridge'
                ? "This is a conceptual interface only. No real kernel or rootkit code is involved. For educational understanding of what such a bridge would conceptually do."
                : feature.id === 'social-eng'
                ? "EDUCATIONAL ONLY. This module describes how social engineering operates for defensive awareness training. Not a tool for malicious use."
                : "This module is educational and abstract. No real exploitation is performed."}
              type={feature.id === 'kernel-bridge' ? 'danger' : 'educational'}
            />
          </View>
        )}

        <View style={styles.sectionSpacing} />
        <Panel title="Module Control">
          <View style={styles.controlRow}>
            <View style={styles.controlInfo}>
              <Text style={styles.controlLabel}>Enable Module</Text>
              <Text style={styles.controlDesc}>Toggle to activate this module's simulation</Text>
            </View>
            <Toggle
              value={state?.enabled ?? false}
              onToggle={() => {
                toggleFeature(feature.id);
                addLog({
                  id: `${Date.now()}`,
                  timestamp: Date.now(),
                  level: state?.enabled ? 'warn' : 'success',
                  source: feature.id,
                  message: `${feature.shortName} ${state?.enabled ? 'disabled' : 'enabled'}`,
                });
              }}
              disabled={feature.status === 'disabled' && feature.riskLevel === 'critical'}
            />
          </View>
          {state && (
            <View style={styles.metricsRow}>
              <StatCard label="Uptime" value={`${Math.floor((state.metrics.uptime ?? 0) / 3600)}h`} color={colors.cyan} />
              <StatCard label="Events" value={state.metrics.events ?? 0} color={colors.accent} />
              <StatCard label="Risk" value={`${((state.metrics.riskScore ?? 0) * 100).toFixed(0)}%`} color={colors.warning} />
            </View>
          )}
        </Panel>

        {feature.id === 'behavioral-mimic' && (
          <View style={styles.sectionSpacing}>
            <Panel title="Behavior Parameters">
              <Slider label="Aggression" value={aggression} min={0} max={1} onChange={setAggression} />
              <Slider label="Reaction Time" value={reactionTime} min={100} max={800} step={10} onChange={setReactionTime} unit="ms" displayValue={reactionTime.toString()} />
              <Slider label="Randomness" value={randomness} min={0} max={1} onChange={setRandomness} />
              <Slider label="Session Length" value={sessionLength} min={15} max={300} step={5} onChange={setSessionLength} unit="min" displayValue={sessionLength.toString()} />
            </Panel>
          </View>
        )}

        {signatures.length > 0 && (
          <View style={styles.sectionSpacing}>
            <Panel title="Signature History">
              {signatures.map((sig, i) => (
                <View key={sig.id} style={[styles.dataRow, i < signatures.length - 1 && styles.dataRowBorder]}>
                  <Text style={styles.dataHash}>{sig.hash.slice(0, 32)}...</Text>
                  <View style={styles.dataRight}>
                    <Text style={styles.dataEntropy}>E:{sig.entropy.toFixed(2)}</Text>
                    <Text style={styles.dataDet}>D:{(sig.detectionProbability * 100).toFixed(1)}%</Text>
                  </View>
                </View>
              ))}
            </Panel>
          </View>
        )}

        {memoryRegions.length > 0 && (
          <View style={styles.sectionSpacing}>
            <Panel title="Memory Map">
              {memoryRegions.map((region, i) => (
                <View key={region.id} style={[styles.dataRow, i < memoryRegions.length - 1 && styles.dataRowBorder]}>
                  <View style={styles.memLeft}>
                    <View style={[styles.memDot, { backgroundColor: region.cloaked ? colors.purple : region.type === 'code' ? colors.accent : region.type === 'data' ? colors.cyan : colors.textTertiary }]} />
                    <Text style={styles.memAddr}>{region.address}</Text>
                  </View>
                  <View style={styles.memRight}>
                    <Text style={styles.memType}>{region.type}</Text>
                    <Text style={styles.memSize}>{region.size}</Text>
                    {region.cloaked && <Text style={styles.memCloaked}>CLOAKED</Text>}
                  </View>
                </View>
              ))}
            </Panel>
          </View>
        )}

        {rounds.length > 0 && (
          <View style={styles.sectionSpacing}>
            <Panel title="Adversarial Rounds">
              {rounds.map((r) => (
                <View key={r.round} style={styles.roundRow}>
                  <Text style={styles.roundNum}>R{r.round}</Text>
                  <View style={styles.roundBar}>
                    <View style={styles.roundBarRow}>
                      <Text style={styles.roundLabel}>ATK</Text>
                      <View style={styles.roundBarTrack}>
                        <View style={[styles.roundBarFill, { width: `${r.attackerScore}%`, backgroundColor: colors.danger }]} />
                      </View>
                      <Text style={styles.roundScore}>{r.attackerScore}</Text>
                    </View>
                    <View style={styles.roundBarRow}>
                      <Text style={styles.roundLabel}>DEF</Text>
                      <View style={styles.roundBarTrack}>
                        <View style={[styles.roundBarFill, { width: `${r.defenderScore}%`, backgroundColor: colors.accent }]} />
                      </View>
                      <Text style={styles.roundScore}>{r.defenderScore}</Text>
                    </View>
                  </View>
                  <Text style={[styles.roundOutcome, { color: r.outcome === 'attacker' ? colors.danger : r.outcome === 'defender' ? colors.accent : colors.textTertiary }]}>
                    {r.outcome === 'attacker' ? 'ATK' : r.outcome === 'defender' ? 'DEF' : 'DRAW'}
                  </Text>
                </View>
              ))}
            </Panel>
          </View>
        )}

        {generations.length > 0 && (
          <View style={styles.sectionSpacing}>
            <Panel title="Generational Evolution">
              {generations.map((g) => (
                <View key={g.generation} style={styles.genRow}>
                  <Text style={styles.genNum}>G{g.generation}</Text>
                  <View style={styles.genInfo}>
                    <RiskMeter value={g.fitness} size="sm" showValue={false} />
                    <Text style={styles.genFit}>{(g.fitness * 100).toFixed(0)}%</Text>
                  </View>
                  <Text style={styles.genPatch}>{g.bestPatch}</Text>
                </View>
              ))}
            </Panel>
          </View>
        )}

        {forecasts.length > 0 && (
          <View style={styles.sectionSpacing}>
            <Panel title="Ban Wave Forecast (12h)">
              {forecasts.slice(0, 6).map((f, i) => (
                <View key={i} style={styles.forecastRow}>
                  <Text style={styles.forecastTime}>+{i + 1}h</Text>
                  <View style={styles.forecastBar}>
                    <View style={styles.forecastTrack}>
                      <View style={[styles.forecastFill, { width: `${f.probability * 100}%`, backgroundColor: f.probability > 0.4 ? colors.danger : colors.warning }]} />
                    </View>
                  </View>
                  <Text style={[styles.forecastPct, { color: f.probability > 0.4 ? colors.danger : colors.warning }]}>
                    {(f.probability * 100).toFixed(0)}%
                  </Text>
                </View>
              ))}
            </Panel>
          </View>
        )}

        {latency.length > 0 && (
          <View style={styles.sectionSpacing}>
            <Panel title="Latency Optimization">
              {latency.slice(0, 8).map((l, i) => (
                <View key={i} style={styles.latencyRow}>
                  <Text style={styles.latencyIdx}>{String(i + 1).padStart(2, '0')}</Text>
                  <Text style={styles.latencyVal}>{l.latency.toFixed(0)}ms</Text>
                  <Text style={styles.latencyJitter}>±{l.jitter.toFixed(0)}ms</Text>
                </View>
              ))}
            </Panel>
          </View>
        )}

        {meshNodes.length > 0 && (
          <View style={styles.sectionSpacing}>
            <Panel title="Mesh Nodes">
              {meshNodes.map((n) => (
                <View key={n.id} style={styles.nodeRow}>
                  <View style={[styles.nodeDot, { backgroundColor: n.status === 'online' ? colors.accent : n.status === 'degraded' ? colors.warning : colors.danger }]} />
                  <Text style={styles.nodeName}>{n.name}</Text>
                  <Text style={styles.nodeRegion}>{n.region}</Text>
                  <Text style={styles.nodeLoad}>{(n.load * 100).toFixed(0)}%</Text>
                </View>
              ))}
            </Panel>
          </View>
        )}

        {feature.id === 'kernel-bridge' && (
          <View style={styles.sectionSpacing}>
            <Panel title="Conceptual Architecture">
              <CodeBlock
                label="kernel_bridge (abstract)"
                lines={[
                  '// CONCEPTUAL INTERFACE ONLY',
                  '// No real kernel code is executed',
                  '',
                  'interface KernelBridge {',
                  '  // Would conceptually provide:',
                  '  hook_syscall(id: u64): Result',
                  '  hide_process(pid: u32): void',
                  '  cloak_memory(addr: ptr): void',
                  '  // All methods are SIMULATED',
                  '}',
                ]}
                highlightLines={[1, 2]}
              />
            </Panel>
          </View>
        )}

        {feature.id === 'social-eng' && (
          <View style={styles.sectionSpacing}>
            <Panel title="Training Scenarios">
              {[
                { title: 'Phishing Awareness Drill', desc: 'Identify red flags in simulated phishing emails.', diff: 'Beginner' },
                { title: 'Pretext Calling Scenario', desc: 'Understand trust-building via fabricated scenarios.', diff: 'Intermediate' },
                { title: 'Baiting Attack Walkthrough', desc: 'Learn how curiosity-based attacks lure targets.', diff: 'Beginner' },
              ].map((s, i) => (
                <View key={i} style={styles.scenarioRow}>
                  <View style={styles.scenarioInfo}>
                    <Text style={styles.scenarioTitle}>{s.title}</Text>
                    <Text style={styles.scenarioDesc}>{s.desc}</Text>
                  </View>
                  <View style={[styles.scenarioBadge, { backgroundColor: s.diff === 'Beginner' ? colors.accentGlow : colors.warningGlow }]}>
                    <Text style={[styles.scenarioBadgeText, { color: s.diff === 'Beginner' ? colors.accent : colors.warning }]}>
                      {s.diff.toUpperCase()}
                    </Text>
                  </View>
                </View>
              ))}
            </Panel>
          </View>
        )}

        <View style={styles.sectionSpacing} />
        <Panel title="Module Info">
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>ID</Text>
            <Text style={styles.infoValue}>{feature.id}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Index</Text>
            <Text style={styles.infoValue}>{String(feature.index).padStart(2, '0')} / 23</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Category</Text>
            <Text style={styles.infoValue}>{feature.category}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Risk Level</Text>
            <Text style={[styles.infoValue, { color: feature.riskLevel === 'critical' ? colors.danger : feature.riskLevel === 'high' ? colors.warning : colors.accent }]}>
              {feature.riskLevel.toUpperCase()}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Simulated</Text>
            <Text style={styles.infoValue}>{feature.isSimulated ? 'Yes' : 'No'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Educational</Text>
            <Text style={styles.infoValue}>{feature.isEducational ? 'Yes' : 'No'}</Text>
          </View>
        </Panel>

        <View style={styles.sectionSpacing} />
        <Panel title="Activity Log" noPadding>
          {logs.map((log) => <LogLine key={log.id} entry={log} />)}
        </Panel>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xl },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'Inter-Regular', fontSize: 14, color: colors.textTertiary },
  header: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  headerIcon: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.surfaceElevated, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flex: 1 },
  headerName: { fontFamily: 'Inter-Bold', fontSize: 18, color: colors.textPrimary, letterSpacing: -0.3 },
  headerDesc: { fontFamily: 'Inter-Regular', fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  headerTags: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  tagText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 8, letterSpacing: 0.5 },
  sectionSpacing: { height: spacing.md },
  controlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  controlInfo: { flex: 1 },
  controlLabel: { fontFamily: 'Inter-Bold', fontSize: 14, color: colors.textPrimary },
  controlDesc: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  metricsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  dataRowBorder: { borderBottomWidth: 1 },
  dataHash: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.accent, flex: 1 },
  dataRight: { flexDirection: 'row', gap: spacing.sm },
  dataEntropy: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.cyan },
  dataDet: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.warning },
  memLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  memDot: { width: 8, height: 8, borderRadius: 4 },
  memAddr: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textPrimary },
  memRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  memType: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.cyan, textTransform: 'uppercase' },
  memSize: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary },
  memCloaked: { fontFamily: 'JetBrainsMono-Bold', fontSize: 8, color: colors.purple, letterSpacing: 0.5 },
  roundRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  roundNum: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.textTertiary, minWidth: 28 },
  roundBar: { flex: 1, gap: 4 },
  roundBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roundLabel: { fontFamily: 'JetBrainsMono-Bold', fontSize: 9, color: colors.textTertiary, minWidth: 28 },
  roundBarTrack: { flex: 1, height: 4, backgroundColor: colors.surfaceElevated, borderRadius: 2, overflow: 'hidden' },
  roundBarFill: { height: 4, borderRadius: 2 },
  roundScore: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.textPrimary, minWidth: 28, textAlign: 'right' },
  roundOutcome: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, minWidth: 36, textAlign: 'right' },
  genRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  genNum: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.textTertiary, minWidth: 32 },
  genInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 100 },
  genFit: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.accent, minWidth: 32 },
  genPatch: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.cyan, flex: 1, textAlign: 'right' },
  forecastRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  forecastTime: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.textTertiary, minWidth: 32 },
  forecastBar: { flex: 1 },
  forecastTrack: { height: 4, backgroundColor: colors.surfaceElevated, borderRadius: 2, overflow: 'hidden' },
  forecastFill: { height: 4, borderRadius: 2 },
  forecastPct: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, minWidth: 36, textAlign: 'right' },
  latencyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  latencyIdx: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.textTertiary, minWidth: 24 },
  latencyVal: { fontFamily: 'JetBrainsMono-Bold', fontSize: 12, color: colors.accent },
  latencyJitter: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.warning, flex: 1, textAlign: 'right' },
  nodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  nodeDot: { width: 8, height: 8, borderRadius: 4 },
  nodeName: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textPrimary, flex: 1 },
  nodeRegion: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary },
  nodeLoad: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.accent, minWidth: 36, textAlign: 'right' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { fontFamily: 'JetBrainsMono-Regular', fontSize: 12, color: colors.textTertiary },
  infoValue: { fontFamily: 'JetBrainsMono-Bold', fontSize: 12, color: colors.textPrimary },
  scenarioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  scenarioInfo: { flex: 1 },
  scenarioTitle: { fontFamily: 'Inter-Bold', fontSize: 13, color: colors.textPrimary },
  scenarioDesc: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  scenarioBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.sm },
  scenarioBadgeText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 8, letterSpacing: 0.5 },
});