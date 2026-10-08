import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Alert, TextInput,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';
import { apkPicker } from '@/upload/apkPicker';
import { pipelineStore, JobRecord } from '@/pipeline/pipelineStore';
import { investigateRunner } from '@/pipeline/investigateRunner';
import { pipelineRunner } from '@/pipeline/pipelineRunner';
import type { PhaseId } from '@/pipeline/pipelineRunner';
import type { AgentStep } from '@/agent/agentLoop';
import { classLoader } from '@/classdata/classLoader';

interface StagedApk {
  path: string;
  size: number;
  name: string;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function fmtAgo(ts: number | null): string {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'now';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
}

export default function JobsTab() {
  const [staged, setStaged] = useState<StagedApk[]>([]);
  const [selected, setSelected] = useState<StagedApk | null>(null);
  const [picking, setPicking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [running, setRunning] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<string[]>([]);
  const [directPath, setDirectPath] = useState('');
  const [directRunning, setDirectRunning] = useState(false);
  const [directStatus, setDirectStatus] = useState<string | null>(null);
  const [directSteps, setDirectSteps] = useState<string[]>([]);

  const loadStaged = useCallback(async () => {
    const list = await apkPicker.list();
    setStaged(list);
    if (list.length > 0 && !selected) setSelected(list[0]);
  }, [selected]);

  const loadJobs = useCallback(async () => {
    try {
      const list = await pipelineStore.listJobs(20);
      setJobs(list);
    } catch {
      setJobs([]);
    }
  }, []);

  const refreshSilent = useCallback(async () => {
    await loadStaged();
    await loadJobs();
  }, [loadStaged, loadJobs]);

  const refreshManual = useCallback(async () => {
    setRefreshing(true);
    await refreshSilent();
    setRefreshing(false);
  }, [refreshSilent]);

  useEffect(() => {
    void refreshSilent();
    const t = setInterval(() => { void refreshSilent(); }, 3000);
    return () => clearInterval(t);
  }, [refreshSilent]);

  const doPick = async () => {
    setPicking(true);
    setRunStatus(null);
    try {
      const picked = await apkPicker.pick();
      if (picked) {
        await loadStaged();
        setSelected({ path: picked.stagedPath, size: picked.size, name: picked.originalName });
        setRunStatus('staged: ' + picked.originalName + ' (' + fmtSize(picked.size) + ') in ' + picked.copiedMs + 'ms');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Pick failed', msg);
      setRunStatus('FAIL · ' + msg);
    }
    setPicking(false);
  };

  const runDirect = async () => {
    if (directRunning) return;
    const path = directPath.trim();
    if (!path) { Alert.alert('No path'); return; }
    setDirectRunning(true);
    setDirectSteps([]);
    setDirectStatus('creating job…');
    try {
      const name = path.split('/').pop() || 'target.apk';
      const job = await pipelineStore.createJob({
        scanId: 'pipe-' + Date.now(),
        apkPath: path,
        apkName: name,
        apkSize: 0,
      });
      await pipelineStore.createPhasesForJob(job.id);

      const result = await pipelineRunner.run(job.id, {
        onPhase: (phase, state, summary) => {
          setDirectSteps(prev => [...prev, '[' + phase + '] ' + state + (summary ? ' — ' + summary : '')]);
        },
        onStep: (phase, step) => {
          const label = step.kind === 'tool'
            ? '  ' + phase + ' #' + step.iteration + ' tool ' + step.tool + ' (' + (step.elapsedMs ?? 0) + 'ms, ' + (step.resultChars ?? 0) + 'B)'
            : step.kind === 'final'
              ? '  ' + phase + ' #' + step.iteration + ' final'
              : '  ' + phase + ' #' + step.iteration + ' parse_error';
          setDirectSteps(prev => [...prev, label]);
        },
      });

      const elapsed = result.finishedAt - result.startedAt;
      setDirectStatus(
        result.finalState + ' · ' + result.outcomes.length + ' phases · ' + elapsed + 'ms'
      );
      await loadJobs();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDirectStatus('FAIL · ' + msg);
    }
    setDirectRunning(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · JOBS</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshManual} tintColor={colors.accent} />}
      >
        <View style={styles.block}>
          <Text style={styles.blockLabel}>SELECT APK</Text>
          <Text style={styles.help}>
            Pick any .apk from device storage. It is copied to
            /storage/emulated/0/Download/modkit-apks/ so the Termux backend
            can read it. No HTTP upload.
          </Text>
          <Pressable
            onPress={doPick}
            disabled={picking || running}
            style={[styles.primaryBtn, (picking || running) && { opacity: 0.5 }]}
          >
            <Text style={styles.primaryBtnText}>
              {picking ? 'COPYING…' : 'SELECT APK'}
            </Text>
          </Pressable>
        </View>

        {staged.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>STAGED ({staged.length})</Text>
            {staged.map((s) => {
              const isSel = selected && selected.path === s.path;
              return (
                <Pressable
                  key={s.path}
                  onPress={() => setSelected(s)}
                  style={[styles.apkRow, isSel && styles.apkRowSel]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.apkName} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.apkPath} numberOfLines={1}>{s.path}</Text>
                  </View>
                  <Text style={styles.apkSize}>{fmtSize(s.size)}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.block}>
          <Text style={styles.blockLabel}>RUN PIPELINE (import → partition → dispatch)</Text>
          <Text style={styles.help}>
            Reads the file in place via the backend. No copy, no disk needed.
          </Text>
          <TextInput
            value={directPath}
            onChangeText={setDirectPath}
            style={styles.pathInput}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!directRunning}
            placeholder="/storage/emulated/0/.../your-app.apk"
            placeholderTextColor={colors.textTertiary}
          />
          <Pressable
            onPress={runDirect}
            disabled={directRunning}
            style={[styles.runBtn, directRunning && { opacity: 0.5 }]}
          >
            <Text style={styles.runBtnText}>
              {directRunning ? 'PIPELINE RUNNING…' : 'RUN PIPELINE'}
            </Text>
          </Pressable>
          {directStatus && (
            <Text
              style={[
                styles.statusText,
                directStatus.startsWith('FAIL') && { color: colors.danger },
              ]}
            >
              {directStatus}
            </Text>
          )}
          {directSteps.length > 0 && (
            <View style={{ marginTop: 8 }}>
              {directSteps.map((line, i) => (
                <Text key={i} style={styles.stepText}>{line}</Text>
              ))}
            </View>
          )}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>RECENT JOBS ({jobs.length})</Text>
          {jobs.length === 0 && (
            <Text style={styles.help}>No jobs yet.</Text>
          )}
          {jobs.map((j) => (
            <View key={j.id} style={styles.jobRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.jobTitle} numberOfLines={1}>
                  [{j.state}] {j.apkName || j.apkPath.split('/').pop()}
                </Text>
                <Text style={styles.jobMeta}>
                  {j.currentPhase || '—'} · ds {j.dsCalls} calls · {fmtAgo(j.updatedAt)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  topBar: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  topBarTitle: {
    color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 2,
  },
  scroll: { flex: 1 },
  content: { padding: spacing.md },
  block: {
    marginBottom: spacing.md, padding: spacing.md,
    backgroundColor: colors.surface, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  blockLabel: {
    color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 10,
    letterSpacing: 2, marginBottom: 8,
  },
  help: {
    color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 11,
    lineHeight: 16, marginBottom: 8,
  },
  primaryBtn: {
    backgroundColor: colors.accent, borderRadius: 6,
    paddingVertical: 12, alignItems: 'center', marginTop: 4,
  },
  primaryBtnText: {
    color: colors.pureBlack, fontFamily: 'Inter-SemiBold',
    fontSize: 12, letterSpacing: 1,
  },
  runBtn: {
    backgroundColor: colors.accent, borderRadius: 6,
    paddingVertical: 12, alignItems: 'center', marginTop: 4,
  },
  runBtnText: {
    color: colors.pureBlack, fontFamily: 'Inter-SemiBold',
    fontSize: 12, letterSpacing: 1,
  },
  apkRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  apkRowSel: { backgroundColor: 'rgba(0,255,136,0.08)' },
  apkName: { color: colors.textPrimary, fontFamily: 'Inter-Medium', fontSize: 12 },
  apkPath: { color: colors.textTertiary, fontFamily: 'JetBrainsMono-Regular', fontSize: 9, marginTop: 2 },
  apkSize: { color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 11, marginLeft: 8 },
  statusText: {
    color: colors.accent, fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10, marginTop: 10, lineHeight: 14,
  },
  stepText: {
    color: colors.textTertiary, fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10, lineHeight: 14,
  },
  pathInput: {
    color: colors.textPrimary, fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10, backgroundColor: colors.pureBlack,
    borderRadius: 6, borderWidth: 1, borderColor: colors.border,
    padding: 8, marginBottom: 8,
  },
  jobRow: {
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  jobTitle: { color: colors.textPrimary, fontFamily: 'Inter-Medium', fontSize: 12 },
  jobMeta: { color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 10, marginTop: 2 },
});
