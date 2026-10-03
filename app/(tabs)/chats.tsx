import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Pressable,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';
import { chatLifecycle } from '@/chat/chatLifecycle';
import { chatRegistry, ChatRecord, TurnRecord } from '@/chat/chatRegistry';

interface Snapshot {
  active: ChatRecord[];
  recent: ChatRecord[];
  stats24h: any;
  limiter: any;
}

function fmtTime(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function fmtAgo(ts: number | null): string {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'now';
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  return Math.floor(s / 3600) + 'h';
}

export default function ChatsTab() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [turns, setTurns] = useState<TurnRecord[]>([]);

  const refreshSilent = useCallback(async () => {
    try {
      const s = await chatLifecycle.snapshot();
      setSnap(s);
    } catch {
      setSnap(null);
    }
  }, []);

  const refreshManual = useCallback(async () => {
    setRefreshing(true);
    await refreshSilent();
    setRefreshing(false);
  }, [refreshSilent]);

  useEffect(() => {
    void chatLifecycle.sweepStuck().catch(() => {});
    void refreshSilent();
    const t = setInterval(() => { void refreshSilent(); }, 2000);
    return () => clearInterval(t);
  }, [refreshSilent]);

  const viewTurns = async (chatId: string) => {
    if (expanded === chatId) { setExpanded(null); setTurns([]); return; }
    const rows = await chatRegistry.listTurns(chatId, 200);
    setTurns(rows);
    setExpanded(chatId);
  };

  const closeChat = async (chatId: string) => {
    await chatRegistry.abort(chatId, 'user_cancelled');
    void refreshSilent();
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · CHATS</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshManual} tintColor={colors.accent} />}
      >
        {snap && (
          <>
            <View style={styles.statsBlock}>
              <Text style={styles.statsLabel}>LIMITER</Text>
              <Text style={styles.statsValue}>
                {snap.limiter.active} / {snap.limiter.maxConcurrent} concurrent
                {' · '}
                {snap.limiter.lastMinuteCount} / {snap.limiter.maxPerMinute} per min
              </Text>
              {snap.limiter.backoffRemainingMs > 0 && (
                <Text style={[styles.statsValue, { color: colors.danger }]}>
                  backoff {Math.ceil(snap.limiter.backoffRemainingMs / 1000)}s
                  {' · '}fails {snap.limiter.consecutiveFailures}
                </Text>
              )}
            </View>

            <View style={styles.statsBlock}>
              <Text style={styles.statsLabel}>24H</Text>
              <Text style={styles.statsValue}>
                {snap.stats24h.total} chats · {snap.stats24h.turnsTotal} turns
              </Text>
              <Text style={styles.statsValue}>
                in {snap.stats24h.tokensIn} · out {snap.stats24h.tokensOut} tokens
              </Text>
            </View>

            <Text style={styles.sectionTitle}>ACTIVE ({snap.active.length})</Text>
            {snap.active.length === 0 && (
              <Text style={styles.emptyLine}>No open sessions.</Text>
            )}
            {snap.active.map((c) => (
              <View key={c.id} style={styles.chatRow}>
                <Pressable onPress={() => viewTurns(c.id)} style={{ flex: 1 }}>
                  <Text style={styles.chatLine}>
                    {c.phase} · {c.unitId || c.purpose || c.id.slice(0, 6)}
                  </Text>
                  <Text style={styles.chatMeta}>
                    turns {c.turns} · {c.tokensIn + c.tokensOut} tok · last {fmtAgo(c.lastTurnAt)}
                  </Text>
                  {c.dsSessionId && (
                    <Text style={styles.chatSession}>session {c.dsSessionId.slice(0, 8)}…</Text>
                  )}
                </Pressable>
                <Pressable onPress={() => closeChat(c.id)} style={styles.killBtn}>
                  <Text style={styles.killText}>ABORT</Text>
                </Pressable>
              </View>
            ))}

            {expanded && turns.length > 0 && (
              <View style={styles.turnsBlock}>
                <Text style={styles.sectionTitle}>TRANSCRIPT · {turns.length} turns</Text>
                {turns.map((t) => (
                  <View key={t.id} style={styles.turnRow}>
                    <Text style={styles.turnMeta}>
                      #{t.turnIndex} {t.role} · {t.tokens} tok · {t.elapsedMs}ms {t.error ? 'ERR' : ''}
                    </Text>
                    <Text style={styles.turnBody} numberOfLines={6}>
                      {t.content || ('(no content) ' + (t.error || ''))}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.sectionTitle}>RECENT</Text>
            {snap.recent.length === 0 && (
              <Text style={styles.emptyLine}>No chat history yet.</Text>
            )}
            {snap.recent.slice(0, 30).map((c) => (
              <View key={c.id} style={styles.chatRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.chatLine}>
                    [{c.state}] {c.phase} · {c.unitId || c.purpose || c.id.slice(0, 6)}
                  </Text>
                  <Text style={styles.chatMeta}>
                    {c.turns} turns · {c.elapsedMs}ms · {fmtTime(c.startedAt)}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
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
  statsBlock: {
    padding: spacing.md, marginBottom: spacing.sm,
    backgroundColor: colors.surface, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  statsLabel: {
    color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 10,
    letterSpacing: 2, marginBottom: 4,
  },
  statsValue: {
    color: colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 11,
    lineHeight: 16,
  },
  sectionTitle: {
    color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 10,
    letterSpacing: 2, marginTop: spacing.md, marginBottom: spacing.sm,
  },
  emptyLine: {
    color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 11,
    paddingVertical: 6,
  },
  chatRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  chatLine: {
    color: colors.textPrimary, fontFamily: 'Inter-Medium', fontSize: 12,
  },
  chatMeta: {
    color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 10,
    marginTop: 2,
  },
  chatSession: {
    color: colors.textTertiary, fontFamily: 'JetBrainsMono-Regular', fontSize: 9,
    marginTop: 2,
  },
  killBtn: {
    borderWidth: 1, borderColor: colors.danger,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  killText: {
    color: colors.danger, fontFamily: 'Inter-SemiBold', fontSize: 9, letterSpacing: 1,
  },
  turnsBlock: {
    marginTop: spacing.sm, padding: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  turnRow: {
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  turnMeta: {
    color: colors.accent, fontFamily: 'JetBrainsMono-Regular', fontSize: 9,
    marginBottom: 2,
  },
  turnBody: {
    color: colors.textPrimary, fontFamily: 'JetBrainsMono-Regular', fontSize: 10,
    lineHeight: 14,
  },
});
