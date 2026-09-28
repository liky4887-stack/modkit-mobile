import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
  color?: string;
  style?: ViewStyle;
}

export function StatCard({ label, value, unit, trend, color = colors.accent, style }: StatCardProps) {
  return (
    <View style={[styles.container, { borderColor: colors.border }, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color }]}>{value}</Text>
        {unit !== undefined && <Text style={styles.unit}>{unit}</Text>}
      </View>
      {trend !== undefined && (
        <View style={styles.trendRow}>
          <Text style={[styles.trend, { color: trend === 'up' ? colors.success : trend === 'down' ? colors.danger : colors.textSecondary }]}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, padding: spacing.sm + 2, flex: 1, minWidth: 0 },
  label: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: colors.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 4 },
  valueRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 2 },
  value: { fontFamily: 'JetBrainsMono-Bold', fontSize: 18, letterSpacing: -0.5 },
  unit: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: colors.textTertiary },
  trendRow: { marginTop: 2 },
  trend: { fontFamily: 'JetBrainsMono-Bold', fontSize: 12 },
});
