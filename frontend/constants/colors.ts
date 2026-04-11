/**
 * SwipeTurn design token system.
 * Import from here — never hardcode colors inline in components.
 *
 * Usage:
 *   import { COLORS, COLORS_ALPHA } from '@/constants/colors';
 *   style={{ color: COLORS.textPrimary, backgroundColor: COLORS.background }}
 */

export const COLORS = {
  // Brand
  accent: '#FF4422',
  accentSuccess: '#10B981',

  // Text
  textPrimary: '#111827',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  textMeta: '#9CA3AF',

  // Backgrounds & Surfaces
  background: '#F8F9FA',
  backgroundWhite: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FAFB',
  surface2: '#F3F4F6',

  // Tints (soft colored backgrounds for chips, badges, icons)
  accentTint: '#FFF8F7',
  successTint: '#ECFDF5',

  // Border
  border: '#E5E7EB',

  // Shadows
  shadow: '#000000',
} as const;

/** Pre-built rgba values for overlays, badges, and borders */
export const COLORS_ALPHA = {
  accentBorder: 'rgba(255, 68, 34, 0.40)',
  accentLight: 'rgba(255, 68, 34, 0.10)',
  accentMedium: 'rgba(255, 68, 34, 0.15)',
  successLight: 'rgba(16, 185, 129, 0.10)',
  successMedium: 'rgba(16, 185, 129, 0.15)',
} as const;

export type ColorKey = keyof typeof COLORS;
export type ColorAlphaKey = keyof typeof COLORS_ALPHA;
