import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Pressable,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';
import { chatRegistry, ChatRecord, TurnRecord } from '@/chat/chatRegistry';
import { pipelineStore } from '@/pipeline/pipelineStore';

interface JobGroup {
  jobId: string;
  jobName: string;
  chats: ChatRecord[];
  stats: {
    total: number; open: number; done: number; failed: number;
    turns: number; tokensIn: number; tokensOut: number;
  };
}

function fmtAgo(ts: number | null): string {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'now';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
}

export default function ChatsTab() {
  const [groups, setGroups] = useState<JobGroup[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedChat, setExpandedChat] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [turns, setTurns] = useState<TurnRecord[]>([]);

  const load = useCallback(async () => {
    try {
      const byJob = await chatRegistry.listGroupedByJob(48);
      const out: JobGroup[] = [];
      for (const jobId of Object.keys(byJob)) {
        const chats = byJob[jobId];
        const stats = await chatRegistry.jobChatStats(jobId);
        let jobName = jobId.slice(0, 8);
        try {
          const job = await pipelineStore.getJob(jobId);
          if (job) jobName = job.apkName || job.apkPath.split('/').pop() || jobId.slice(0, 8);
        } catch {}
        out.push({ jobId, jobName, chats, stats });
      }
      // Sort groups by most recent chat activity
      out.sort((a, b) => {
        const aLast = Math.max(...a.chats.map(c => c.lastTurnAt || c.startedAt));
        const bLast = Math.max(...b.chats.map(c => c.lastTurnAt || c.startedAt));
        return bLast - aLast;
      });
      setGroups(out);
    } catch {
      setGroups([]);
    }
  }, []);

  const refreshSilent = useCallback(() => { void load(); }, [load]);

  const refreshManual = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    void load();
    const t = setInterval(refreshSilent, 3000);
    return () => clearInterval(t);
  }, [load, refreshSilent]);

  const viewTurns = async (chatId: string) => {
    if (expandedChat === chatId) {
      setExpandedChat(null);
      setTurns([]);
      return;
    }
    const rows = await chatRegistry.listTurns(chatId, 200);
    setTurns(rows);
    setExpandedChat(chatId);
    setExpandedJob(null);
  };

  const toggleJob = (jobId: string) => {
    setExpandedJob(expandedJob === jobId ? null : jobId);
    setExpandedChat(null);
    setTurns([]);
  };

  const closeChat = async (chatId: string) => {
    await chatRegistry.abort(chatId, 'user_cancelled');
    void load();
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · PIPELINE CHATS</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshManual} tintColor={colors.accent} />}
      >
        {groups.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>NO PIPELINE CHATS</Text>
            <Text style={styles.emptySub}>
              Every chat that runs as part of a pipeline job appears here,
              grouped by job. Fire a job from the JOBS tab.
            </Text>
          </View>
        )}

        {groups.map((g) => {
          const isOpen = expandedJob === g.jobId;
          const jobAge = g.chats[g.chats.length - 1]?.lastTurnAt || g.chats[0]?.startedAt || null;
          return (
            <View key={g.jobId} style={styles.groupBlock}>
              <Pressable onPress={() => toggleJob(g.jobId)} style={styles.groupHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupTitle} numberOfLines={1}>{g.jobName}</Text>
                  <Text style={styles.groupMeta}>
                    {g.chats.length} chats · {g.stats.turns} turns · {g.stats.tokensIn + g.stats.tokensOut} tok · {fmtAgo(jobAge)}
                  </Text>
                </View>
                <Text style={styles.groupChevron}>{isOpen ? '▾' : '▸'}</Text>
              </Pressable>

              <View style={styles.badgeRow}>
                {g.stats.open > 0 && <Text style={[styles.badge, styles.badgeOpen]}>{g.stats.open} open</Text>}
                {g.stats.done > 0 && <Text style={[styles.badge, styles.badgeDone]}>{g.stats.done} done</Text>}
                {g.stats.failed > 0 && <Text style={[styles.badge, styles.badgeFail]}>{g.stats.failed} failed</Text>}
              </View>

              {isOpen && (
                <View style={styles.chatsList}>
                  {g.chats.map((c) => {
                    const isExpanded = expandedChat === c.id;
                    return (
                      <View key={c.id} style={styles.chatRow}>
                        <Pressable onPress={() => viewTurns(c.id)} style={{ flex: 1 }}>
                          <View style={styles.chatLine}>
                            <Text style={styles.chatPhase}>{c.phase}</Text>
                            <Text style={styles.chatUnit} numberOfLines={1}>
                              {c.unitId ? c.unitId.slice(0, 40) : (c.purpose || '—')}
                            </Text>
                          </View>
                          <Text style={styles.chatMeta}>
                            [{c.state}] {c.turns} turns · {c.elapsedMs}ms · {fmtAgo(c.lastTurnAt || c.startedAt)}
                          </Text>
                        </Pressable>
                        {c.state === 'open' && (
                          <Pressable onPress={() => closeChat(c.id)} style={styles.killBtn}>
                            <Text style={styles.killText}>ABORT</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {expandedChat && g.chats.some(c => c.id === expandedChat) && (
                <View style={styles.turnsBlock}>
                  <Text style={styles.turnsTitle}>TRANSCRIPT · {turns.length} turns</Text>
                  {turns.map((t) => (
                    <View key={t.id} style={styles.turnRow}>
                      <Text style={styles.turnMeta}>
                        #{t.turnIndex} {t.role} · {t.tokens} tok · {t.elapsedMs}ms {t.error ? '· ERR' : ''}
                      </Text>
                      <Text style={styles.turnBody} numberOfLines={8}>
                        {t.content || ('(no content) ' + (t.error || ''))}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
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
  empty: { marginTop: 80, alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyTitle: {
    color: colors.textTertiary, fontFamily: 'Inter-SemiBold', fontSize: 13,
    letterSpacing: 2, marginBottom: spacing.sm,
  },
  emptySub: {
    color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 11,
    lineHeight: 16, textAlign: 'center', opacity: 0.7,
  },
  groupBlock: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  groupTitle: {
    color: colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 13,
  },
  groupMeta: {
    color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 10,
    marginTop: 2,
  },
  groupChevron: {
    color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 14, marginLeft: 8,
  },
  badgeRow: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },
  badge: {
    fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  badgeOpen: { color: colors.accent, backgroundColor: 'rgba(0,255,136,0.08)' },
  badgeDone: { color: colors.textTertiary, backgroundColor: 'rgba(255,255,255,0.04)' },
  badgeFail: { color: colors.danger, backgroundColor: 'rgba(255,80,80,0.08)' },
  chatsList: {
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  chatRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  chatLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  chatPhase: {
    color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 10,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  chatUnit: {
    color: colors.textPrimary, fontFamily: 'Inter-Medium', fontSize: 11,
    flexShrink: 1,
  },
  chatMeta: {
    color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 10,
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
    margin: spacing.sm, padding: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  turnsTitle: {
    color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 10,
    letterSpacing: 2, marginBottom: 8,
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
