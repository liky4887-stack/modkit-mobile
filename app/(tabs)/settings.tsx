import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { TopBar, Panel, Toggle, SectionHeader, WarningBanner, StatusBadge } from '@/components';
import { useAppStore } from '@/store/useAppStore';
import { features } from '@/features/registry';
import { useRouter } from 'expo-router';
import { ChevronRight, ShieldAlert, Github, FileText, Trash2 } from 'lucide-react-native';

export default function SettingsScreen() {
  const router = useRouter();
  const { featureStates, toggleFeature, clearLogs } = useAppStore();

  const activeCount = Object.values(featureStates).filter((s) => s.enabled).length;
  const criticalFeatures = features.filter((f) => f.riskLevel === 'critical');

  return (
    <View style={styles.container}>
      <TopBar title="CONFIG" subtitle="system settings" statusColor={colors.accent} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <WarningBanner
          message="This app is a simulation and educational tool. All modules operate on mock data. No real exploits, kernel code, or anti-tamper bypass is performed."
          type="educational"
        />

        <View style={styles.sectionSpacing} />
        <SectionHeader title="System Status" />
        <View style={styles.panelWrap}>
          <Panel>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Active Modules</Text>
              <Text style={styles.statusValue}>{activeCount} / {features.length}</Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Total Features</Text>
              <Text style={styles.statusValue}>{features.length}</Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Simulated</Text>
              <Text style={styles.statusValue}>{features.filter((f) => f.isSimulated).length}</Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Educational</Text>
              <Text style={styles.statusValue}>{features.filter((f) => f.isEducational).length}</Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Critical Risk</Text>
              <Text style={[styles.statusValue, { color: colors.danger }]}>{criticalFeatures.length}</Text>
            </View>
          </Panel>
        </View>

        <View style={styles.sectionSpacing} />
        <SectionHeader title="Quick Toggles" subtitle="enable/disable modules" />
        <View style={styles.panelWrap}>
          <Panel noPadding>
            {features.slice(0, 10).map((f, i) => (
              <View key={f.id} style={[styles.toggleRow, i < 9 && styles.toggleRowBorder]}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleName}>{f.shortName}</Text>
                  <Text style={styles.toggleCategory}>{f.category}</Text>
                </View>
                <Toggle
                  value={featureStates[f.id]?.enabled ?? false}
                  onToggle={() => toggleFeature(f.id)}
                  disabled={f.status === 'disabled' && f.riskLevel === 'critical'}
                />
              </View>
            ))}
          </Panel>
        </View>

        <View style={styles.sectionSpacing} />
        <SectionHeader title="Data Management" />
        <View style={styles.panelWrap}>
          <Panel noPadding>
            <TouchableOpacity style={styles.dataRow} activeOpacity={0.7} onPress={clearLogs}>
              <View style={styles.dataLeft}>
                <Trash2 size={16} color={colors.warning} strokeWidth={2} />
                <Text style={styles.dataLabel}>Clear All Logs</Text>
              </View>
              <ChevronRight size={16} color={colors.textTertiary} strokeWidth={2} />
            </TouchableOpacity>
          </Panel>
        </View>

        <View style={styles.sectionSpacing} />
        <SectionHeader title="About" />
        <View style={styles.panelWrap}>
          <Panel>
            <View style={styles.aboutRow}>
              <ShieldAlert size={16} color={colors.accent} strokeWidth={2} />
              <View style={styles.aboutInfo}>
                <Text style={styles.aboutTitle}>Safety Notice</Text>
                <Text style={styles.aboutDesc}>All features are simulated or educational. No real binary modification, kernel access, or anti-tamper bypass is performed.</Text>
              </View>
            </View>
            <View style={[styles.aboutRow, styles.aboutRowBorder]}>
              <FileText size={16} color={colors.cyan} strokeWidth={2} />
              <View style={styles.aboutInfo}>
                <Text style={styles.aboutTitle}>Architecture</Text>
                <Text style={styles.aboutDesc}>Clean architecture with Zustand state, mock data services, and typed interfaces for all 52 feature modules.</Text>
              </View>
            </View>
            <View style={[styles.aboutRow, styles.aboutRowBorder]}>
              <Github size={16} color={colors.purple} strokeWidth={2} />
              <View style={styles.aboutInfo}>
                <Text style={styles.aboutTitle}>Source</Text>
                <Text style={styles.aboutDesc}>Built with Expo SDK 54, React Native, TypeScript, and Reanimated.</Text>
              </View>
            </View>
          </Panel>
        </View>

        <View style={styles.sectionSpacing} />
        <SectionHeader title="Critical Modules" subtitle="high risk - review required" />
        <View style={styles.panelWrap}>
          <Panel noPadding>
            {criticalFeatures.map((f, i) => (
              <TouchableOpacity
                key={f.id}
                style={[styles.critRow, i < criticalFeatures.length - 1 && styles.toggleRowBorder]}
                activeOpacity={0.7}
                onPress={() => router.push(`/feature/${f.id}` as never)}
              >
                <View style={styles.critInfo}>
                  <Text style={styles.critName}>{f.name}</Text>
                  <Text style={styles.critDesc}>{f.description}</Text>
                </View>
                <StatusBadge status={featureStates[f.id]?.status ?? 'disabled'} size="sm" />
                <ChevronRight size={16} color={colors.textTertiary} strokeWidth={2} />
              </TouchableOpacity>
            ))}
          </Panel>
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xl },
  sectionSpacing: { height: spacing.md },
  panelWrap: { marginTop: spacing.sm },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  statusLabel: { fontFamily: 'Inter-Regular', fontSize: 13, color: colors.textSecondary },
  statusValue: { fontFamily: 'JetBrainsMono-Bold', fontSize: 13, color: colors.textPrimary },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: spacing.md },
  toggleRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  toggleInfo: { flex: 1 },
  toggleName: { fontFamily: 'Inter-Bold', fontSize: 13, color: colors.textPrimary },
  toggleCategory: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary, marginTop: 2, textTransform: 'uppercase' },
  dataRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: spacing.md },
  dataLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dataLabel: { fontFamily: 'Inter-Regular', fontSize: 14, color: colors.textPrimary },
  aboutRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 10 },
  aboutRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  aboutInfo: { flex: 1 },
  aboutTitle: { fontFamily: 'Inter-Bold', fontSize: 13, color: colors.textPrimary },
  aboutDesc: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  critRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12, paddingHorizontal: spacing.md },
  critInfo: { flex: 1 },
  critName: { fontFamily: 'Inter-Bold', fontSize: 13, color: colors.textPrimary },
  critDesc: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.textTertiary, marginTop: 2 },
});
