import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TextInput,
} from 'react-native';
import * as SQLite from 'expo-sqlite';
import { colors } from '@/theme/colors';
import { Pressable } from 'react-native';
import { deepseekClient } from '@/chat/deepseekClient';
import { agentLoop } from '@/agent/agentLoop';
import { toolsClient } from '@/api/toolsClient';
import { chatRegistry } from '@/chat/chatRegistry';
import { spacing } from '@/theme';

interface SysStats {
  backendOk: boolean;
  bearerValid: boolean;
  cookiesLen: number;
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
  const db = await SQLite.openDatabaseAsync('modkit.db');

  let backendOk = false;
  let bearerValid = false;
  let cookiesLen = 0;
  try {
    const res = await fetch('http://127.0.0.1:8790/deepseek/health');
    const json: any = await res.json();
    backendOk = json?.ok === true;
    bearerValid = json?.status?.bearerValid === true;
    cookiesLen = json?.status?.cookiesLength ?? 0;
  } catch {}

  const count = async (sql: string, args: any[] = []): Promise<number> => {
    const r = await db.getFirstAsync<{ n: number }>(sql, args).catch(() => ({ n: 0 }));
    return r?.n ?? 0;
  };
  const first = async (sql: string, args: any[] = []): Promise<any> => {
    return await db.getFirstAsync<any>(sql, args).catch(() => null);
  };

  const jobsTotal = await count(`SELECT COUNT(*) AS n FROM pipeline_jobs`);
  const jobsRunning = await count(`SELECT COUNT(*) AS n FROM pipeline_jobs WHERE state NOT IN ('done','failed','cancelled')`);
  const jobsDone = await count(`SELECT COUNT(*) AS n FROM pipeline_jobs WHERE state = 'done'`);
  const eventsTotal = await count(`SELECT COUNT(*) AS n FROM event_log`);
  const httpTotal = await count(`SELECT COUNT(*) AS n FROM http_log`);
  const metricsTotal = await count(`SELECT COUNT(*) AS n FROM metric_snapshots`);

  const lastEvent = await first(`SELECT ts FROM event_log ORDER BY ts DESC LIMIT 1`);
  const lastHttp = await first(`SELECT ts FROM http_log ORDER BY ts DESC LIMIT 1`);
  const versionRow = await first(`PRAGMA user_version`);

  return {
    backendOk, bearerValid, cookiesLen,
    jobsTotal, jobsRunning, jobsDone,
    eventsTotal, httpTotal, metricsTotal,
    lastEventTs: lastEvent?.ts ?? null,
    lastHttpTs: lastHttp?.ts ?? null,
    dbUserVersion: versionRow?.user_version ?? 0,
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
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentQuery, setAgentQuery] = useState('Find every class that references the Sentry SDK and summarize what analytics data the app collects.');
  const [agentResult, setAgentResult] = useState<string | null>(null);
  const [agentSteps, setAgentSteps] = useState<string[]>([]);

  const dumpHttpToDisk = useCallback(async () => {
    try {
      const db = await SQLite.openDatabaseAsync('modkit-v2.db');

      const tables = [
        'pipeline_jobs',
        'pipeline_phases',
        'pipeline_units',
        'finding_investigations',
        'agent_steps',
        'finding_artifacts',
        'pipeline_chats',
        'event_log',
        'http_log',
      ];

      const bundle: Record<string, any[]> = {};
      let totalRows = 0;
      for (const t of tables) {
        try {
          const rows = await db.getAllAsync<any>(
            `SELECT * FROM ${t} ORDER BY rowid DESC LIMIT 500`
          );
          bundle[t] = rows;
          totalRows += rows.length;
        } catch (e) {
          bundle[t] = [{ __error: String(e) }];
        }
      }

      const json = JSON.stringify({
        exportedAt: Date.now(),
        tables: bundle,
      }, null, 2);

      const path = '/storage/emulated/0/Download/modkit-dumps/db-dump-' + Date.now() + '.json';
      const res = await fetch('http://127.0.0.1:8790/file/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, content: json }),
      }).then(r => r.json());

      if (res.ok) {
        setTestResult('DUMP OK · ' + tables.length + ' tables · ' + totalRows + ' rows → ' + path);
      } else {
        setTestResult('DUMP FAIL · ' + (res.error || 'unknown'));
      }
    } catch (e) {
      setTestResult('DUMP FAIL · ' + (e instanceof Error ? e.message : String(e)));
    }
  }, []);

  const runAgentTest = useCallback(async () => {
    setAgentBusy(true);
    setAgentResult(null);
    setAgentSteps([]);
    try {
      const r = await agentLoop.run({
        query: agentQuery,
      });
      setAgentSteps(r.steps.map((st, i) => {
        if (st.kind === 'tool') return `#${i}  tool ${st.tool}  (${st.elapsedMs}ms, ${st.resultChars}B)`;
        if (st.kind === 'final') return `#${i}  final`;
        return `#${i}  parse_error`;
      }));
      setAgentResult(
        `iterations=${r.iterations}  tools=${r.steps.filter(s => s.kind === 'tool').length}  ${r.totalMs}ms\n\n${r.final.slice(0, 1500)}`
      );
    } catch (e) {
      setAgentResult('FAIL · ' + (e instanceof Error ? e.message : String(e)));
    }
    setAgentBusy(false);
  }, [agentQuery]);
  const runDeepseekTest = useCallback(async () => {
    setTestBusy(true);
    setTestResult(null);
    try {
      const r = await deepseekClient.send(
        'Reply with exactly: PONG',
        { phase: 'diagnostic', purpose: 'system_test', maxRetries: 1, timeoutMs: 60000 }
      );
      const sessions = await chatRegistry.listRecent(3);
      setTestResult(
        'OK · ' + r.elapsedMs + 'ms · ' + r.content.slice(0, 40) +
        ' · chat=' + r.chatId.slice(0, 8) +
        ' · ds=' + (r.dsSessionId ? r.dsSessionId.slice(0, 8) : 'null') +
        ' · rows=' + sessions.length
      );
    } catch (e) {
      setTestResult('FAIL · ' + (e instanceof Error ? e.message : String(e)));
    }
    setTestBusy(false);
  }, []);

  const refreshSilent = useCallback(async () => {
    try { setS(await load()); } catch { setS(null); }
  }, []);

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
          <Text style={styles.blockLabel}>BACKEND</Text>
          <Text style={styles.blockValue}>http://127.0.0.1:8790</Text>
          <Text style={[styles.status, s?.backendOk ? styles.statusOk : styles.statusBad]}>
            {s?.backendOk ? '● ONLINE' : '● OFFLINE'}
          </Text>
          <Text style={styles.blockMeta}>
            bearer {s?.bearerValid ? 'valid' : 'invalid'} · cookies {s?.cookiesLen ?? 0} B
          </Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>JOBS</Text>
          <View style={styles.grid}>
            <View style={styles.gridCell}>
              <Text style={styles.gridNum}>{s?.jobsTotal ?? 0}</Text>
              <Text style={styles.gridLabel}>total</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridNum}>{s?.jobsRunning ?? 0}</Text>
              <Text style={styles.gridLabel}>running</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridNum}>{s?.jobsDone ?? 0}</Text>
              <Text style={styles.gridLabel}>done</Text>
            </View>
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>MONITORING</Text>
          <View style={styles.grid}>
            <View style={styles.gridCell}>
              <Text style={styles.gridNum}>{s?.eventsTotal ?? 0}</Text>
              <Text style={styles.gridLabel}>events</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridNum}>{s?.httpTotal ?? 0}</Text>
              <Text style={styles.gridLabel}>http</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridNum}>{s?.metricsTotal ?? 0}</Text>
              <Text style={styles.gridLabel}>metrics</Text>
            </View>
          </View>
          <Text style={styles.blockMeta}>
            last event: {ago(s?.lastEventTs ?? null)} · last http: {ago(s?.lastHttpTs ?? null)}
          </Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>DIAGNOSTICS</Text>
          <Pressable
            onPress={runDeepseekTest}
            disabled={testBusy}
            style={[styles.testBtn, testBusy && { opacity: 0.5 }]}
          >
            <Text style={styles.testBtnText}>
              {testBusy ? 'CALLING DEEPSEEK…' : 'TEST DEEPSEEK'}
            </Text>
          </Pressable>
          <Pressable
            onPress={dumpHttpToDisk}
            style={[styles.testBtn, { marginTop: 6 }]}
          >
            <Text style={styles.testBtnText}>DUMP DB + LOGS</Text>
          </Pressable>
          {testResult && (
            <Text style={[styles.blockMeta, { marginTop: 8, color: testResult.startsWith('OK') ? colors.accent : colors.danger }]}>
              {testResult}
            </Text>
          )}

        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>AGENT TEST</Text>
          <TextInput
            value={agentQuery}
            onChangeText={setAgentQuery}
            style={styles.agentInput}
            placeholder="Ask the agent to investigate something"
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
            editable={!agentBusy}
          />
          <Pressable
            onPress={runAgentTest}
            disabled={agentBusy}
            style={[styles.testBtn, { marginTop: 8 }, agentBusy && { opacity: 0.5 }]}
          >
            <Text style={styles.testBtnText}>
              {agentBusy ? 'AGENT RUNNING…' : 'RUN AGENT'}
            </Text>
          </Pressable>
          {agentSteps.length > 0 && (
            <View style={{ marginTop: 8 }}>
              {agentSteps.map((line, i) => (
                <Text key={i} style={styles.agentStep}>{line}</Text>
              ))}
            </View>
          )}
          {agentResult && (
            <Text style={[styles.blockMeta, { marginTop: 8, color: agentResult.startsWith('FAIL') ? colors.danger : colors.accent }]}>
              {agentResult}
            </Text>
          )}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>DATABASE</Text>
          <Text style={styles.blockValue}>modkit.db</Text>
          <Text style={styles.blockMeta}>
            schema v{s?.dbUserVersion ?? '?'} · WAL · foreign_keys ON
          </Text>
        </View>
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
  content: { padding: spacing.md },
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
  blockValue: {
    color: colors.textPrimary,
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    marginBottom: 4,
  },
  blockMeta: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    lineHeight: 16,
    marginTop: 6,
  },
  status: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 4,
  },
  statusOk: { color: colors.accent },
  statusBad: { color: colors.danger },
  grid: {
    flexDirection: 'row',
    marginTop: 6,
    marginBottom: 4,
  },
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
  testBtn: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  testBtnText: {
    color: colors.pureBlack,
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    letterSpacing: 1,
  },
  agentInput: {
    color: colors.textPrimary,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    backgroundColor: colors.pureBlack,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  agentStep: {
    color: colors.textTertiary,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    lineHeight: 14,
  },
});

// --- Verification Audit Integration ---
import { VerificationAuditView } from "../../src/components/VerificationAuditView";
