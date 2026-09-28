import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/colors';

interface GlowCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  glowColor?: string;
  intensity?: number;
}

export function GlowCard({ children, style, glowColor = colors.accentGlow, intensity = 0.3 }: GlowCardProps) {
  return (
    <View style={[styles.wrapper, style]}>
      <LinearGradient
        colors={[glowColor, 'rgba(0,0,0,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.glow, { opacity: intensity }]}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' as const, borderRadius: 12, overflow: 'hidden' as const, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: 0, minWidth: 0, flexGrow: 0, flexShrink: 0, flexBasis: 'auto', alignSelf: 'auto', aspectRatio: undefined, zIndex: 0, elevation: 0 },
  glow: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 },
  content: { position: 'relative' as const, zIndex: 1, padding: 14, minHeight: 0, minWidth: 0, flexGrow: 0, flexShrink: 0, flexBasis: 'auto', alignSelf: 'auto', aspectRatio: undefined },
});
