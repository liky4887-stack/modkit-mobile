import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';

interface CodeBlockProps {
  lines: string[];
  label?: string;
  highlightLines?: number[];
}

export function CodeBlock({ lines, label, highlightLines = [] }: CodeBlockProps) {
  return (
    <View style={styles.container}>
      {label !== undefined && (
        <View style={styles.labelBar}>
          <View style={styles.dots}>
            <View style={[styles.dot, { backgroundColor: colors.danger }]} />
            <View style={[styles.dot, { backgroundColor: colors.warning }]} />
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
          </View>
          <Text style={styles.label}>{label}</Text>
        </View>
      )}
      <View style={styles.codeArea}>
        {lines.map((line, i) => (
          <View key={i} style={[styles.lineRow, highlightLines.includes(i) && styles.highlighted]}>
            <Text style={styles.lineNumber}>{i + 1}</Text>
            <Text style={styles.codeText} numberOfLines={1}>{line}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.pureBlack,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden' as const,
  },
  labelBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dots: {
    flexDirection: 'row' as const,
    gap: 6,
    marginRight: spacing.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: colors.textTertiary,
  },
  codeArea: {
    padding: spacing.sm,
  },
  lineRow: {
    flexDirection: 'row' as const,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
    borderRadius: 4,
  },
  highlighted: {
    backgroundColor: colors.accentGlow,
  },
  lineNumber: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: colors.textTertiary,
    width: 28,
    textAlign: 'right' as const,
    marginRight: spacing.sm,
    minWidth: 28,
  },
  codeText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
    color: colors.textPrimary,
    flex: 1,
    flexShrink: 1,
  },
});
