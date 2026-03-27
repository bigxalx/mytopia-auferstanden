import { TextStyle } from 'react-native';
import { DarkTheme } from '@react-navigation/native';

const colors = {
  background: '#252b30',
  headerBackground: '#3f454a',
  headerBorder: '#1f2937',
  textPrimary: '#eef2ef',
  textSecondary: '#9ca3af',
  accent: '#B1C2D2',
  orange: '#f97316',
  orangeAlpha: 'rgba(249, 115, 22, 0.2)',
  blue: '#3b82f6',
  blueAlpha: 'rgba(59, 130, 246, 0.2)',
  orangeSoft: 'rgba(249, 115, 22, 0.12)',
  orangeStroke: 'rgba(249, 115, 22, 0.4)',
  charcoal: '#586161',
  beige: '#EDECE0',
  cardBorder: '#d8dee8',
  cardSubtleBackground: '#f8fafc',
  cardTextHeading: '#454A4A',
  cardTextPrimary: '#111827',
  cardTextSecondary: '#586161',
  cardTextMuted: '#5d6979',
  inputBorder: '#596161',
  disabledSurface: '#4b5563',
  errorSurface: '#fef2f2',
  errorBorder: '#fecaca',
  errorText: '#991b1b',
  successSurface: '#ecfdf3',
  successBorder: '#a7f3d0',
  successText: '#166534',
  destructiveSurface: '#fff1f1',
  destructiveBorder: '#fca5a5',
  destructiveText: '#b42318',
  avatarFallback: '#64748b',
  avatarFallbackText: '#f8fafc',
  mediaSurface: '#374151',
  modalBackground: '#000000',
  overlaySoft: 'rgba(0, 0, 0, 0.3)',
  overlayStrong: 'rgba(0, 0, 0, 0.5)',
  overlayBorder: 'rgba(255, 255, 255, 0.2)',
} as const;

export const theme = {
  colors,
  typography: {
    /**
     * Unified Title style for Screen and MainHeader
     * Matches Welcome Back / Notfallkanal aesthetic
     */
    title: {
      color: colors.textPrimary,
      fontFamily: 'NunitoSans_700Bold',
      fontSize: 22,
      lineHeight: 28,
      textAlign: 'center',
      textTransform: 'uppercase',
    } as TextStyle,
    /**
     * Unified H1 style for card headers
     */
    h1: {
      color: colors.cardTextHeading,
      fontFamily: 'Nunito_700Bold',
      fontSize: 20,
      textAlign: 'center',
      textTransform: 'uppercase',
      marginBottom: 8,
    } as TextStyle,
    /**
     * Unified button text style
     */
    button: {
      color: colors.cardTextPrimary,
      fontFamily: 'Nunito_700Bold',
      fontSize: 15,
      textAlign: 'center',
      textTransform: 'uppercase',
    } as TextStyle
  }
};

/**
 * Custom React Navigation theme that extends DarkTheme but uses the app's
 * actual background colour. This prevents the near-black rgb(1,1,1) flash
 * that DarkTheme would show between tab switches before screen content renders.
 */
export const AppNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    // Navigator uses this as the screen container background — must match
    // the app background so there is no colour mismatch during transitions.
    background: colors.background,
    // Used for headers and the tab bar surface.
    card: colors.background,
    // Keep text readable against our background.
    text: colors.textPrimary,
    border: colors.headerBorder,
  },
};
