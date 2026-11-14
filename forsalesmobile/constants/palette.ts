// Brand palette shared with the e-commerce customer app
// (mobileapp/lib/app/theme/app_colors.dart): white surfaces, orange primary.
export const Palette = {
  primary: '#FF6B00',
  primaryDark: '#EA580C',
  primaryGradientEnd: '#FF9A4D',
  primaryLight: '#FFF7ED',
  primaryContainer: '#FFEDD5',
  primaryBorder: '#FED7AA',
  primaryMuted: '#FDBA74',

  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F9FAFB',

  // Text is black/grey; orange is only for actions and highlights
  textPrimary: '#111827',
  textLabel: '#374151',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textOnPrimary: '#FFFFFF',

  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  divider: '#F3F4F6',

  success: '#16A34A',
  warning: '#D97706',
  error: '#DC2626',
  info: '#2563EB',
} as const;

// Tamagui's orange scale, remapped so every `$orangeN` token in the screens
// follows the palette: 1-2 white/neutral backgrounds, 3 a light orange tint,
// 4-5 grey borders, 6 orange border, 7 neutral shadow, 8-10 orange,
// 11-12 dark grey and black text.
export const orangeScale = {
  orange1: Palette.background,
  orange2: Palette.surfaceMuted,
  orange3: Palette.primaryLight,
  orange4: Palette.border,
  orange5: Palette.border,
  orange6: Palette.primaryMuted,
  orange7: Palette.borderStrong,
  orange8: Palette.primaryGradientEnd,
  orange9: Palette.primary,
  orange10: Palette.primaryDark,
  orange11: Palette.textLabel,
  orange12: Palette.textPrimary,
} as const;
