export const colors = {
  pureBlack: '#000000',
  surface: '#0A0A0B',
  surfaceElevated: '#111113',
  surfaceHover: '#161618',
  border: '#1E1E22',
  borderBright: '#2A2A30',
  borderGlow: '#3A3A44',

  textPrimary: '#E8E8EC',
  textSecondary: '#8A8A94',
  textTertiary: '#4A4A52',
  textDisabled: '#2E2E34',

  accent: '#00E5A0',
  accentDim: '#00B384',
  accentGlow: 'rgba(0, 229, 160, 0.15)',

  cyan: '#00D4FF',
  cyanGlow: 'rgba(0, 212, 255, 0.12)',

  amber: '#FFB020',
  amberGlow: 'rgba(255, 176, 32, 0.12)',

  danger: '#FF4757',
  dangerDim: '#C0392B',
  dangerGlow: 'rgba(255, 71, 87, 0.12)',

  warning: '#FFA502',
  warningGlow: 'rgba(255, 165, 2, 0.12)',

  success: '#2ED573',
  successGlow: 'rgba(46, 213, 115, 0.12)',

  info: '#54A0FF',
  infoGlow: 'rgba(84, 160, 255, 0.12)',

  purple: '#A55EEA',
  purpleGlow: 'rgba(165, 94, 234, 0.12)',
} as const;

export type ColorKey = keyof typeof colors;
