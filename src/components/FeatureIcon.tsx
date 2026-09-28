import React from 'react';
import { colors } from '@/theme/colors';
import {
  Fingerprint, Cpu, Network, Activity, EyeOff, Sparkles, Box,
  AlertTriangle, Share2, Trash2, Rewind, ShieldCheck, Lightbulb,
  GraduationCap, Users, TrendingDown, Zap, Cloud, GitBranch,
  Shuffle, Gauge, Share, Swords,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

const iconMap: Record<string, LucideIcon> = {
  Fingerprint, Cpu, Network, Activity, EyeOff, Sparkles, Box,
  AlertTriangle, Share2, Trash2, Rewind, ShieldCheck, Lightbulb,
  GraduationCap, Users, TrendingDown, Zap, Cloud, GitBranch,
  Shuffle, Gauge, Share, Swords,
};

interface FeatureIconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function FeatureIcon({ name, size = 22, color = colors.accent, strokeWidth = 2 }: FeatureIconProps) {
  const Icon = iconMap[name] ?? Sparkles;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}
