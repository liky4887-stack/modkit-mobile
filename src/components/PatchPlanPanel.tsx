import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native';
import {
  FileSearch, Shield, ShieldOff, Trash2, Play,
  AlertTriangle, CheckCircle2, ChevronRight,
} from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { Panel } from './Panel';
import { patchApi, type PatchGoal, type PatchPlan, type PatchFinding } from '@/api/factory';

const GOALS: { id: PatchGoal; label: string; icon: any; color: string }[] = [
  { id: 'report',         label: 'REPORT',         icon: FileSearch,  color: colors.cyan },
  { id: 'root-bypass',    label: 'ROOT BYPASS',    icon: Shield,      color: colors.accent },
  { id: 'sig-bypass',     label: 'SIG BYPASS',     icon: ShieldOff,   color: colors.warning },
  { id: 'remove-feature', label: 'REMOVE FEATURE', icon: Trash2,      color: colors.danger },
];

export function PatchPlanPanel({ apkPath }: { apkPath: string }) {
  const [goal, setGoal] = useState<PatchGoal>('report');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PatchPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!apkPath.trim()) {
      setError('No APK path — go back to Import and enter one.');
      return;
    }
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const p = await patchApi.plan(apkPath.trim(), goal);
      setPlan(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apkPath, goal]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Patch Plan</Text>
      <Text style={styles.desc}>
        DeepSeek analyzes the real APK facts (manifest, DEX, native libs) and returns a structured
        plan. Pick a goal and run.
      </Text>

      <View style={styles.spacer} />

      <Panel title="APK">
        <Text style={styles.path} numberOfLines={2}>{apkPath || '(none)'}</Text>
      </Panel>

      <View style={styles.spacer} />

      <Panel title="GOAL">
        <View style={styles.goalGrid}>
          {GOALS.map((g) => {
            const active = g.id === goal;
            const Icon = g.icon;
            return (
              <TouchableOpacity
                key={g.id}
                onPress={() => setGoal(g.id)}
                activeOpacity={0.75}
                style={[styles.goalBtn, active && { borderColor: g.color, backgroundColor: colors.surfaceElevated }]}
              >
                <Icon size={16} color={active ? g.color : colors.textTertiary} strokeWidth={2} />
                <Text style={[styles.goalLabel, active && { color: g.color }]}>{g.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={run}
          disabled={loading}
          activeOpacity={0.85}
          style={[styles.runBtn, loading && { opacity: 0.5 }]}
        >
          {loading ? (
            <>
              <ActivityIndicator size="small" color={colors.pureBlack} />
              <Text style={styles.runText}>ANALYZING…</Text>
            </>
          ) : (
            <>
              <Play size={14} color={colors.pureBlack} strokeWidth={2.5} />
              <Text style={styles.runText}>RUN PLAN</Text>
            </>
          )}
        </TouchableOpacity>
      </Panel>

      {error && (
        <>
          <View style={styles.spacer} />
          <Panel title="ERROR">
            <Text style={styles.errText}>{error}</Text>
          </Panel>
        </>
      )}

      {plan && (
        <>
          <View style={styles.spacer} />
          <Panel title="SUMMARY">
            <Text style={styles.body}>{plan.summary || '—'}</Text>
          </Panel>

          {plan.findings && plan.findings.length > 0 && (
            <>
              <View style={styles.spacer} />
              <Panel title={`FINDINGS (${plan.findings.length})`}>
                {plan.findings.map((f, i) => <FindingRow key={i} f={f} />)}
              </Panel>
            </>
          )}

          {plan.patchPlan && plan.patchPlan.length > 0 && (
            <>
              <View style={styles.spacer} />
              <Panel title={`PATCH PLAN (${plan.patchPlan.length})`}>
                {plan.patchPlan.map((s, i) => (
                  <View key={i} style={styles.step}>
                    <View style={styles.stepHead}>
                      <Text style={styles.stepNum}>STEP {s.step}</Text>
                      <Text style={styles.stepAction}>{s.action.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.stepFile} numberOfLines={2}>{s.file}</Text>
                    {s.rationale ? <Text style={styles.stepWhy}>{s.rationale}</Text> : null}
                    {s.payload ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.payloadBox}>
                        <Text style={styles.payload}>{s.payload}</Text>
                      </ScrollView>
                    ) : null}
                  </View>
                ))}
              </Panel>
            </>
          )}

          {plan.nextSteps && plan.nextSteps.length > 0 && (
            <>
              <View style={styles.spacer} />
              <Panel title="NEXT STEPS">
                {plan.nextSteps.map((s, i) => (
                  <View key={i} style={styles.nextRow}>
                    <ChevronRight size={12} color={colors.accent} strokeWidth={2} />
                    <Text style={styles.body}>{s}</Text>
                  </View>
                ))}
              </Panel>
            </>
          )}

          {plan.raw && (
            <>
              <View style={styles.spacer} />
              <Panel title="RAW">
                <Text style={styles.body}>{plan.raw.slice(0, 4000)}</Text>
              </Panel>
            </>
          )}
        </>
      )}

      <View style={{ height: spacing.xxl }} />
    </View>
  );
}

function FindingRow({ f }: { f: PatchFinding }) {
  const riskColor =
    f.risk === 'high' ? colors.danger :
    f.risk === 'medium' ? colors.warning :
    colors.accent;
  return (
    <View style={styles.finding}>
      <View style={styles.findingHead}>
        <CheckCircle2 size={12} color={riskColor} strokeWidth={2} />
        <Text style={styles.findingId}>{f.id}</Text>
        <Text style={[styles.findingRisk, { color: riskColor }]}>{f.risk.toUpperCase()}</Text>
      </View>
      <Text style={styles.findingTarget}>{f.target}</Text>
      <Text style={styles.findingEv} numberOfLines={2}>evidence: {f.evidence}</Text>
      <Text style={styles.findingDefeat}>→ {f.defeat}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.md },
  title: { fontFamily: 'JetBrainsMono-Bold', fontSize: 18, color: colors.textPrimary, letterSpacing: 0.5 },
  desc: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 },
  spacer: { height: spacing.md },
  path: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.cyan, lineHeight: 16 },

  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  goalBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  goalLabel: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.textTertiary, letterSpacing: 0.8 },

  runBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.accent,
  },
  runText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 12, color: colors.pureBlack, letterSpacing: 1.5 },

  body: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  errText: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.danger, lineHeight: 18 },

  finding: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  findingHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  findingId: { flex: 1, fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.textPrimary },
  findingRisk: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, letterSpacing: 0.5 },
  findingTarget: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textSecondary, marginBottom: 3 },
  findingEv: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary, marginBottom: 3 },
  findingDefeat: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.accent, lineHeight: 16 },

  step: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  stepHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  stepNum: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.cyan, letterSpacing: 1 },
  stepAction: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: colors.warning, letterSpacing: 1 },
  stepFile: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textPrimary, marginBottom: 3 },
  stepWhy: { fontFamily: 'Inter-Regular', fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
  payloadBox: {
    marginTop: 6,
    maxHeight: 200,
    backgroundColor: colors.pureBlack,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  payload: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textPrimary, lineHeight: 14 },

  nextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 3 },
});
