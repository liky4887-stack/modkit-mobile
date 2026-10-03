import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { TopBar, Panel, Toggle, StatCard, LogLine } from '@/components';
import { FeatureIcon } from '@/components/FeatureIcon';
import { getFeatureById } from '@/features/registry';
import { useAppStore } from '@/store/useAppStore';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function FeatureDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const safeId = typeof id === 'string' && /^[a-z0-9-]{1,64}$/.test(id) ? id : null;
  const feature = safeId ? getFeatureById(safeId) : undefined;
  const { featureStates, toggleFeature, addLog, logs } = useAppStore();

  const [aggression, setAggression] = React.useState(0.5);
  const [reactionTime, setReactionTime] = React.useState(300);
  const [randomness, setRandomness] = React.useState(0.3);
  const [sessionLength, setSessionLength] = React.useState(120);

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
  const featureLogs = logs.filter((l) => l.source === feature.id);

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

        <View style={styles.sectionSpacing} />
        <Panel title="Module Control">
          <View style={styles.controlRow}>
            <View style={styles.controlInfo}>
              <Text style={styles.controlLabel}>Enable Module</Text>
              <Text style={styles.controlDesc}>Toggle to activate this module</Text>
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

                                <View style={styles.sectionSpacing} />
        <Panel title="Module Info">
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>ID</Text>
            <Text style={styles.infoValue}>{feature.id}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Index</Text>
            <Text style={styles.infoValue}>{String(feature.index).padStart(2, '0')}</Text>
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
          <View style={[styles.infoRow, styles.infoRowLast]}>
            <Text style={styles.infoLabel}>Educational</Text>
            <Text style={styles.infoValue}>{feature.isEducational ? 'Yes' : 'No'}</Text>
          </View>
        </Panel>

        <View style={styles.sectionSpacing} />
        <Panel title="Activity Log" noPadding>
          {featureLogs.length === 0 ? (
            <View style={styles.emptyLog}>
              <Text style={styles.emptyText}>No activity for this module yet.</Text>
            </View>
          ) : (
            featureLogs.slice(0, 30).map((log) => <LogLine key={log.id} entry={log} />)
          )}
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
  emptyText: { fontFamily: 'Inter-Regular', fontSize: 13, color: colors.textTertiary, textAlign: 'center', padding: spacing.md },
  emptyLog: { padding: spacing.lg, alignItems: 'center' },
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
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { fontFamily: 'JetBrainsMono-Regular', fontSize: 12, color: colors.textTertiary },
  infoValue: { fontFamily: 'JetBrainsMono-Bold', fontSize: 12, color: colors.textPrimary },
  scenarioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  scenarioInfo: { flex: 1 },
  scenarioTitle: { fontFamily: 'Inter-Bold', fontSize: 13, color: colors.textPrimary },
  scenarioDesc: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  scenarioBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.sm },
  scenarioBadgeText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 8, letterSpacing: 0.5 },
});
