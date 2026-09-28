import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { TopBar, Panel, RiskMeter, StatusBadge, WarningBanner, CodeBlock } from '@/components';
import { useRouter } from 'expo-router';
import { ChevronLeft, ShieldCheck, Check, RefreshCw } from 'lucide-react-native';
import type { CleaningResult, CleaningProfile } from '@/types';
import { genCleaningResult } from '@/utils/mockData';

function genCleaningProfiles(count: number): CleaningProfile[] {
  return Array.from({ length: count }, () => {
    const r = genCleaningResult();
    return r.profile;
  });
}

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
            <View style={styles.severityGrid}>
              <View style={[styles.severityCard, { borderColor: colors.danger + '30' }]}>
                <Text style={[styles.severityNum, { color: colors.danger }]}>{highSeverity}</Text>
                <Text style={styles.severityLabel}>HIGH</Text>
              </View>
              <View style={[styles.severityCard, { borderColor: colors.warning + '30' }]}>
                <Text style={[styles.severityNum, { color: colors.warning }]}>{mediumSeverity}</Text>
                <Text style={styles.severityLabel}>MEDIUM</Text>
              </View>
              <View style={[styles.severityCard, { borderColor: colors.accent + '30' }]}>
                <Text style={[styles.severityNum, { color: colors.accent }]}>{lowSeverity}</Text>
                <Text style={styles.severityLabel}>LOW</Text>
              </View>
            </View>

            <View style={styles.sectionSpacing} />
            <Panel title="Risk Prediction">
              <RiskMeter label="Post-Clean Detection Risk" value={result.riskPrediction} size="lg" />
            </Panel>

            <View style={styles.sectionSpacing} />
            <Panel title="Detected Issues">
              {result.issues.map((issue) => (
                <View key={issue.id} style={[styles.issueRow, !issue.detected && styles.issueRowDim]}>
                  <View style={styles.issueLeft}>
                    <View style={[styles.issueDot, { backgroundColor: issue.severity === 'high' ? colors.danger : issue.severity === 'medium' ? colors.warning : colors.accent }]} />
                    <View style={styles.issueInfo}>
                      <Text style={styles.issueName}>{issue.name}</Text>
                      <Text style={styles.issueDesc}>{issue.description}</Text>
                      <Text style={styles.issueRec}>→ {issue.recommendation}</Text>
                    </View>
                  </View>
                  {issue.detected ? (
                    <StatusBadge status={issue.severity === 'high' ? 'disabled' : issue.severity === 'medium' ? 'warning' : 'active'} label={issue.severity.toUpperCase()} size="sm" />
                  ) : (
                    <Text style={styles.issueClean}>CLEAN</Text>
                  )}
                </View>
              ))}
            </Panel>

            <View style={styles.sectionSpacing} />
            <Panel title="Clean Configuration">
              <CodeBlock
                label="clean_config.json"
                lines={Object.entries(result.cleanConfig).map(([k, v]) => `  "${k}": ${typeof v === 'string' ? `"${v}"` : v},`)}
              />
            </Panel>

            <View style={styles.sectionSpacing} />
            <Panel title="Recommended Actions">
              {result.recommendedActions.map((action, i) => (
                <View key={i} style={styles.actionRow}>
                  <Text style={styles.actionNum}>{String(i + 1).padStart(2, '0')}</Text>
                  <Text style={styles.actionText}>{action}</Text>
                </View>
              ))}
            </Panel>

            <View style={styles.sectionSpacing} />
            <TouchableOpacity style={styles.rescanBtn} activeOpacity={0.7} onPress={handleReset}>
              <RefreshCw size={16} color={colors.accent} strokeWidth={2} />
              <Text style={styles.rescanBtnText}>Scan Another Profile</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md },
  section: { marginTop: spacing.sm },
  sectionSpacing: { height: spacing.md },
  phaseTitle: { fontFamily: 'Inter-Bold', fontSize: 18, color: colors.textPrimary, letterSpacing: -0.3 },
  phaseDesc: { fontFamily: 'Inter-Regular', fontSize: 13, color: colors.textTertiary, marginTop: 4 },
  profileCard: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  profileLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm + 2, flex: 1 },
  profileIconWrap: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  profileInfo: { flex: 1 },
  profileName: { fontFamily: 'Inter-Bold', fontSize: 14, color: colors.textPrimary },
  profileMeta: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  profileRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, width: 100 },
  profileMeter: { flex: 1 },
  profileRisk: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, minWidth: 32, textAlign: 'right' as const },
  scanProgressWrap: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  scanTrack: { flex: 1, height: 6, backgroundColor: colors.surfaceElevated, borderRadius: 3, overflow: 'hidden' as const },
  scanFill: { height: 6, backgroundColor: colors.accent, borderRadius: 3 },
  scanPct: { fontFamily: 'JetBrainsMono-Bold', fontSize: 14, color: colors.accent, minWidth: 40, textAlign: 'right' as const },
  scanSteps: { marginTop: spacing.md, gap: 10 },
  scanStepRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  scanStepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceHover, borderWidth: 1, borderColor: colors.borderBright },
  scanStepDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  scanStepActive: { backgroundColor: colors.accentGlow, borderColor: colors.accent },
  scanStepText: { fontFamily: 'JetBrainsMono-Regular', fontSize: 12, color: colors.textTertiary, flex: 1 },
  scanStepTextDone: { color: colors.textPrimary },
  severityGrid: { flexDirection: 'row' as const, gap: spacing.sm },
  severityCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, padding: spacing.md, alignItems: 'center' as const },
  severityNum: { fontFamily: 'JetBrainsMono-Bold', fontSize: 24, letterSpacing: -1 },
  severityLabel: { fontFamily: 'JetBrainsMono-Bold', fontSize: 9, color: colors.textTertiary, letterSpacing: 1, marginTop: 4 },
  issueRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-start' as const, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  issueRowDim: { opacity: 0.4 },
  issueLeft: { flexDirection: 'row' as const, gap: spacing.sm, flex: 1 },
  issueDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  issueInfo: { flex: 1 },
  issueName: { fontFamily: 'Inter-Bold', fontSize: 13, color: colors.textPrimary },
  issueDesc: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  issueRec: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.accent, marginTop: 4 },
  issueClean: { fontFamily: 'JetBrainsMono-Bold', fontSize: 9, color: colors.accent, letterSpacing: 0.5 },
  actionRow: { flexDirection: 'row' as const, gap: spacing.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  actionNum: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.textTertiary, minWidth: 24 },
  actionText: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textPrimary, flex: 1, lineHeight: 18 },
  rescanBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.accentGlow, borderWidth: 1, borderColor: colors.accent },
  rescanBtnText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 13, color: colors.accent },
});