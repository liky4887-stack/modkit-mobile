import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Pressable,
} from 'react-native';
import * as SQLite from 'expo-sqlite';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';

interface UnifiedRow {
  kind: 'event' | 'http';
  ts: number;
  id: string;
  text: string;
  severity: 'info' | 'warn' | 'error';
}

async function loadRows(limit = 200): Promise<UnifiedRow[]> {
  const db = await SQLite.openDatabaseAsync('modkit.db');
  const rows: UnifiedRow[] = [];

  const events = await db.getAllAsync<any>(
    `SELECT id, ts, function_id, severity, action, payload_json
       FROM event_log ORDER BY ts DESC LIMIT ?`,
    [limit]
  );
  for (const e of events) {
    const sev: UnifiedRow['severity'] =
      e.severity === 'critical' ? 'error' :
      e.severity === 'warn' ? 'warn' : 'info';
    rows.push({
      kind: 'event',
      ts: e.ts,
      id: 'e' + e.id,
      severity: sev,
      text: '[event] ' + e.function_id + (e.action ? ' · ' + e.action : ''),
    });
  }

  const https = await db.getAllAsync<any>(
    `SELECT id, ts, method, path, res_status, duration_ms, error
       FROM http_log ORDER BY ts DESC LIMIT ?`,
    [limit]
  );
  for (const h of https) {
    const status = h.res_status !== null ? String(h.res_status) : 'ERR';
    const sev: UnifiedRow['severity'] =
      h.error ? 'error' :
      (h.res_status !== null && h.res_status >= 400) ? 'warn' : 'info';
    rows.push({
      kind: 'http',
      ts: h.ts,
      id: 'h' + h.id,
      severity: sev,
      text: '[http ' + status + '] ' + h.method + ' ' + h.path + ' (' + h.duration_ms + 'ms)'
        + (h.error ? ' ' + h.error : ''),
    });
  }

  rows.sort((a, b) => b.ts - a.ts);
  return rows.slice(0, limit);
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export default function MonitorTab() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [auto, setAuto] = useState(true);

  const refreshSilent = useCallback(async () => {
    try {
      const r = await loadRows(200);
      setRows(r);
    } catch {
      setRows([]);
    }
  }, []);

  const refreshManual = useCallback(async () => {
    setRefreshing(true);
    await refreshSilent();
    setRefreshing(false);
  }, [refreshSilent]);

  useEffect(() => { void refreshSilent(); }, [refreshSilent]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => { void refreshSilent(); }, 1500);
    return () => clearInterval(t);
  }, [auto, refreshSilent]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · MONITOR</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => setAuto((a) => !a)}
            style={[styles.pill, auto && styles.pillActive]}
          >
            <Text style={[styles.pillText, auto && styles.pillTextActive]}>
              {auto ? 'LIVE' : 'PAUSED'}
            </Text>
          </Pressable>
          <Pressable onPress={refreshManual} style={styles.pill}>
            <Text style={styles.pillText}>REFRESH</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.countRow}>
        <Text style={styles.countText}>{rows.length} rows</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshManual} tintColor={colors.accent} />}
      >
        {rows.length === 0 && !refreshing && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>NO EVENTS YET</Text>
            <Text style={styles.emptySub}>
              Events and HTTP calls appear here as they happen.
              Fire up a job or touch the backend to see lines flow.
            </Text>
          </View>
        )}
        {rows.map((r) => (
          <View key={r.id} style={styles.row}>
            <Text style={styles.rowTime}>{fmtTime(r.ts)}</Text>
            <Text
              style={[
                styles.rowText,
                r.severity === 'error' && { color: colors.danger },
                r.severity === 'warn' && { color: '#FFB84D' },
              ]}
              numberOfLines={3}
            >
              {r.text}
            </Text>
          </View>
        ))}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarTitle: {
    color: colors.accent,
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 2,
  },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillActive: { borderColor: colors.accent, backgroundColor: 'rgba(0,255,136,0.08)' },
  pillText: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    letterSpacing: 1,
  },
  pillTextActive: { color: colors.accent },
  countRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  countText: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 10,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.sm },
  row: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
    gap: 8,
  },
  rowTime: {
    color: colors.textTertiary,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 9,
    width: 82,
  },
  rowText: {
    color: colors.textPrimary,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    flex: 1,
    lineHeight: 14,
  },
  empty: { marginTop: 60, alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyTitle: {
    color: colors.textTertiary,
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  emptySub: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
});
