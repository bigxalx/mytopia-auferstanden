export const theme = {
  colors: {
    background: '#252b30',
    headerBackground: '#3f454a',
    headerBorder: '#1f2937',
    textPrimary: '#eef2ef',
    textSecondary: '#9ca3af',
    accent: '#B1C2D2', // Default blue
    orange: '#f97316',
    charcoal: '#586161',
    beige: '#EDECE0', // Notfallkanal bubble color
  },
  typography: {
    /** 
     * Unified Title style for Screen and MainHeader 
     * Matches Welcome Back / Notfallkanal aesthetic
     */
    title: {
      color: '#eef2ef',
      fontFamily: 'NunitoSans_700Bold',
      fontSize: 22,
      lineHeight: 28,
      textAlign: 'center' as const,
    },
    /**
     * Unified H1 style for card headers
     */
    h1: {
      color: '#454A4A',
      fontFamily: 'Nunito_700Bold',
      fontSize: 20,
      textAlign: 'center' as const,
      textTransform: 'uppercase' as const,
      marginBottom: 8,
    },
    /**
     * Unified button text style
     */
    button: {
      color: '#000000',
      fontFamily: 'Nunito_700Bold',
      fontSize: 15,
      textAlign: 'center' as const,
      textTransform: 'uppercase' as const,
    }
  }
};
