import { Platform } from 'react-native';

import { theme } from '@/src/shared/ui/theme';

type NativeTabStackOptionsConfig = {
  largeTitle?: boolean;
  title: string;
  variant?: 'overlay' | 'standard';
};

export function createNativeTabStackOptions({
  largeTitle = false,
  title,
  variant = 'standard',
}: NativeTabStackOptionsConfig) {
  if (Platform.OS === 'ios') {
    const isLegacyIOS = parseFloat(String(Platform.Version)) < 26;

    const commonOptions = {
      title,
      headerLargeTitle: largeTitle,
      headerLargeTitleShadowVisible: false,
      headerLargeTitleStyle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.typography.title.fontFamily,
      },
      headerShadowVisible: false,
      headerTintColor: theme.colors.textPrimary,
      headerTitleStyle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.typography.title.fontFamily,
        textTransform: 'uppercase' as const,
      },
      headerTransparent: false, // Unified: Always false
    };

    if (variant === 'overlay') {
      return {
        ...commonOptions,
        headerBlurEffect: 'systemThickMaterialDark' as const,
      };
    }

    return {
      ...commonOptions,
      headerBlurEffect: (isLegacyIOS ? 'systemThickMaterialDark' : undefined) as any,
    };
  }

  return {
    title,
    headerShadowVisible: false,
    headerStyle: {
      backgroundColor: theme.colors.background,
    },
    headerTintColor: theme.colors.textPrimary,
    headerTitleStyle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.typography.title.fontFamily,
      textTransform: 'uppercase' as const,
    },
  };
}
