import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';

interface PanelProps {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  rightAccessory?: React.ReactNode;
  noPadding?: boolean;
}

export function Panel({ title, children, style, rightAccessory, noPadding }: PanelProps) {
  return (
    <View style={[styles.container, style]}>
      {title !== undefined && (
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {rightAccessory !== undefined && <View>{rightAccessory}</View>}
        </View>
      )}
      <View style={[styles.body, noPadding && styles.noPadding]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' as const },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceElevated },
  title: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, letterSpacing: 1.5, color: colors.textTertiary, textTransform: 'uppercase' as const },
  body: { padding: spacing.md, minHeight: 0, minWidth: 0 },
  noPadding: { padding: 0 },
});
