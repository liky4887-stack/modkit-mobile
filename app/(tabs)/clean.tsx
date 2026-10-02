import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { TopBar, Panel, RiskMeter, StatusBadge, WarningBanner, CodeBlock } from '@/components';
import { useRouter } from 'expo-router';
import { ShieldCheck, Check } from 'lucide-react-native';
import type { CleaningResult, CleaningProfile } from '@/types';
import { genCleaningResult, genCleaningProfiles } from '@/utils/mockData';

type Phase = 'select' | 'scanning' | 'results';

export default function CleanScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('select');
  const [profiles] = useState<CleaningProfile[]>(() => genCleaningProfiles(4));
  const [selectedProfile, setSelectedProfile] = useState<CleaningProfile | null>(null);
  const [result, setResult] = useState<CleaningResult | null>(null);
  const [scanProgress, setScanProgress] = useState(0);

  const handleScan = (profile: CleaningProfile) => {
    setSelectedProfile(profile);
    setPhase('scanning');
    setScanProgress(0);

    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setResult(genCleaningResult());
          setPhase('results');
          return 100;
        }
        return prev + 10;
      });
    }, 150);
  };

  const handleReset = () => {
    setPhase('select');
    setSelectedProfile(null);
    setResult(null);
    setScanProgress(0);
  };

  const detectedIssues = result?.issues.filter((i) => i.detected) ?? [];
  const highSeverity = detectedIssues.filter((i) => i.severity === 'high').length;
  const mediumSeverity = detectedIssues.filter((i) => i.severity === 'medium').length;
  const lowSeverity = detectedIssues.filter((i) => i.severity === 'low').length;

  return (
    <View style={styles.container}>
      <TopBar
        title="CLEANING WORKFLOW"
        subtitle={phase === 'select' ? 'select modified app' : phase === 'scanning' ? 'analyzing...' : 'results'}
        onLeftPress={() => (phase === 'select' ? router.back() : handleReset())}
        showBack
        statusColor={phase === 'results' ? colors.accent : colors.cyan}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <WarningBanner message="Conceptual pipeline for analyzing already-modified apps. All detection and cleaning is simulated on mock data." type="educational" />

        {phase === 'select' && (
          <View style={styles.section}>
            <Text style={styles.phaseTitle}>Analyze Modified App</Text>
            <Text style={styles.phaseDesc}>Select a profile representing a modified app to scan for anti-cheat triggers.</Text>
            <View style={styles.sectionSpacing} />
            {profiles.map((profile) => (
              <TouchableOpacity
                key={profile.id}
                style={styles.profileCard}
                activeOpacity={0.7}
                onPress={() => handleScan(profile)}
              >
                <View style={styles.profileLeft}>
                  <View style={styles.profileIconWrap}>
                    <ShieldCheck size={18} color={colors.cyan} strokeWidth={2} />
                  </View>
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>{profile.name}</Text>
                    <Text style={styles.profileMeta}>{profile.packageName} · v{profile.version}</Text>
                  </View>
                </View>
                <View style={styles.profileRight}>
                  <RiskMeter value={profile.riskScore} size="sm" showValue={false} style={styles.profileMeter} />
                  <Text style={[styles.profileRisk, { color: profile.riskScore > 0.6 ? colors.danger : colors.warning }]}>
                    {(profile.riskScore * 100).toFixed(0)}%
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {phase === 'scanning' && (
          <View style={styles.section}>
            <Text style={styles.phaseTitle}>Scanning {selectedProfile?.name ?? ''}</Text>
            <Text style={styles.phaseDesc}>Running conceptual detection pipeline...</Text>
            <View style={styles.sectionSpacing} />
            <Panel>
              <View style={styles.scanProgressWrap}>
                <View style={styles.scanTrack}>
                  <View style={[styles.scanFill, { width: `${scanProgress}%` }]} />
                </View>
                <Text style={styles.scanPct}>{scanProgress}%</Text>
              </View>
              <View style={styles.scanSteps}>
                {['Signature scan', 'Pattern detection', 'Behavioral analysis', 'Risk assessment'].map((s, i) => {
                  const done = scanProgress > (i + 1) * 25;
                  const active = scanProgress >= i * 25 && scanProgress < (i + 1) * 25;
                  return (
                    <View key={i} style={styles.scanStepRow}>
                      <View style={[styles.scanStepDot, done && styles.scanStepDone, active && styles.scanStepActive]} />
                      <Text style={[styles.scanStepText, done && styles.scanStepTextDone]}>{s}</Text>
                      {done && <Check size={12} color={colors.accent} strokeWidth={2} />}
                    </View>
                  );
                })}
              </View>
            </Panel>
          </View>
        )}

        {phase === 'results' && result && (
          <View style={styles.section}>
            <Text style={styles.phaseTitle}>Cleaning Results</Text>
            <Text style={styles.phaseDesc}>{detectedIssues.length} issues detected in {result.profile.name}</Text>

            <View style={styles.sectionSpacing} />
            <View style={styles.severityRow}>
              <View style={styles.severityCell}>
                <StatusBadge label={`${highSeverity} HIGH`} color={colors.danger} />
              </View>
              <View style={styles.severityCell}>
                <StatusBadge label={`${mediumSeverity} MED`} color={colors.warning} />
              </View>
              <View style={styles.severityCell}>
                <StatusBadge label={`${lowSeverity} LOW`} color={colors.info} />
              </View>
            </View>

            <View style={styles.sectionSpacing} />
            <Panel title="Detected Issues" noPadding>
              {result.issues.map((issue) => (
                <View key={issue.id} style={styles.issueRow}>
                  <View style={styles.issueDotWrap}>
                    <View style={[styles.issueDot, { backgroundColor: issue.severity === 'high' ? colors.danger : issue.severity === 'medium' ? colors.warning : colors.info }]} />
                  </View>
                  <View style={styles.issueBody}>
                    <Text style={[styles.issueLabel, !issue.detected && styles.issueLabelMuted]}>{issue.label}</Text>
                    <Text style={styles.issueDetail}>{issue.detail}</Text>
                  </View>
                  <StatusBadge label={issue.detected ? 'FOUND' : 'CLEAR'} color={issue.detected ? colors.danger : colors.accent} />
                </View>
              ))}
            </Panel>

            <View style={styles.sectionSpacing} />
            <Panel title="Remediation Preview">
              <CodeBlock
                language="diff"
                code={'- checkIntegrity()\n+ return true; // simulated clean\n- debugTracer.enable()\n+ // tracer removed'}
              />
            </Panel>

            <View style={styles.sectionSpacing} />
            <TouchableOpacity style={styles.resetBtn} activeOpacity={0.7} onPress={handleReset}>
              <Text style={styles.resetText}>SCAN ANOTHER PROFILE</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xl },
  section: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  sectionSpacing: { height: spacing.md },
  phaseTitle: { fontFamily: 'JetBrainsMono-Bold', fontSize: 14, color: colors.textPrimary, letterSpacing: 0.5, textTransform: 'uppercase' },
  phaseDesc: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  profileCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  profileLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  profileIconWrap: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  profileInfo: { flex: 1 },
  profileName: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: colors.textPrimary },
  profileMeta: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary, marginTop: 2 },
  profileRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  profileMeter: { width: 60 },
  profileRisk: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11 },
  scanProgressWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scanTrack: { flex: 1, height: 6, backgroundColor: colors.surfaceAlt, borderRadius: 3, overflow: 'hidden' },
  scanFill: { height: '100%', backgroundColor: colors.accent },
  scanPct: { fontFamily: 'JetBrainsMono-Bold', fontSize: 12, color: colors.accent, minWidth: 36, textAlign: 'right' },
  scanSteps: { marginTop: spacing.md, gap: spacing.sm },
  scanStepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scanStepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  scanStepDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  scanStepActive: { backgroundColor: colors.warning, borderColor: colors.warning },
  scanStepText: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textTertiary },
  scanStepTextDone: { color: colors.textPrimary },
  severityRow: { flexDirection: 'row', gap: spacing.sm },
  severityCell: { flex: 1 },
  issueRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  issueDotWrap: { width: 12, alignItems: 'center' },
  issueDot: { width: 8, height: 8, borderRadius: 4 },
  issueBody: { flex: 1 },
  issueLabel: { fontFamily: 'Inter-Medium', fontSize: 12, color: colors.textPrimary },
  issueLabelMuted: { color: colors.textTertiary, textDecorationLine: 'line-through' },
  issueDetail: { fontFamily: 'Inter-Regular', fontSize: 10, color: colors.textTertiary, marginTop: 2 },
  resetBtn: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent, paddingVertical: spacing.md, alignItems: 'center' },
  resetText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.accent, letterSpacing: 0.5 },
});
