import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Pressable,
} from 'react-native';
import { getDb } from '@/db/client';
import { guard } from '@/pipeline/resilience/guard';
import { DB_NAME } from '@/db/schema';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';

interface SysStats {
  jobsTotal: number;
  jobsRunning: number;
  jobsDone: number;
  eventsTotal: number;
  httpTotal: number;
  metricsTotal: number;
  lastEventTs: number | null;
  lastHttpTs: number | null;
  dbUserVersion: number;
}

async function load(): Promise<SysStats> {
  const db = await getDb();
  const count = async (sql: string): Promise<number> => {
    const r = await db.getFirstAsync<{ n: number }>(sql).catch(() => ({ n: 0 }));
    return r?.n ?? 0;
  };
  const first = async (sql: string): Promise<any> =>
    await db.getFirstAsync<any>(sql).catch(() => null);

  return {
    jobsTotal: await count('SELECT COUNT(*) AS n FROM pipeline_jobs'),
    jobsRunning: await count("SELECT COUNT(*) AS n FROM pipeline_jobs WHERE state NOT IN ('done','failed','cancelled')"),
    jobsDone: await count("SELECT COUNT(*) AS n FROM pipeline_jobs WHERE state = 'done'"),
    eventsTotal: await count('SELECT COUNT(*) AS n FROM event_log'),
    httpTotal: await count('SELECT COUNT(*) AS n FROM http_log'),
    metricsTotal: await count('SELECT COUNT(*) AS n FROM metric_snapshots'),
    lastEventTs: (await first('SELECT ts FROM event_log ORDER BY ts DESC LIMIT 1'))?.ts ?? null,
    lastHttpTs: (await first('SELECT ts FROM http_log ORDER BY ts DESC LIMIT 1'))?.ts ?? null,
    dbUserVersion: (await first('PRAGMA user_version'))?.user_version ?? 0,
  };
}

function ago(ts: number | null): string {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export default function SystemTab() {
  const [s, setS] = useState<SysStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const refreshSilent = useCallback(async () => {
    try { setS(await load()); } catch { setS(null); }
  }, []);

  const refreshManual = useCallback(async () => {
    setRefreshing(true); await refreshSilent(); setRefreshing(false);
  }, [refreshSilent]);

  useEffect(() => {
    void refreshSilent();
    const t = setInterval(() => { void refreshSilent(); }, 3000);
    return () => clearInterval(t);
  }, [refreshSilent]);

  const dumpToDisk = useCallback(async () => {
    try {
      const db = await getDb();
      const tables = [
        'pipeline_jobs','pipeline_phases','findings',
        'modifications','event_log','http_log','metric_snapshots',
      ];
      const bundle: Record<string, any[]> = {};
      let totalRows = 0;
      for (const t of tables) {
        try {
          const rows = await db.getAllAsync<any>('SELECT * FROM ' + t + ' ORDER BY rowid DESC LIMIT 500');
          bundle[t] = rows; totalRows += rows.length;
        } catch (e) { bundle[t] = [{ __error: String(e) }]; }
      }
      const json = JSON.stringify({ exportedAt: Date.now(), tables: bundle }, null, 2);
      const path = '/storage/emulated/0/Download/modkit-dumps/db-dump-' + Date.now() + '.json';
      const r = await fetch('http://127.0.0.1:8792/file/write', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, content: json }),
      }).then(x => x.json());
      setStatus(r.ok ? ('DUMP OK · ' + tables.length + ' tables · ' + totalRows + ' rows → ' + path) : ('DUMP FAIL · ' + (r.error || 'unknown')));
    } catch (e) {
      setStatus('DUMP FAIL · ' + (e instanceof Error ? e.message : String(e)));
    }
  }, []);

  const callTool = useCallback(async (tool: string, okMsg: (j: any) => string) => {
    try {
      const r = await fetch('http://127.0.0.1:8792/tool/' + tool, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      }).then(x => x.json());
      setStatus(r.ok ? okMsg(r) : ('FAIL · ' + (r.error || 'unknown')));
    } catch (e) {
      setStatus('FAIL · ' + (e instanceof Error ? e.message : String(e)).slice(0, 180));
    }
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · SYSTEM</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshManual} tintColor={colors.accent} />}
      >
        <View style={styles.block}>
          <Text style={styles.blockLabel}>JOBS</Text>
          <View style={styles.grid}>
            <View style={styles.gridCell}><Text style={styles.gridNum}>{s?.jobsTotal ?? 0}</Text><Text style={styles.gridLabel}>total</Text></View>
            <View style={styles.gridCell}><Text style={styles.gridNum}>{s?.jobsRunning ?? 0}</Text><Text style={styles.gridLabel}>running</Text></View>
            <View style={styles.gridCell}><Text style={styles.gridNum}>{s?.jobsDone ?? 0}</Text><Text style={styles.gridLabel}>done</Text></View>
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>MONITORING</Text>
          <View style={styles.grid}>
            <View style={styles.gridCell}><Text style={styles.gridNum}>{s?.eventsTotal ?? 0}</Text><Text style={styles.gridLabel}>events</Text></View>
            <View style={styles.gridCell}><Text style={styles.gridNum}>{s?.httpTotal ?? 0}</Text><Text style={styles.gridLabel}>http</Text></View>
            <View style={styles.gridCell}><Text style={styles.gridNum}>{s?.metricsTotal ?? 0}</Text><Text style={styles.gridLabel}>metrics</Text></View>
          </View>
          <Text style={styles.blockMeta}>
            {'last event: ' + ago(s?.lastEventTs ?? null) + ' · last http: ' + ago(s?.lastHttpTs ?? null)}
          </Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>DIAGNOSTICS</Text>
          <Pressable onPress={dumpToDisk} style={styles.testBtn}>
            <Text style={styles.testBtnText}>DUMP DB + LOGS</Text>
          </Pressable>
          <Pressable
            onPress={() => callTool('debug_dump', r => ('DEBUG DUMP OK · ' + r.path + ' · ' + r.events + ' events'))}
            style={[styles.testBtn, { marginTop: 6, backgroundColor: '#1A3A5C' }]}
          >
            <Text style={[styles.testBtnText, { color: colors.accent }]}>DUMP DEBUG LOG</Text>
          </Pressable>
          <Pressable
            onPress={() => callTool('debug_counters', r => ('total=' + r.total_events + ' uptime=' + r.uptime_s + 's'))}
            style={[styles.testBtn, { marginTop: 6, backgroundColor: '#1A3A5C' }]}
          >
            <Text style={[styles.testBtnText, { color: colors.accent }]}>SHOW DEBUG COUNTERS</Text>
          </Pressable>
          <Pressable
            onPress={() => callTool('debug_clear', r => ('DEBUG CLEARED · ' + r.cleared + ' events'))}
            style={[styles.testBtn, { marginTop: 6, backgroundColor: '#3A1A1A' }]}
          >
            <Text style={[styles.testBtnText, { color: '#FF9500' }]}>CLEAR DEBUG LOG</Text>
          </Pressable>
          {status && (
            <Text style={[styles.blockMeta, { marginTop: 10, color: status.startsWith('FAIL') ? colors.danger : colors.accent }]}>
              {status}
            </Text>
          )}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>RESILIENCE</Text>
          {(() => {
            const gs = guard.status();
            return (
              <>
                <Text style={styles.blockMeta}>
                  {'risk ' + (gs.risk.score * 100).toFixed(0) + '%' + (gs.risk.topMode ? ' · ' + gs.risk.topMode : '')}
                </Text>
                <Text style={styles.blockMeta}>{'delay ' + gs.currentDelayMs + 'ms · retries ' + gs.retryBudget}</Text>
                {gs.paused && <Text style={[styles.blockMeta, { color: colors.danger }]}>PAUSED — {gs.pausedReason}</Text>}
                {gs.recentHeals.slice(-3).map((h, i) => (
                  <Text key={i} style={styles.blockMeta}>{'· ' + h.mitigation + ' ' + (h.applied ? 'applied' : 'suppressed')}</Text>
                ))}
              </>
            );
          })()}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>DATABASE</Text>
          <Text style={styles.blockValue}>{DB_NAME}</Text>
          <Text style={styles.blockMeta}>{'schema v' + (s?.dbUserVersion ?? '?') + ' · WAL · foreign_keys ON'}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  topBar: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  topBarTitle: { color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 2 },
  content: { padding: spacing.md },
  block: { marginBottom: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  blockLabel: { color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 10, letterSpacing: 2, marginBottom: 8 },
  blockValue: { color: colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 12, marginBottom: 4 },
  blockMeta: { color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16, marginTop: 6 },
  grid: { flexDirection: 'row', marginTop: 6, marginBottom: 4 },
  gridCell: { flex: 1, alignItems: 'center' },
  gridNum: { color: colors.accent, fontFamily: 'Inter-SemiBold', fontSize: 20 },
  gridLabel: { color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 9, letterSpacing: 1, marginTop: 2 },
  testBtn: { backgroundColor: colors.accent, borderRadius: 6, paddingVertical: 10, alignItems: 'center', marginTop: 6 },
  testBtnText: { color: colors.pureBlack, fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 1 },
});
