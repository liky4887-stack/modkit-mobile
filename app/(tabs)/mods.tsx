// MODS — compare two APKs, list modifications, revert selected ones.
// Produces clean.apk only. There is no "keep" path.
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, ActivityIndicator,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';
import { runModCompare, requestRevert, type Modification } from '@/utils/modDiff';

const TYPE_COLOR: Record<string, string> = {
  ADDED:    '#FF3B30',
  REMOVED:  '#FF9500',
  MODIFIED: '#FFCC00',
};

const KIND_LABEL: Record<string, string> = {
  class: 'class',
  method: 'method',
  resource: 'resource',
  permission: 'permission',
  component: 'component',
  native: 'native lib',
};

export default function ModsTab() {
  const [originalApk, setOriginalApk] = useState('');
  const [modifiedApk, setModifiedApk] = useState('');
  const [busy, setBusy] = useState(false);
  const [revertBusy, setRevertBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [mods, setMods] = useState<Modification[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const runCompare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setStatus('comparing...');
    setMods([]);
    try {
      const r = await runModCompare(originalApk, modifiedApk);
      setMods(r.modifications);
      setStatus(r.modifications.length + ' modification(s) found in ' + r.wall_ms + 'ms');
    } catch (e) {
      setStatus('FAIL · ' + (e instanceof Error ? e.message : String(e)).slice(0, 180));
    } finally {
      setBusy(false);
    }
  }, [busy, originalApk, modifiedApk]);

  const toggleRevert = useCallback((id: string) => {
    setMods(list => list.map(m => m.id === id ? { ...m, reverted: !m.reverted } : m));
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpanded(e => ({ ...e, [id]: !e[id] }));
  }, []);

  const revertCount = useMemo(() => mods.filter(m => m.reverted).length, [mods]);

  const produceClean = useCallback(async () => {
    if (revertBusy || revertCount === 0) return;
    setRevertBusy(true);
    setStatus('rebuilding clean.apk from ' + revertCount + ' reverted item(s)...');
    try {
      const safe = (modifiedApk.split('/').pop() || 'clean.apk').replace(/\.apk$/i, '');
      const out = `/storage/emulated/0/Download/modkit-enhanced/${safe}-clean-${Date.now()}.apk`;
      const r = await requestRevert(originalApk, modifiedApk, mods.filter(m => m.reverted), out);
      if (!r.ok) throw new Error(r.error || 'revert failed');
      setStatus('clean APK written → ' + r.output);
    } catch (e) {
      setStatus('FAIL · ' + (e instanceof Error ? e.message : String(e)).slice(0, 180));
    } finally {
      setRevertBusy(false);
    }
  }, [revertBusy, revertCount, originalApk, modifiedApk, mods]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · MODIFICATIONS</Text>
      </View>

      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>ORIGINAL APK (reference)</Text>
        <TextInput
          value={originalApk}
          onChangeText={setOriginalApk}
          style={styles.input}
          placeholder="/storage/emulated/0/.../original.apk"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <Text style={[styles.inputLabel, { marginTop: 10 }]}>MODIFIED APK (candidate)</Text>
        <TextInput
          value={modifiedApk}
          onChangeText={setModifiedApk}
          style={styles.input}
          placeholder="/storage/emulated/0/.../suspect.apk"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <Pressable
          onPress={runCompare}
          disabled={busy || !originalApk.trim() || !modifiedApk.trim()}
          style={[styles.primaryBtn, (busy || !originalApk.trim() || !modifiedApk.trim()) && styles.btnDisabled]}
        >
          <Text style={styles.primaryBtnText}>{busy ? 'COMPARING…' : 'COMPARE'}</Text>
        </Pressable>
        {status && (
          <Text style={[styles.statusText, { color: status.startsWith('FAIL') ? '#FF3B30' : colors.accent }]}>
            {status}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {mods.length === 0 && !busy && (
          <Text style={styles.emptyText}>
            Point at two APKs and tap COMPARE. This tool reports every
            class, method, resource, permission, and native lib that
            differs between the two files, and can produce a clean copy
            reverted to the original bytes.
          </Text>
        )}

        {mods.map(m => {
          const open = expanded[m.id];
          const toneColor = TYPE_COLOR[m.type] || colors.textTertiary;
          return (
            <Pressable key={m.id} onPress={() => toggleExpand(m.id)} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.pill, { backgroundColor: toneColor }]}>
                  <Text style={styles.pillText}>{m.type}</Text>
                </View>
                <Text style={styles.kindText}>{KIND_LABEL[m.kind] || m.kind}</Text>
              </View>
              <Text style={styles.targetText} numberOfLines={2}>{m.target}</Text>

              {open && (
                <View style={styles.diffBox}>
                  {m.original && (
                    <>
                      <Text style={styles.diffLabel}>ORIGINAL</Text>
                      <Text style={styles.diffLine}>- {m.original.slice(0, 400)}</Text>
                    </>
                  )}
                  {m.modified && (
                    <>
                      <Text style={[styles.diffLabel, { marginTop: 8 }]}>MODIFIED</Text>
                      <Text style={styles.diffLine}>+ {m.modified.slice(0, 400)}</Text>
                    </>
                  )}
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); toggleRevert(m.id); }}
                    style={[styles.revertBtn, m.reverted && styles.revertBtnOn]}
                  >
                    <Text style={styles.revertBtnText}>
                      {m.reverted ? '☑ REVERT TO ORIGINAL' : '☐ REVERT TO ORIGINAL'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </Pressable>
          );
        })}

        {mods.length > 0 && (
          <Pressable
            onPress={produceClean}
            disabled={revertBusy || revertCount === 0}
            style={[styles.cleanBtn, (revertBusy || revertCount === 0) && styles.btnDisabled]}
          >
            <Text style={styles.primaryBtnText}>
              {revertBusy ? 'REBUILDING…' : `PRODUCE CLEAN.APK (${revertCount} reverted)`}
            </Text>
          </Pressable>
        )}

        {(busy || revertBusy) && <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />}
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
  inputSection: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inputLabel: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 4,
  },
  input: {
    color: colors.textPrimary,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    backgroundColor: colors.pureBlack,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: colors.pureBlack,
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    letterSpacing: 1,
  },
  btnDisabled: { opacity: 0.45 },
  statusText: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    marginTop: 8,
    lineHeight: 14,
  },
  content: { padding: spacing.md, paddingBottom: 40 },
  emptyText: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 17,
  },
  card: {
    marginBottom: 10,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
  pillText: {
    color: colors.pureBlack,
    fontFamily: 'Inter-SemiBold',
    fontSize: 9,
    letterSpacing: 1,
  },
  kindText: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 10,
  },
  targetText: {
    color: colors.textPrimary,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  diffBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  diffLabel: {
    color: colors.accent,
    fontFamily: 'Inter-SemiBold',
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 4,
  },
  diffLine: {
    color: colors.textPrimary,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  revertBtn: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  revertBtnOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  revertBtnText: {
    color: colors.textPrimary,
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    letterSpacing: 1,
  },
  cleanBtn: {
    marginTop: 20,
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
