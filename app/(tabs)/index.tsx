// JOBS — the whole deterministic pipeline, one page.
//
// Top: TARGET (from file picker) + REFERENCE URL field.
// Run: one button, enabled once a reference URL is present.
// Paused: inline review list with checkboxes + DECIDE + RESUME.
// Done: findings summary inline.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';
import { apkPicker } from '@/upload/apkPicker';
import { pipelineStore, JobRecord, type FindingRecord } from '@/pipeline/pipelineStore';
import { pipelineRunner } from '@/pipeline/pipelineRunner';

const DEFAULT_REFERENCE = '/data/data/com.termux/files/home/fixtures/pubg-method-edit.apk';

const TYPE_COLOR: Record<string, string> = {
  ADDED: '#FF3B30',
  REMOVED: '#FF9500',
  MODIFIED: '#FFCC00',
};

const SEV_COLOR: Record<string, string> = {
  critical: '#FF3B30',
  high: '#FF9500',
  medium: '#FFCC00',
  low: '#34C759',
  info: '#8E8E93',
};

interface ModRow {
  id: string;
  type: string;
  kind: string;
  target: string;
  parentDex: string | null;
  original: string | null;
  modified: string | null;
  originalHash: string | null;
  modifiedHash: string | null;
  reverted: boolean;
}

export default function JobsTab() {
  const [targetPath, setTargetPath] = useState('/storage/emulated/0/SHAREit Lite/apps/PUBG_MOBILE.apk');
  const [referencePath, setReferencePath] = useState(DEFAULT_REFERENCE);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<JobRecord | null>(null);
  const [mods, setMods] = useState<ModRow[]>([]);
  const [jobFindings, setJobFindings] = useState<FindingRecord[]>([]);
  const [showFindings, setShowFindings] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);

  const reloadMods = useCallback(async (jobId: string) => {
    const ms = await pipelineStore.listModifications(jobId) as ModRow[];
    setMods(ms);
    setSelected(new Set());
    setUserInteracted(false);
  }, []);

  const loadJob = useCallback(async (jobId: string) => {
    const j = await pipelineStore.getJob(jobId);
    setCurrentJob(j);
    if (!j) return;
    const phases = await pipelineStore.getPhases(jobId);
    setSteps(phases.map((p: any) =>
      '[' + p.phase + '] ' + p.state + (p.summary ? ' — ' + p.summary : '')));
    const timing = phases
      .filter((p: any) => p.startedAt && p.finishedAt)
      .map((p: any) => p.phase + '=' + ((p.finishedAt - p.startedAt) / 1000).toFixed(1) + 's')
      .join(' ');
    setStatus((j.state || '?') + ' · ' + phases.length + ' phases' + (timing ? '\n' + timing : ''));
    if (j.state === 'awaiting_user') {
      await reloadMods(jobId);
    } else {
      setMods([]);
      setSelected(new Set());
    }
    // Findings from bots + features phases. Live in this same job.
    try {
      const fs = await pipelineStore.listFindings(jobId);
      setJobFindings(fs);
    } catch {
      setJobFindings([]);
    }
  }, [reloadMods]);

  // Restore latest job on mount
  useEffect(() => {
    (async () => {
      try {
        const jobs = await pipelineStore.listJobs(1);
        if (jobs.length) await loadJob(jobs[0].id);
      } catch {}
    })();
  }, [loadJob]);

  const pickTarget = useCallback(async () => {
    try {
      const p = await apkPicker.pick();
      const target = p?.stagedPath || p?.sourceUri || null;
      if (target) setTargetPath(String(target));
    } catch (e) {
      Alert.alert('Pick failed', (e as Error).message);
    }
  }, []);

  const runPipeline = useCallback(async () => {
    if (running) return;
    if (!targetPath.trim()) { Alert.alert('No TARGET APK'); return; }
    if (!referencePath.trim()) { Alert.alert('No REFERENCE URL'); return; }

    setRunning(true);
    setSteps([]);
    setMods([]);
    setSelected(new Set());
    setUserInteracted(false);
    setStatus('creating job…');

    try {
      const name = targetPath.split('/').pop() || 'target.apk';
      const job = await pipelineStore.createJob({
        scanId: 'pipe-' + Date.now(),
        apkPath: targetPath.trim(),
        apkName: name,
        apkSize: 0,
      });
      await pipelineStore.createPhasesForJob(job.id);
      await pipelineStore.setModifiedApkPath(job.id, referencePath.trim());

      const startedAt = Date.now();
      const result = await pipelineRunner.run(job.id, {
        onPhase: (phase, state, summary) => {
          setSteps(prev => [...prev, '[' + phase + '] ' + state + (summary ? ' — ' + summary : '')]);
          const el = ((Date.now() - startedAt) / 1000).toFixed(1);
          setStatus('RUNNING · ' + phase + ' · ' + state + ' · ' + el + 's');
        },
      });

      const elapsed = result.finishedAt - result.startedAt;
      const timing = result.outcomes.map(o =>
        o.phase + '=' + (o.elapsedMs / 1000).toFixed(1) + 's').join(' ');
      setStatus(result.finalState + ' · ' + result.outcomes.length + ' phases · ' +
        elapsed + 'ms\n' + timing);
      await loadJob(job.id);
    } catch (e) {
      setStatus('FAIL · ' + (e instanceof Error ? e.message : String(e)));
    }
    setRunning(false);
  }, [running, targetPath, referencePath, loadJob]);

  const toggle = useCallback(async (id: string) => {
    setUserInteracted(true);
    const next = !selected.has(id);
    const s = new Set(selected);
    if (next) s.add(id); else s.delete(id);
    setSelected(s);
    await pipelineStore.setModificationReverted(id, next);
  }, [selected]);

  const toggleAll = useCallback(async (group: ModRow[], on: boolean) => {
    setUserInteracted(true);
    const s = new Set(selected);
    for (const m of group) {
      if (on) s.add(m.id); else s.delete(m.id);
      await pipelineStore.setModificationReverted(m.id, on);
    }
    setSelected(s);
  }, [selected]);

  const decideAndResume = useCallback(async () => {
    if (!currentJob || busy) return;
    if (selected.size === 0) { Alert.alert('Mark at least one item'); return; }
    setBusy(true);
    try {
      await pipelineStore.setReviewState(currentJob.id, 'decided');
      setStatus('running revert → export → audit…');
      const r = await pipelineRunner.run(currentJob.id, { fromPhase: 'revert' as any });
      setStatus(r.finalState + ' · ' + r.outcomes.length + ' phases · ' +
        (r.finishedAt - r.startedAt) + 'ms');
      await loadJob(currentJob.id);
    } catch (e) {
      setStatus('FAIL · ' + (e instanceof Error ? e.message : String(e)));
    }
    setBusy(false);
  }, [currentJob, busy, selected, loadJob]);

  const grouped = useMemo(() => {
    const map = new Map<string, ModRow[]>();
    for (const m of mods) {
      const key = m.parentDex || ('[' + m.kind + ']');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [mods]);

  const phaseState = currentJob?.state;
  const showReview = phaseState === 'awaiting_user';

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · JOBS</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* SELECT APK */}
        <View style={styles.block}>
          <Text style={styles.blockLabel}>SELECT APK</Text>
          <Text style={styles.help}>
            Pick the TARGET .apk. Currently: {targetPath.split('/').pop()}
          </Text>
          <Pressable onPress={pickTarget} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>SELECT APK</Text>
          </Pressable>
        </View>

        {/* RUN PIPELINE */}
        <View style={styles.block}>
          <Text style={styles.blockLabel}>RUN PIPELINE</Text>
          <Text style={styles.help}>
            Deterministic chain: import → decompile → diff → modBots →
            review_gate → revert → export → audit. Zero LLM calls.
          </Text>

          <Text style={[styles.miniLabel, { marginTop: 10 }]}>TARGET APK</Text>
          <Text style={styles.pathText} numberOfLines={2}>{targetPath}</Text>

          <Text style={[styles.miniLabel, { marginTop: 10 }]}>REFERENCE APK URL</Text>
          <TextInput
            value={referencePath}
            onChangeText={setReferencePath}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!running}
            placeholder="/data/data/.../fixtures/pubg-modded.apk"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={[styles.help, {
            color: referencePath.trim() ? colors.accent : colors.danger,
            marginTop: 4,
          }]}>
            {referencePath.trim()
              ? 'REFERENCE SET · READY'
              : 'REFERENCE EMPTY — paste a path'}
          </Text>

          {referencePath.trim().length > 0 && (
            <Pressable
              onPress={runPipeline}
              disabled={running}
              style={[styles.primaryBtn, { marginTop: 12 }, running && styles.btnDisabled]}
            >
              <Text style={styles.primaryBtnText}>
                {running ? 'PIPELINE RUNNING…' : 'RUN PIPELINE · TARGET vs REFERENCE'}
              </Text>
            </Pressable>
          )}

          {status && (
            <Text style={[styles.status, status.startsWith('FAIL') && { color: '#FF3B30' }]}>
              {status}
            </Text>
          )}
        </View>

        {/* PHASE LOG */}
        {steps.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>PHASES</Text>
            {steps.map((s, i) => (
              <Text key={i} style={styles.stepLine}>{s}</Text>
            ))}
          </View>
        )}

        {/* INLINE REVIEW — appears when paused */}
        {showReview && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>
              {'REVIEW · ' + mods.length + ' MODIFICATION' + (mods.length === 1 ? '' : 'S')}
            </Text>
            {mods.length === 0 && (
              <Text style={styles.help}>
                No modifications to review. The diff phase found nothing — usually
                because the reference is byte-identical to the target.
              </Text>
            )}
            {mods.length > 0 && (
              <>
                <Text style={styles.help}>
                  {selected.size} marked for revert. Grouped by parent dex.
                </Text>
                {grouped.map(([key, group]) => {
                  const open = expanded[key] !== false;
                  const groupSel = group.filter(m => selected.has(m.id)).length;
                  return (
                    <View key={key} style={styles.group}>
                      <Pressable
                        onPress={() => setExpanded(e => ({ ...e, [key]: !(e[key] !== false) }))}
                        style={styles.groupHeader}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.groupTitle} numberOfLines={1}>{key}</Text>
                          <Text style={styles.groupMeta}>
                            {group.length + ' item' + (group.length === 1 ? '' : 's') +
                             ' · ' + groupSel + ' selected'}
                          </Text>
                        </View>
                        <Text style={styles.groupChevron}>{open ? '▾' : '▸'}</Text>
                      </Pressable>
                      <View style={styles.groupActions}>
                        <Pressable onPress={() => toggleAll(group, true)} style={[styles.miniBtn, styles.miniOn]}>
                          <Text style={styles.miniTextOn}>ALL</Text>
                        </Pressable>
                        <Pressable onPress={() => toggleAll(group, false)} style={styles.miniBtn}>
                          <Text style={styles.miniText}>NONE</Text>
                        </Pressable>
                      </View>
                      {open && group.map(m => {
                        const on = selected.has(m.id);
                        const tone = TYPE_COLOR[m.type] || '#8E8E93';
                        return (
                          <Pressable key={m.id} onPress={() => toggle(m.id)}
                            style={[styles.modRow, on && styles.modRowOn]}>
                            <View style={[styles.checkbox, on && styles.checkboxOn]}>
                              {on && <Text style={styles.checkMark}>✓</Text>}
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={styles.modTop}>
                                <View style={[styles.pill, { backgroundColor: tone }]}>
                                  <Text style={styles.pillText}>{m.type}</Text>
                                </View>
                                <Text style={styles.kindText}>{m.kind}</Text>
                              </View>
                              <Text style={styles.targetText} numberOfLines={2}>{m.target}</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })}

                <Pressable
                  onPress={decideAndResume}
                  disabled={busy || selected.size === 0 || !userInteracted}
                  style={[styles.decideBtn, (busy || selected.size === 0) && styles.btnDisabled]}
                >
                  <Text style={styles.decideText}>
                    {busy ? 'RESUMING…' : 'DECIDE + RESUME · ' + selected.size + ' reverted'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {/* FINDINGS — bot + feature hits for THIS job */}
        {jobFindings.length > 0 && (() => {
          const bySev: Record<string, number> = {};
          const bySource: Record<string, number> = { bot: 0, feature: 0, nested: 0 };
          for (const f of jobFindings) {
            bySev[f.severity] = (bySev[f.severity] || 0) + 1;
            const src = (f.evidenceSource || '');
            if (src.startsWith('feature_hunt'))    bySource.feature++;
            else if (src.startsWith('nested'))     bySource.nested++;
            else                                    bySource.bot++;
          }
          const sevOrder = ['critical', 'high', 'medium', 'low', 'info'];
          return (
            <View style={styles.block}>
              <Text style={styles.blockLabel}>
                {'FINDINGS · ' + jobFindings.length}
              </Text>
              <Text style={styles.help}>
                {'bot: ' + bySource.bot + ' · feature: ' + bySource.feature +
                 (bySource.nested ? ' · nested: ' + bySource.nested : '')}
              </Text>
              <View style={styles.grid}>
                {sevOrder.map(sev => (
                  <View key={sev} style={styles.gridCell}>
                    <Text style={[styles.gridNum, { color: SEV_COLOR[sev] }]}>
                      {bySev[sev] || 0}
                    </Text>
                    <Text style={styles.gridLabel}>{sev}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                onPress={() => setShowFindings(v => !v)}
                style={[styles.miniBtn, { marginTop: 10, alignSelf: 'flex-start' }]}
              >
                <Text style={styles.miniText}>
                  {showFindings ? 'HIDE LIST' : 'SHOW LIST (' + jobFindings.length + ')'}
                </Text>
              </Pressable>

              {showFindings && (
                <View style={{ marginTop: 8 }}>
                  {jobFindings.slice(0, 60).map(f => {
                    const src = (f.evidenceSource || '');
                    const tag = src.startsWith('feature_hunt') ? 'FEAT'
                              : src.startsWith('nested')       ? 'NEST'
                              : src.startsWith('bot')          ? 'BOT'
                              : 'OTH';
                    return (
                      <View key={f.id} style={styles.findingRow}>
                        <View style={[styles.sevPill, { backgroundColor: SEV_COLOR[f.severity] || '#8E8E93' }]}>
                          <Text style={styles.sevPillText}>{f.severity.slice(0, 4).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.findingTitle} numberOfLines={2}>
                            {f.title}
                          </Text>
                          <Text style={styles.findingMeta}>
                            {tag + ' · ' + f.category +
                             (f.confidenceBand ? ' · ' + f.confidenceBand : '')}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                  {jobFindings.length > 60 && (
                    <Text style={styles.help}>
                      {'…' + (jobFindings.length - 60) + ' more — see FINDINGS tab'}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })()}

        {/* Recent jobs */}
        <View style={styles.block}>
          <Text style={styles.blockLabel}>RECENT</Text>
          <RecentJobs onPick={(id) => loadJob(id)} />
        </View>

        {busy && <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />}
      </ScrollView>
    </View>
  );
}

function RecentJobs({ onPick }: { onPick: (id: string) => void }) {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  useEffect(() => {
    (async () => {
      const list = await pipelineStore.listJobs(5);
      setJobs(list);
    })();
  }, []);
  return (
    <>
      {jobs.map(j => (
        <Pressable key={j.id} onPress={() => onPick(j.id)} style={styles.jobRow}>
          <Text style={styles.jobName} numberOfLines={1}>{j.apkName || j.id.slice(0, 12)}</Text>
          <Text style={styles.jobState}>{j.state}</Text>
        </Pressable>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  topBar: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  topBarTitle: { color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 2 },
  content: { padding: spacing.md, paddingBottom: 60 },
  block: { marginBottom: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  blockLabel: { color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 10, letterSpacing: 2, marginBottom: 8 },
  miniLabel: { color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 9, letterSpacing: 2, marginBottom: 4 },
  help: { color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 16 },
  pathText: { color: colors.textPrimary, fontFamily: 'JetBrainsMono-Regular', fontSize: 10, lineHeight: 15, marginBottom: 4 },
  input: {
    color: colors.textPrimary, fontFamily: 'JetBrainsMono-Regular', fontSize: 10,
    backgroundColor: colors.pureBlack, borderRadius: 6, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 8,
  },
  primaryBtn: { backgroundColor: colors.accent, borderRadius: 6, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: colors.pureBlack, fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 1 },
  btnDisabled: { opacity: 0.4 },
  status: { color: colors.accent, fontFamily: 'JetBrainsMono-Regular', fontSize: 10, marginTop: 12, lineHeight: 15 },
  stepLine: { color: colors.textTertiary, fontFamily: 'JetBrainsMono-Regular', fontSize: 10, lineHeight: 15 },

  group: { marginTop: 10, backgroundColor: colors.pureBlack, borderRadius: 6, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, paddingBottom: 6 },
  groupTitle: { color: colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12 },
  groupMeta: { color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 10, marginTop: 2 },
  groupChevron: { color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 14, marginLeft: 8 },
  groupActions: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingBottom: 8 },
  miniBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, borderWidth: 1, borderColor: colors.border },
  miniOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  miniText: { color: colors.textTertiary, fontFamily: 'Inter-SemiBold', fontSize: 9, letterSpacing: 1 },
  miniTextOn: { color: colors.pureBlack, fontFamily: 'Inter-SemiBold', fontSize: 9, letterSpacing: 1 },

  modRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  modRowOn: { backgroundColor: 'rgba(0,255,136,0.06)' },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: colors.pureBlack, fontFamily: 'Inter-Bold', fontSize: 12 },
  modTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  pill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  pillText: { color: colors.pureBlack, fontFamily: 'Inter-SemiBold', fontSize: 8, letterSpacing: 0.5 },
  kindText: { color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 9 },
  targetText: { color: colors.textPrimary, fontFamily: 'JetBrainsMono-Regular', fontSize: 10, lineHeight: 14 },

  decideBtn: { marginTop: 12, backgroundColor: colors.accent, borderRadius: 6, paddingVertical: 14, alignItems: 'center' },
  decideText: { color: colors.pureBlack, fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 1 },

  grid: { flexDirection: 'row', marginTop: 8 },
  gridCell: { flex: 1, alignItems: 'center' },
  gridNum: { color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 16 },
  gridLabel: { color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 8, letterSpacing: 1, marginTop: 2 },

  findingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  sevPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, marginTop: 2 },
  sevPillText: { color: colors.pureBlack, fontFamily: 'Inter-SemiBold', fontSize: 8, letterSpacing: 0.5 },
  findingTitle: { color: colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 15 },
  findingMeta: { color: colors.textTertiary, fontFamily: 'JetBrainsMono-Regular', fontSize: 9, marginTop: 2 },

  jobRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  jobName: { color: colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 11, flex: 1 },
  jobState: { color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 10, marginLeft: 8 },
});
