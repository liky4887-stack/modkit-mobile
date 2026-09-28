import React from 'react';
import { View, Text, StyleSheet, type TextStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';
import type { LogEntry } from '@/types';

const levelColors: Record<LogEntry['level'], string> = {
  info: colors.info,
  warn: colors.warning,
  error: colors.danger,
  success: colors.accent,
  debug: colors.textTertiary,
};

const levelLabels: Record<LogEntry['level'], string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERR ',
  success: 'OK  ',
  debug: 'DBG ',
};

interface LogLineProps {
  entry: LogEntry;
  style?: TextStyle;
}

export function LogLine({ entry, style }: LogLineProps) {
  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false });
  const color = levelColors[entry.level];

  return (
    <View style={styles.row}>
      <Text style={styles.timestamp}>{time}</Text>
      <Text style={[styles.level, { color }]}>{levelLabels[entry.level]}</Text>
      <Text style={styles.source}>{entry.source.slice(0, 18).padEnd(18, ' ')}</Text>
      <Text style={[styles.message, style]} numberOfLines={1}>{entry.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, paddingVertical: 2, paddingHorizontal: spacing.sm, gap: 6 },
  timestamp: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary, minWidth: 64 },
  level: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, minWidth: 36 },
  source: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textSecondary, minWidth: 90 },
  message: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textPrimary, flex: 1, flexShrink: 1 },
});
