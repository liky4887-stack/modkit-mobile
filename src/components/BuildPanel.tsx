import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  Play,
  Check,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Cpu,
  FileCode,
} from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import { Panel } from './Panel';
import { factoryApi, FACTORY_BASE } from '@/api/factory';
import type {
  BuildLogLine,
  BuildResult,
  Engine,
  FactoryHealth,
  FileEntry,
  Project,
} from '@/api/types';

function now() {
  return Date.now();
}

export function BuildPanel() {
  const [prompt, setPrompt] = useState('Write a minimal hello-world index.html with one h1 tag saying HELLO SOVEREIGN.');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [engineId, setEngineId] = useState<string>('engine_deepseek');
  const [projects, setProjects] = useState<Project[]>([]);
  const [engines, setEngines] = useState<Engine[]>([]);
  const [health, setHealth] = useState<FactoryHealth | null>(null);
  const [building, setBuilding] = useState(false);
  const [logs, setLogs] = useState<BuildLogLine[]>([]);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<ScrollView>(null);

  const append = useCallback((level: BuildLogLine['level'], msg: string) => {
    setLogs((prev) => [...prev, { level, msg, ts: now() }].slice(-80));
  }, []);

  const refresh = useCallback(async () => {
    try {
      append('info', `GET ${FACTORY_BASE}/deepseek/health`);
      const h = await factoryApi.health();
      setHealth(h);
      append(h.status.bearerValid ? 'ok' : 'warn',
        `bearer=${h.status.bearerValid} powWasm=${h.status.powWasmLoaded} lastChat=${h.status.lastChatOk}`);

      const eng = await factoryApi.engines();
      setEngines(eng.engines);
      append('info', `engines: ${eng.engines.map((e: Engine) => e.id).join(', ')}`);

      const proj = await factoryApi.projects();
      setProjects(proj.projects);
      if (!projectId && proj.projects.length > 0) {
        setProjectId(proj.projects[0].id);
        append('info', `selected project ${proj.projects[0].id}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      append('error', msg);
    }
  }, [append, projectId]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(async () => {
    if (!projectId || !prompt.trim()) return;
    setBuilding(true);
    setResult(null);
    setError(null);
    append('info', `POST /projects/${projectId}/build (${engineId})`);
    const t0 = Date.now();
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      append('info', `… building (${s}s)`);
    }, 5000);
    try {
      const r = await factoryApi.build(projectId, {
        prompt: prompt.trim(),
        engine: engineId,
      });
      clearInterval(tick);
      setResult(r.result);
      append('ok', `result: ${r.result.summary}`);
      for (const f of r.result.files) {
        append('info', `${f.path}  (${f.bytes} B)`);
      }
    } catch (e) {
      clearInterval(tick);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      append('error', msg);
    } finally {
      setBuilding(false);
    }
  }, [append, engineId, projectId, prompt]);

  const openPreview = useCallback(() => {
    if (!result) return;
    void WebBrowser.openBrowserAsync(result.previewUrl);
  }, [result]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.stepTitle}>Build (live)</Text>
      <Text style={styles.stepDesc}>
        Real DeepSeek build via Termux bridge on <Text style={{ color: colors.accent }}>{FACTORY_BASE}</Text>.
        Files land in <Text style={{ color: colors.cyan }}>~/sovereign-factory</Text>.
      </Text>

      <View style={styles.spacer} />

      {/* Bridge status */}
      <Panel title="BRIDGE">
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Bearer</Text>
          <Text style={[styles.statusValue, { color: health?.status.bearerValid ? colors.accent : colors.warning }]}>
            {health ? (health.status.bearerValid ? 'VALID' : 'STALE') : '—'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>PoW WASM</Text>
          <Text style={[styles.statusValue, { color: health?.status.powWasmLoaded ? colors.accent : colors.textTertiary }]}>
            {health ? (health.status.powWasmLoaded ? 'LOADED' : 'MISSING') : '—'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Last chat</Text>
          <Text style={[styles.statusValue, { color: health?.status.lastChatOk ? colors.accent : colors.textTertiary }]}>
            {health ? (health.status.lastChatOk ? 'OK' : (health.status.lastChatError ?? 'FAIL')) : '—'}
          </Text>
        </View>
        <TouchableOpacity onPress={refresh} style={styles.refreshRow} activeOpacity={0.7}>
          <RefreshCw size={12} color={colors.textSecondary} strokeWidth={2} />
          <Text style={styles.refreshText}>refresh</Text>
        </TouchableOpacity>
      </Panel>

      <View style={styles.spacer} />

      {/* Project picker */}
      <Panel title="PROJECT">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {projects.map((p) => {
            const active = p.id === projectId;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => setProjectId(p.id)}
                activeOpacity={0.7}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                  {p.name.length > 24 ? p.name.slice(0, 22) + '…' : p.name}
                </Text>
              </TouchableOpacity>
            );
          })}
          {projects.length === 0 && <Text style={styles.empty}>no projects</Text>}
        </ScrollView>
      </Panel>

      <View style={styles.spacer} />

      {/* Engine picker */}
      <Panel title="ENGINE">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {engines.map((e) => {
            const active = e.id === engineId;
            const ok = e.health?.healthy !== false;
            return (
              <TouchableOpacity
                key={e.id}
                onPress={() => setEngineId(e.id)}
                activeOpacity={0.7}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Cpu size={11} color={active ? colors.pureBlack : ok ? colors.accent : colors.danger} strokeWidth={2} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{e.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Panel>

      <View style={styles.spacer} />

      {/* Prompt */}
      <Panel title="PROMPT">
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          multiline
          placeholder="describe what to build…"
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          editable={!building}
        />
        <TouchableOpacity
          onPress={run}
          disabled={building || !projectId || !prompt.trim()}
          activeOpacity={0.85}
          style={[styles.runBtn, (building || !projectId) && styles.runBtnDisabled]}
        >
          {building ? (
            <>
              <ActivityIndicator size="small" color={colors.pureBlack} />
              <Text style={styles.runText}>BUILDING…</Text>
            </>
          ) : (
            <>
              <Play size={14} color={colors.pureBlack} strokeWidth={2.5} />
              <Text style={styles.runText}>BUILD</Text>
            </>
          )}
        </TouchableOpacity>
      </Panel>

      {/* Result */}
      {result && (
        <>
          <View style={styles.spacer} />
          <Panel title="RESULT">
            <Text style={styles.summary}>{result.summary}</Text>
            {result.files.map((f: FileEntry) => (
              <View key={f.path} style={styles.fileRow}>
                <FileCode size={12} color={colors.cyan} strokeWidth={2} />
                <Text style={styles.filePath}>{f.path}</Text>
                <Text style={styles.fileBytes}>{f.bytes} B</Text>
              </View>
            ))}
            <TouchableOpacity onPress={openPreview} activeOpacity={0.8} style={styles.previewBtn}>
              <ExternalLink size={13} color={colors.pureBlack} strokeWidth={2.5} />
              <Text style={styles.previewText}>OPEN PREVIEW</Text>
            </TouchableOpacity>
          </Panel>
        </>
      )}

      {/* Logs */}
      <View style={styles.spacer} />
      <Panel title="LOG">
        <ScrollView
          ref={logRef}
          style={styles.logScroll}
          onContentSizeChange={() => logRef.current?.scrollToEnd({ animated: true })}
        >
          {logs.length === 0 && <Text style={styles.empty}>idle</Text>}
          {logs.map((l, i) => (
            <View key={i} style={styles.logLine}>
              <Text style={[styles.logBullet, { color: levelColor(l.level) }]}>
                {levelGlyph(l.level)}
              </Text>
              <Text style={styles.logMsg}>{l.msg}</Text>
            </View>
          ))}
        </ScrollView>
      </Panel>

      {error && (
        <>
          <View style={styles.spacer} />
          <Panel title="ERROR">
            <Text style={[styles.summary, { color: colors.danger }]}>{error}</Text>
          </Panel>
        </>
      )}

      <View style={{ height: spacing.xxl }} />
    </View>
  );
}

function levelColor(l: BuildLogLine['level']): string {
  if (l === 'ok') return colors.accent;
  if (l === 'warn') return colors.warning;
  if (l === 'error') return colors.danger;
  return colors.textTertiary;
}

function levelGlyph(l: BuildLogLine['level']): string {
  if (l === 'ok') return '✓';
  if (l === 'warn') return '!';
  if (l === 'error') return '×';
  return '·';
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.md },
  stepTitle: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 18,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  stepDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  spacer: { height: spacing.md },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  statusLabel: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textSecondary },
  statusValue: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, letterSpacing: 0.5 },
  refreshRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  refreshText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  chipRow: { gap: spacing.xs, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textPrimary },
  chipTextActive: { color: colors.pureBlack, fontFamily: 'JetBrainsMono-Bold' },
  empty: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textTertiary },
  input: {
    minHeight: 80,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
    color: colors.textPrimary,
    backgroundColor: colors.pureBlack,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    textAlignVertical: 'top',
  },
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.sm,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  runBtnDisabled: { opacity: 0.4 },
  runText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 12,
    color: colors.pureBlack,
    letterSpacing: 1.5,
  },
  summary: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  filePath: { flex: 1, fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textPrimary },
  fileBytes: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.sm,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.cyan,
  },
  previewText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 11,
    color: colors.pureBlack,
    letterSpacing: 1.5,
  },
  logScroll: { maxHeight: 220 },
  logLine: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  logBullet: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, width: 12 },
  logMsg: {
    flex: 1,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
