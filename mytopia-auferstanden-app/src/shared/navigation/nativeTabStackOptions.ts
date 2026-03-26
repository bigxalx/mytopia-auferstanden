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
    if (variant === 'overlay') {
      return {
        title,
        headerBlurEffect: 'systemThinMaterialDark' as const,
        headerLargeTitle: largeTitle,
        headerLargeTitleShadowVisible: false,
        headerLargeTitleStyle: {
          color: theme.colors.textPrimary,
          fontFamily: 'NunitoSans_700Bold',
        },
        headerShadowVisible: false,
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: {
          color: theme.colors.textPrimary,
          fontFamily: 'NunitoSans_700Bold',
        },
        headerTransparent: true,
      };
    }

    return {
      title,
      headerLargeTitle: largeTitle,
      headerLargeTitleShadowVisible: false,
      headerLargeTitleStyle: {
        color: theme.colors.textPrimary,
        fontFamily: 'NunitoSans_700Bold',
      },
      headerShadowVisible: false,
      headerTransparent: true,
      headerBlurEffect: 'systemThinMaterialDark' as const,
      headerTintColor: theme.colors.textPrimary,
      headerTitleStyle: {
        color: theme.colors.textPrimary,
        fontFamily: 'NunitoSans_700Bold',
      },
    };
  }

  return {
    title,
    headerShadowVisible: false,
    headerStyle: {
      backgroundColor: theme.colors.headerBackground,
    },
    headerTintColor: theme.colors.textPrimary,
    headerTitleStyle: {
      color: theme.colors.textPrimary,
      fontFamily: 'NunitoSans_700Bold',
    },
  };
}
