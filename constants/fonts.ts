/**
 * Font family constants for SwipTurn.
 * Fonts: Clash Display (headings) + Satoshi (body) from Fontshare.
 *
 * Usage: import { Fonts } from '@/constants/fonts';
 *        style={{ fontFamily: Fonts.heading }}
 */
export const Fonts = {
  /** Clash Display Bold — app name, big headings */
  heading: 'ClashDisplay-Bold',
  /** Clash Display SemiBold — job titles on cards */
  subheading: 'ClashDisplay-Semibold',
  /** Satoshi Regular — descriptions, chips, body text */
  body: 'Satoshi-Regular',
  /** Satoshi Medium — emphasized body text, buttons */
  bodyMedium: 'Satoshi-Medium',
  /** Satoshi Bold — match scores, numbers */
  number: 'Satoshi-Bold',
} as const;

export type FontFamily = typeof Fonts[keyof typeof Fonts];
