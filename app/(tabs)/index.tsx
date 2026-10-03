import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { TopBar, Panel, StatCard, LogLine, RiskMeter, SectionHeader, SovereignLink } from '@/components';
import { useAppStore } from '@/store/useAppStore';
import { features } from '@/features/registry';
import { FeatureIcon } from '@/components/FeatureIcon';
import { useRouter } from 'expo-router';
import { Plus, Activity, ShieldCheck, AlertTriangle, ChevronRight } from 'lucide-react-native';

export default function ConsoleScreen() {
  const router = useRouter();
  const { logs, featureStates, addLog, clearLogs } = useAppStore();

  const activeCount = Object.values(featureStates).filter((s) => s.enabled).length;
  const warningCount = Object.values(featureStates).filter((s) => s.status === 'warning').length;
  const avgRisk = Object.values(featureStates).reduce((acc, s) => acc + (s.metrics.riskScore ?? 0), 0) / features.length;

  const handleAddLog = useCallback(() => {
    addLog({
      id: `${Date.now()}`,
      timestamp: Date.now(),
      level: 'info',
      source: 'console',
      message: 'Manual log entry',
    });
  }, [addLog]);

  const quickFeatures = features.slice(0, 6);

  return (
    <View style={styles.container}>
      <TopBar
        title="CONSOLE"
        subtitle="system overview"
        rightIcon={Plus}
        onRightPress={handleAddLog}
        statusColor={colors.accent}
      />

      <SovereignLink />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.statsGrid}>
          <StatCard label="Active Modules" value={activeCount} unit={`/${features.length}`} color={colors.accent} trend="up" />
          <StatCard label="Warnings" value={warningCount} color={warningCount > 0 ? colors.warning : colors.accent} trend={warningCount > 0 ? 'up' : 'flat'} />
          <StatCard label="Avg Risk" value={`${(avgRisk * 100).toFixed(0)}`} unit="%" color={avgRisk > 0.4 ? colors.danger : colors.accent} trend="down" />
        </View>

        <View style={styles.statsGrid}>
          <StatCard label="Events" value={Object.values(featureStates).reduce((acc, s) => acc + (s.metrics.events ?? 0), 0)} color={colors.cyan} />
          <StatCard label="Uptime" value={`${Math.floor(Object.values(featureStates).reduce((acc, s) => acc + (s.metrics.uptime ?? 0), 0) / features.length / 3600)}h`} color={colors.info} />
          <StatCard label="Logs" value={logs.length} color={colors.textSecondary} />
        </View>

        <View style={styles.sectionSpacing} />
        <SectionHeader title="Quick Access" subtitle="tap to configure" />
        <View style={styles.quickGrid}>
          {quickFeatures.map((f) => {
            const state = featureStates[f.id];
            return (
              <TouchableOpacity
                key={f.id}
                style={styles.quickCard}
                activeOpacity={0.7}
                onPress={() => router.push(`/feature/${f.id}` as never)}
              >
                <View style={styles.quickIconWrap}>
                  <FeatureIcon name={f.icon} size={18} color={state?.enabled ? colors.accent : colors.textTertiary} />
                </View>
                <Text style={styles.quickName} numberOfLines={1}>{f.shortName}</Text>
                <View style={[styles.quickDot, { backgroundColor: state?.enabled ? colors.accent : colors.textTertiary }]} />
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.sectionSpacing} />
        <SectionHeader title="System Risk" subtitle="aggregate detection probability" />
        <View style={styles.panelWrap}>
          <Panel>
            <RiskMeter label="Overall Detection Risk" value={avgRisk} size="lg" />
            <View style={styles.riskRow}>
              <View style={styles.riskItem}>
                <ShieldCheck size={14} color={colors.accent} strokeWidth={2} />
                <Text style={styles.riskItemText}>Low Risk Zones: {features.filter(f => f.riskLevel === 'low' || f.riskLevel === 'none').length}</Text>
              </View>
              <View style={styles.riskItem}>
                <AlertTriangle size={14} color={colors.warning} strokeWidth={2} />
                <Text style={styles.riskItemText}>Caution: {features.filter(f => f.riskLevel === 'medium').length}</Text>
              </View>
              <View style={styles.riskItem}>
                <AlertTriangle size={14} color={colors.danger} strokeWidth={2} />
                <Text style={styles.riskItemText}>Critical: {features.filter(f => f.riskLevel === 'high' || f.riskLevel === 'critical').length}</Text>
              </View>
            </View>
          </Panel>
        </View>

        <View style={styles.sectionSpacing} />
        <SectionHeader title="Live Log Stream" subtitle={`${logs.length} entries`} actionLabel="CLEAR" onAction={clearLogs} />
        <View style={styles.panelWrap}>
          <Panel noPadding>
            <ScrollView style={styles.logScroll} nestedScrollEnabled>
              {logs.length === 0 ? (
                <View style={styles.logEmpty}>
                  <Text style={styles.logEmptyText}>No logs yet. Tap + to add an entry.</Text>
                </View>
              ) : (
                logs.slice(0, 50).map((log) => <LogLine key={log.id} entry={log} />)
              )}
            </ScrollView>
          </Panel>
        </View>

        <View style={styles.sectionSpacing} />
        <TouchableOpacity style={styles.workflowLink} activeOpacity={0.7} onPress={() => router.push('/(tabs)/patch')}>
          <View style={styles.workflowLinkLeft}>
            <Activity size={18} color={colors.accent} strokeWidth={2} />
            <View>
              <Text style={styles.workflowLinkTitle}>Binary Patch Workflow</Text>
              <Text style={styles.workflowLinkSub}>Upload APK and OBB files</Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textTertiary} strokeWidth={2} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.workflowLink, { marginTop: spacing.sm }]} activeOpacity={0.7} onPress={() => router.push('/(tabs)/clean')}>
          <View style={styles.workflowLinkLeft}>
            <ShieldCheck size={18} color={colors.cyan} strokeWidth={2} />
            <View>
              <Text style={styles.workflowLinkTitle}>Cleaning Workflow</Text>
              <Text style={styles.workflowLinkSub}>Upload a modified app to inspect</Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textTertiary} strokeWidth={2} />
        </TouchableOpacity>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xl },
  statsGrid: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.sm },
  sectionSpacing: { height: spacing.lg },
  quickGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
  quickCard: { width: '31%' as unknown as number, flexGrow: 0, flexBasis: '31%', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm + 2, alignItems: 'center' as const, gap: 6 },
  quickIconWrap: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  quickName: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.textSecondary, letterSpacing: 0.3 },
  quickDot: { width: 5, height: 5, borderRadius: 3 },
  panelWrap: { marginTop: spacing.sm },
  riskRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginTop: spacing.md, gap: spacing.sm },
  riskItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  riskItemText: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textSecondary },
  logScroll: { maxHeight: 220 },
  logEmpty: { padding: spacing.lg, alignItems: 'center' as const },
  logEmptyText: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textTertiary },
  workflowLink: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  workflowLinkLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm + 2 },
  workflowLinkTitle: { fontFamily: 'Inter-Bold', fontSize: 14, color: colors.textPrimary },
  workflowLinkSub: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.textTertiary, marginTop: 2 },
});
