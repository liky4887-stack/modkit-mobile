import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';

export default function SystemTab() {
  const [health, setHealth] = useState<string>('checking…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('http://127.0.0.1:8790/deepseek/health');
        const json = await res.json();
        if (cancelled) return;
        const ok = json?.ok === true;
        const bearer = json?.status?.bearerValid === true;
        setHealth((ok ? 'BACKEND OK' : 'BACKEND DOWN') + ' · bearer ' + (bearer ? 'VALID' : 'INVALID'));
      } catch (e) {
        if (!cancelled) setHealth('BACKEND UNREACHABLE');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · SYSTEM</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.block}>
          <Text style={styles.blockLabel}>BACKEND</Text>
          <Text style={styles.blockValue}>http://127.0.0.1:8790</Text>
          <Text style={styles.blockMeta}>{health}</Text>
        </View>
        <View style={styles.block}>
          <Text style={styles.blockLabel}>DATA</Text>
          <Text style={styles.blockValue}>modkit.db · schema v8</Text>
          <Text style={styles.blockMeta}>WAL enabled · foreign_keys ON</Text>
        </View>
        <View style={styles.block}>
          <Text style={styles.blockLabel}>DIAGNOSTICS</Text>
          <Text style={styles.blockMeta}>
            Full SYSTEM tab (budget, prompt versions, cleanup, diagnostics){'\n'}
            wires in Session 12.
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
    marginBottom: 6,
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
  },
});
