import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { TopBar, Panel, CodeBlock, RiskMeter, StatusBadge, WarningBanner, Chip } from '@/components';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, FileUp, Search, GitBranch, Eye, Download, Check } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { TargetType, PatchTarget, AnalysisResult, PatchDefinition, PatchDiff, ExportSummary } from '@/types';
import { genPatchTargets, genAnalysisResult, genPatchDefinitions, genPatchDiffs, genExportSummary } from '@/utils/mockData';

type Step = 0 | 1 | 2 | 3 | 4;

const STEPS: { label: string; icon: LucideIcon }[] = [
  { label: 'Import', icon: FileUp },
  { label: 'Analysis', icon: Search },
  { label: 'Design', icon: GitBranch },
  { label: 'Preview', icon: Eye },
  { label: 'Export', icon: Download },
];

export default function PatchScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [selectedType, setSelectedType] = useState<TargetType>('APK');
  const [targets] = useState<PatchTarget[]>(() => genPatchTargets(4));
  const [selectedTarget, setSelectedTarget] = useState<PatchTarget | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [patches, setPatches] = useState<PatchDefinition[]>([]);
  const [diffs, setDiffs] = useState<PatchDiff[]>([]);
  const [exportSummary, setExportSummary] = useState<ExportSummary | null>(null);

  const handleNext = () => {
    if (step === 0 && selectedTarget) {
      setAnalysis(genAnalysisResult());
      setPatches(genPatchDefinitions());
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setDiffs(genPatchDiffs(patches));
      setStep(3);
    } else if (step === 3) {
      if (selectedTarget) {
        setExportSummary(genExportSummary(selectedTarget, patches));
      }
      setStep(4);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep((step - 1) as Step);
    else router.back();
  };

  const togglePatch = (id: string) => {
    setPatches((prev) => prev.map((p) => p.id === id ? { ...p, selected: !p.selected } : p));
  };

  const selectedCount = patches.filter((p) => p.selected).length;

  return (
    <View style={styles.container}>
      <TopBar
        title="PATCH WIZARD"
        subtitle={`step ${step + 1} / 5 · ${STEPS[step].label.toLowerCase()}`}
        onLeftPress={handleBack}
        showBack
        statusColor={colors.accent}
      />

      <View style={styles.stepBar}>
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = i < step;
          return (
            <View key={i} style={styles.stepItem}>
              <View style={[styles.stepIcon, isActive && styles.stepIconActive, isDone && styles.stepIconDone]}>
                <Icon size={14} color={isActive ? colors.pureBlack : isDone ? colors.accent : colors.textTertiary} strokeWidth={2} />
              </View>
              <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>{s.label}</Text>
              {i < STEPS.length - 1 && <View style={[styles.stepConnector, isDone && styles.stepConnectorDone]} />}
            </View>
          );
        })}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <WarningBanner message="All patching operations are conceptual simulations on mock data. No real binaries are processed." type="educational" />

        {step === 0 && (
          <View style={styles.section}>
            <Text style={styles.stepTitle}>Select Target Asset</Text>
            <Text style={styles.stepDesc}>Choose a target type to begin the patching workflow.</Text>
            <View style={styles.typeRow}>
              {(['APK', 'IPA', 'OBB'] as TargetType[]).map((t) => (
                <Chip key={t} label={t} selected={selectedType === t} onPress={() => setSelectedType(t)} color={colors.accent} />
              ))}
            </View>
            <View style={styles.sectionSpacing} />
            <Text style={styles.subLabel}>Available Mock Targets</Text>
            {targets.filter((t) => t.type === selectedType).map((target) => (
              <TouchableOpacity
                key={target.id}
                style={[styles.targetCard, selectedTarget?.id === target.id && styles.targetCardSelected]}
                activeOpacity={0.7}
                onPress={() => setSelectedTarget(target)}
              >
                <View style={styles.targetInfo}>
                  <Text style={styles.targetName}>{target.name}</Text>
                  <Text style={styles.targetMeta}>{target.packageId} · v{target.version} · {target.size}</Text>
                </View>
                {selectedTarget?.id === target.id && <Check size={18} color={colors.accent} strokeWidth={2} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {step === 1 && analysis && (
          <View style={styles.section}>
            <Text style={styles.stepTitle}>Static Analysis Results</Text>
            <Text style={styles.stepDesc}>Simulated analysis of {selectedTarget?.name ?? 'target binary'}</Text>

            <View style={styles.sectionSpacing} />
            <Panel title="Risk Score">
              <RiskMeter label="Detection Risk" value={analysis.riskScore} size="lg" />
            </Panel>

            <View style={styles.sectionSpacing} />
            <Panel title="Entry Points">
              {analysis.entryPoints.map((ep, i) => (
                <View key={i} style={styles.entryRow}>
                  <Text style={styles.entryAddr}>{ep}</Text>
                  <Text style={styles.entryLabel}>entry_{i}</Text>
                </View>
              ))}
            </Panel>

            <View style={styles.sectionSpacing} />
            <Panel title="Detection Hotspots">
              {analysis.detectionHotspots.map((hs) => (
                <View key={hs.id} style={styles.hotspotRow}>
                  <View style={styles.hotspotLeft}>
                    <Text style={styles.hotspotAddr}>{hs.address}</Text>
                    <Text style={styles.hotspotType}>{hs.type}</Text>
                  </View>
                  <StatusBadge status={hs.severity === 'high' ? 'disabled' : hs.severity === 'medium' ? 'warning' : 'standby'} label={hs.severity.toUpperCase()} size="sm" />
                </View>
              ))}
            </Panel>

            <View style={styles.sectionSpacing} />
            <Panel title="Structure Map">
              {analysis.structureMap.map((node) => (
                <View key={node.id} style={styles.structRow}>
                  <Text style={styles.structName}>{node.name}</Text>
                  <Text style={styles.structType}>{node.type}</Text>
                  <Text style={styles.structSize}>{node.size}</Text>
                </View>
              ))}
            </Panel>

            <View style={styles.sectionSpacing} />
            <Panel title="Heuristics">
              {analysis.heuristics.map((h) => (
                <View key={h.id} style={styles.heuristicRow}>
                  <Text style={styles.heuristicName}>{h.name}</Text>
                  <View style={styles.heuristicRight}>
                    <RiskMeter value={h.confidence} size="sm" showValue={false} style={styles.heuristicMeter} />
                    <Text style={styles.heuristicConf}>{(h.confidence * 100).toFixed(0)}%</Text>
                  </View>
                </View>
              ))}
            </Panel>
          </View>
        )}

        {step === 2 && (
          <View style={styles.section}>
            <Text style={styles.stepTitle}>Design Patches</Text>
            <Text style={styles.stepDesc}>Select conceptual patches to apply. {selectedCount} selected.</Text>
            <View style={styles.sectionSpacing} />
            {patches.map((patch) => (
              <TouchableOpacity
                key={patch.id}
                style={[styles.patchCard, patch.selected && styles.patchCardSelected]}
                activeOpacity={0.7}
                onPress={() => togglePatch(patch.id)}
              >
                <View style={styles.patchLeft}>
                  <View style={[styles.patchCheckbox, patch.selected && styles.patchCheckboxSelected]}>
                    {patch.selected && <Check size={12} color={colors.pureBlack} strokeWidth={3} />}
                  </View>
                  <View style={styles.patchInfo}>
                    <Text style={styles.patchName}>{patch.name}</Text>
                    <Text style={styles.patchDesc}>{patch.description}</Text>
                    <View style={styles.patchTags}>
                      <Text style={styles.patchCategory}>{patch.category}</Text>
                      <Text style={[styles.patchRisk, { color: patch.riskLevel === 'high' ? colors.danger : patch.riskLevel === 'medium' ? colors.warning : colors.accent }]}>
                        {patch.riskLevel.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {step === 3 && (
          <View style={styles.section}>
            <Text style={styles.stepTitle}>Patch Preview</Text>
            <Text style={styles.stepDesc}>Diff view of {diffs.length} proposed changes (before vs after)</Text>
            <View style={styles.sectionSpacing} />
            {diffs.length === 0 ? (
              <Panel>
                <Text style={styles.noDiffText}>No patches selected. Go back and select patches to see the diff.</Text>
              </Panel>
            ) : (
              diffs.map((diff) => (
                <View key={diff.id} style={styles.diffCard}>
                  <View style={styles.diffHeader}>
                    <Text style={styles.diffLabel}>{diff.label}</Text>
                    <Text style={styles.diffAddr}>{diff.address}</Text>
                  </View>
                  <CodeBlock
                    lines={[diff.before, diff.after]}
                    highlightLines={[1]}
                    label="before / after"
                  />
                </View>
              ))
            )}
          </View>
        )}

        {step === 4 && exportSummary && (
          <View style={styles.section}>
            <Text style={styles.stepTitle}>Export Summary</Text>
            <Text style={styles.stepDesc}>Simulated patched build output</Text>
            <View style={styles.sectionSpacing} />
            <Panel title="Build Output">
              <View style={styles.exportRow}>
                <Text style={styles.exportLabel}>Target</Text>
                <Text style={styles.exportValue}>{exportSummary.targetName}</Text>
              </View>
              <View style={styles.exportRow}>
                <Text style={styles.exportLabel}>Type</Text>
                <Text style={styles.exportValue}>{exportSummary.targetType}</Text>
              </View>
              <View style={styles.exportRow}>
                <Text style={styles.exportLabel}>Patches Applied</Text>
                <Text style={styles.exportValue}>{exportSummary.patchesApplied}</Text>
              </View>
              <View style={styles.exportRow}>
                <Text style={styles.exportLabel}>Build Size</Text>
                <Text style={styles.exportValue}>{exportSummary.buildSize}</Text>
              </View>
              <View style={styles.exportRow}>
                <Text style={styles.exportLabel}>Risk Score</Text>
                <Text style={[styles.exportValue, { color: colors.warning }]}>{(exportSummary.riskScore * 100).toFixed(0)}%</Text>
              </View>
              <View style={styles.exportRow}>
                <Text style={styles.exportLabel}>Est. Detection Rate</Text>
                <Text style={[styles.exportValue, { color: colors.accent }]}>{(exportSummary.estimatedDetectionRate * 100).toFixed(1)}%</Text>
              </View>
            </Panel>
            <View style={styles.sectionSpacing} />
            <WarningBanner message="This is a simulated export. No actual binary was modified or produced." type="info" />
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.navBtn} activeOpacity={0.7} onPress={handleBack}>
          <ChevronLeft size={18} color={colors.textSecondary} strokeWidth={2} />
          <Text style={styles.navBtnText}>{step === 0 ? 'Back' : 'Previous'}</Text>
        </TouchableOpacity>
        {step < 4 ? (
          <TouchableOpacity
            style={[styles.navBtn, styles.navBtnPrimary, step === 0 && !selectedTarget && styles.navBtnDisabled]}
            activeOpacity={0.7}
            onPress={handleNext}
            disabled={step === 0 && !selectedTarget}
          >
            <Text style={styles.navBtnPrimaryText}>Next</Text>
            <ChevronRight size={18} color={colors.pureBlack} strokeWidth={2} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.navBtn, styles.navBtnPrimary]}
            activeOpacity={0.7}
            onPress={() => router.push('/(tabs)' as never)}
          >
            <Check size={18} color={colors.pureBlack} strokeWidth={2} />
            <Text style={styles.navBtnPrimaryText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  stepBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  stepItem: { flexDirection: 'row' as const, alignItems: 'center' as const },
  stepIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  stepIconActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  stepIconDone: { backgroundColor: colors.accentGlow, borderColor: colors.accent },
  stepLabel: { fontFamily: 'JetBrainsMono-Bold', fontSize: 9, color: colors.textTertiary, marginLeft: 4 },
  stepLabelActive: { color: colors.accent },
  stepConnector: { width: 16, height: 1, backgroundColor: colors.border, marginHorizontal: 4 },
  stepConnectorDone: { backgroundColor: colors.accent },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md },
  section: { marginTop: spacing.sm },
  sectionSpacing: { height: spacing.md },
  stepTitle: { fontFamily: 'Inter-Bold', fontSize: 18, color: colors.textPrimary, letterSpacing: -0.3 },
  stepDesc: { fontFamily: 'Inter-Regular', fontSize: 13, color: colors.textTertiary, marginTop: 4 },
  typeRow: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.md },
  subLabel: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: spacing.sm },
  targetCard: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  targetCardSelected: { borderColor: colors.accent, backgroundColor: colors.accentGlow },
  targetInfo: { flex: 1 },
  targetName: { fontFamily: 'JetBrainsMono-Bold', fontSize: 13, color: colors.textPrimary },
  targetMeta: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  entryRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, paddingVertical: 6 },
  entryAddr: { fontFamily: 'JetBrainsMono-Regular', fontSize: 12, color: colors.accent },
  entryLabel: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textTertiary },
  hotspotRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  hotspotLeft: { flex: 1 },
  hotspotAddr: { fontFamily: 'JetBrainsMono-Regular', fontSize: 12, color: colors.warning },
  hotspotType: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary, marginTop: 2 },
  structRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  structName: { fontFamily: 'JetBrainsMono-Regular', fontSize: 12, color: colors.textPrimary, flex: 1 },
  structType: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.cyan },
  structSize: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary },
  heuristicRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  heuristicName: { fontFamily: 'JetBrainsMono-Regular', fontSize: 12, color: colors.textPrimary },
  heuristicRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, width: 120 },
  heuristicMeter: { flex: 1 },
  heuristicConf: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.accent, minWidth: 36, textAlign: 'right' as const },
  patchCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  patchCardSelected: { borderColor: colors.accent, backgroundColor: colors.accentGlow },
  patchLeft: { flexDirection: 'row' as const, gap: spacing.sm + 2 },
  patchCheckbox: { width: 22, height: 22, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.borderBright, alignItems: 'center' as const, justifyContent: 'center' as const },
  patchCheckboxSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  patchInfo: { flex: 1 },
  patchName: { fontFamily: 'Inter-Bold', fontSize: 14, color: colors.textPrimary },
  patchDesc: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  patchTags: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: 6 },
  patchCategory: { fontFamily: 'JetBrainsMono-Bold', fontSize: 9, color: colors.textTertiary, textTransform: 'uppercase' as const },
  patchRisk: { fontFamily: 'JetBrainsMono-Bold', fontSize: 9, letterSpacing: 0.5 },
  diffCard: { marginBottom: spacing.md },
  diffHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: 6 },
  diffLabel: { fontFamily: 'Inter-Bold', fontSize: 13, color: colors.textPrimary },
  diffAddr: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.warning },
  noDiffText: { fontFamily: 'Inter-Regular', fontSize: 13, color: colors.textTertiary, textAlign: 'center' as const, padding: spacing.md },
  exportRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  exportLabel: { fontFamily: 'JetBrainsMono-Regular', fontSize: 12, color: colors.textTertiary },
  exportValue: { fontFamily: 'JetBrainsMono-Bold', fontSize: 12, color: colors.textPrimary },
  bottomBar: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  navBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  navBtnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 13, color: colors.textSecondary },
  navBtnPrimaryText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 13, color: colors.pureBlack },
});