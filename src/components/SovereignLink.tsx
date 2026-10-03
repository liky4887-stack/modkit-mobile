import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { BookOpen, ChevronRight } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';

export function SovereignLink() {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.push('/sovereign-factory')}
      activeOpacity={0.7}
      style={styles.banner}
    >
      <BookOpen size={14} color={colors.accent} strokeWidth={2} />
      <Text style={styles.text}>SOVEREIGN FACTORY BLUEPRINT</Text>
      <ChevronRight size={14} color={colors.textTertiary} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accentGlow,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentDim,
  },
  text: {
    flex: 1,
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 1.2,
  },
});
