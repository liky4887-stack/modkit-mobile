import { colors } from './colors';

export const gradients = {
  surfaceGlow: [colors.surface, colors.pureBlack] as const,
  accentGlow: [colors.accentGlow, 'rgba(0,0,0,0)'] as const,
  dangerGlow: [colors.dangerGlow, 'rgba(0,0,0,0)'] as const,
  cyanGlow: [colors.cyanGlow, 'rgba(0,0,0,0)'] as const,
  amberGlow: [colors.amberGlow, 'rgba(0,0,0,0)'] as const,
  purpleGlow: [colors.purpleGlow, 'rgba(0,0,0,0)'] as const,
  topBarFade: [colors.pureBlack, 'rgba(0,0,0,0)'] as const,
  bottomBarFade: ['rgba(0,0,0,0)', colors.pureBlack] as const,
  cardGlow: [colors.surfaceElevated, colors.pureBlack] as const,
} as const;

export type GradientKey = keyof typeof gradients;
