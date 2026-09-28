import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {subtitle !== undefined && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {actionLabel !== undefined && onAction !== undefined && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Text style={styles.action}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  left: { flex: 1 },
  title: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, letterSpacing: 1.5, color: colors.textTertiary, textTransform: 'uppercase' as const },
  subtitle: { fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  action: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: colors.accent, letterSpacing: 0.5 },
});
