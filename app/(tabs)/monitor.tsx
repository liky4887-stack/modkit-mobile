import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme';

export default function MonitorTab() {
  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MODKIT · MONITOR</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>NO EVENTS</Text>
          <Text style={styles.emptySub}>
            event_log + http_log persist in Session 02.{'\n'}
            This screen will stream every event, HTTP call, and SQLite write.
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
  empty: { marginTop: 80, alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyTitle: {
    color: colors.textTertiary,
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    letterSpacing: 3,
    marginBottom: spacing.sm,
  },
  emptySub: {
    color: colors.textTertiary,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'center',
    opacity: 0.7,
  },
});
