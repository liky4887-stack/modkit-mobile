import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  Pressable, ActivityIndicator,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';
import {
  pipelineStore,
  type FindingRecord,
  type JobRecord,
} from '@/pipeline/pipelineStore';

const SEV_COLOR: Record<string, string> = {
  critical: '#FF3B30',
  high: '#FF9500',
  medium: '#FFCC00',
  low: '#34C759',
  info: '#8E8E93',
};

const STATE_COLOR: Record<string, string> = {
  pending: colors.textTertiary,
  approved: '#34C759',
  rejected: '#FF3B30',
  applied: '#34C759',
  failed: '#FF3B30',
};

export default function FindingsTab() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [findings, setFindings] = useState<FindingRecord[]>([]);
  const [stats, setStats] = useState<{ total: number; bySeverity: Record<string, number>; byState: Record<string, number> } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (jobId: string | null) => {
    const recent = await pipelineStore.listJobs(10);
    setJobs(recent);
    const id = jobId ?? (recent[0]?.id ?? null);
    setActiveJobId(id);
    if (!id) { setFindings([]); setStats(null); return; }
    const fs = await pipelineStore.listFindings(id);
    setFindings(fs);
    const s = await pipelineStore.findingStats(id);
    setStats(s);
  }, []);

  useEffect(() => {
    void load(null);
    const t = setInterval(() => { void load(activeJobId); }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(activeJobId);
    setRefreshing(false);
  }, [load, activeJobId]);

  const decide = useCallback(async (id: string, state: 'approved' | 'rejected') => {
    setBusy(id);
    try {
      await pipelineStore.setFindingState(id, state);
      await load(activeJobId);
    } finally {
      setBusy(null);
    }
  }, [load, activeJobId]);

  const toggle = useCallback((id: string) => {
    setExpanded(e => ({ ...e, [id]: !e[id] }));
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · FINDINGS</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      >
        {jobs.length > 1 && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>JOB</Text>
            {jobs.slice(0, 5).map(j => (
              <Pressable
                key={j.id}
                onPress={() => setActiveJobId(j.id)}
                style={[styles.jobRow, activeJobId === j.id && styles.jobRowActive]}
              >
                <Text style={styles.jobName} numberOfLines={1}>
                  {j.apkName || j.id.slice(0, 12)}
                </Text>
                <Text style={styles.jobState}>{j.state}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {stats && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>SUMMARY</Text>
            <View style={styles.grid}>
              <View style={styles.gridCell}>
                <Text style={styles.gridNum}>{stats.total}</Text>
                <Text style={styles.gridLabel}>total</Text>
              </View>
              {['critical', 'high', 'medium', 'low'].map(s => (
                <View key={s} style={styles.gridCell}>
                  <Text style={[styles.gridNum, { color: SEV_COLOR[s] }]}>
                    {stats.bySeverity[s] ?? 0}
                  </Text>
                  <Text style={styles.gridLabel}>{s}</Text>
                </View>
              ))}
            </View>
            {stats.byState && (
              <Text style={styles.blockMeta}>
                {Object.entries(stats.byState).map(([k, v]) => `${v} ${k}`).join(' · ') || 'no state changes yet'}
              </Text>
            )}
          </View>
        )}

        {findings.length === 0 && (
          <View style={styles.block}>
            <Text style={styles.blockMeta}>
              No findings yet. Run a pipeline on an APK to generate them.
            </Text>
          </View>
        )}

        {findings.map(f => {
          const open = expanded[f.id];
          const sev = SEV_COLOR[f.severity] || colors.textTertiary;
          const stColor = STATE_COLOR[f.appliedState] || colors.textTertiary;
          return (
            <Pressable key={f.id} onPress={() => toggle(f.id)} style={styles.findingCard}>
              <View style={styles.findingHeader}>
                <View style={[styles.sevPill, { backgroundColor: sev }]}>
                  <Text style={styles.sevPillText}>{f.severity.toUpperCase()}</Text>
                </View>
                <Text style={[styles.stateText, { color: stColor }]}>{f.appliedState}</Text>
              </View>
              <Text style={styles.findingTitle}>{f.title}</Text>
              <Text style={styles.findingCategory}>{f.category}</Text>

              {open && (
                <View style={styles.findingBody}>
                  <Text style={styles.findingRiskLabel}>RISK</Text>
                  <Text style={styles.findingRisk}>{f.risk}</Text>

                  {(f.evidenceClass || f.evidenceMethod || f.evidenceSource) && (
                    <>
                      <Text style={styles.findingRiskLabel}>EVIDENCE</Text>
                      {f.evidenceClass && <Text style={styles.evidenceLine}>class: {f.evidenceClass}</Text>}
                      {f.evidenceMethod && <Text style={styles.evidenceLine}>method: {f.evidenceMethod}</Text>}
                      {f.evidenceSource && <Text style={styles.evidenceLine}>source: {f.evidenceSource}</Text>}
                    </>
                  )}

                  {f.patch && Object.keys(f.patch).length > 0 && (
                    <>
                      <Text style={styles.findingRiskLabel}>PROPOSED PATCH</Text>
                      <View style={styles.patchBox}>
                        <Text style={styles.patchLine}>type: {String(f.patch.type ?? '?')}</Text>
                        <Text style={styles.patchLine}>target: {String(f.patch.target ?? '?')}</Text>
                        <Text style={styles.patchLine}>change: {String(f.patch.change ?? '?')}</Text>
                        {f.patch.rationale ? (
                          <Text style={styles.patchLine}>rationale: {String(f.patch.rationale)}</Text>
                        ) : null}
                      </View>
                    </>
                  )}

                  {f.verification && (
                    <>
                      <Text style={styles.findingRiskLabel}>VERIFICATION</Text>
                      <Text style={styles.findingRisk}>{f.verification}</Text>
                    </>
                  )}

                  {f.appliedState === 'pending' && (
                    <View style={styles.decisionRow}>
                      <Pressable
                        onPress={() => decide(f.id, 'approved')}
                        disabled={busy === f.id}
                        style={[styles.btn, styles.btnApprove, busy === f.id && styles.btnDisabled]}
                      >
                        <Text style={styles.btnText}>APPROVE</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => decide(f.id, 'rejected')}
                        disabled={busy === f.id}
                        style={[styles.btn, styles.btnReject, busy === f.id && styles.btnDisabled]}
                      >
                        <Text style={styles.btnText}>REJECT</Text>
                      </Pressable>
                    </View>
                  )}
                  {f.decisionNote && (
                    <Text style={styles.blockMeta}>note: {f.decisionNote}</Text>
                  )}
                </View>
              )}
            </Pressable>
          );
        })}

        {busy && <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  topBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topBarTitle: {
    color: colors.accent,
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 2,
  },
  content: { padding: spacing.md, paddingBottom: 40 },
  block: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockLabel: {
    color: colors.accent,
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 8,
  },
  blockMeta: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    lineHeight: 16,
    marginTop: 6,
  },
  grid: { flexDirection: 'row', marginTop: 6 },
  gridCell: { flex: 1, alignItems: 'center' },
  gridNum: {
    color: colors.accent,
    fontFamily: 'Inter-SemiBold',
    fontSize: 20,
  },
  gridLabel: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 2,
  },
  jobRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  jobRowActive: { backgroundColor: colors.pureBlack },
  jobName: {
    color: colors.textPrimary,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    flex: 1,
  },
  jobState: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    marginLeft: 8,
  },
  findingCard: {
    marginBottom: 10,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  findingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sevPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
  sevPillText: {
    color: colors.pureBlack,
    fontFamily: 'Inter-SemiBold',
    fontSize: 9,
    letterSpacing: 1,
  },
  stateText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    letterSpacing: 1,
  },
  findingTitle: {
    color: colors.textPrimary,
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  findingCategory: {
    color: colors.textTertiary,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
  },
  findingBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  findingRiskLabel: {
    color: colors.accent,
    fontFamily: 'Inter-SemiBold',
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 10,
    marginBottom: 4,
  },
  findingRisk: {
    color: colors.textSecondary ?? colors.textPrimary,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 17,
  },
  evidenceLine: {
    color: colors.textPrimary,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  patchBox: {
    padding: 8,
    backgroundColor: colors.pureBlack,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  patchLine: {
    color: colors.textPrimary,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  decisionRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnApprove: { backgroundColor: '#34C759' },
  btnReject: { backgroundColor: '#FF3B30' },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color: colors.pureBlack,
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    letterSpacing: 1,
  },
});
