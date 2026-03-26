import { theme } from '@/src/shared/ui/theme';
import { Stack, Link } from 'expo-router';
import { Platform, Pressable } from 'react-native';
import { SettingsBold } from '@/components/ui/SolarTabIcons';

export default function ProfileTabLayout() {
  console.log('[DEBUG] ProfileTabLayout Rendering - Expecting RNScreens warning if scrollEdgeEffects+blurEffect present');
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerRight: () => (
            <Link href="/(tabs)/profile/settings" asChild>
              <Pressable
                hitSlop={20}
              >
                <SettingsBold color={theme.colors.textPrimary} size={24} />
              </Pressable>
            </Link>
          ),
          // iOS
          ...(Platform.OS === 'ios'

            // Before iOS 26 -- No Liquid Glass
            ? parseFloat(String(Platform.Version)) < 26 && {
              headerBlurEffect: 'systemThickMaterialDark',
            } :

            // Android
            {
              headerStyle: {
                backgroundColor: theme.colors.background,
              },
            }
          ),
          headerLargeTitle: true,
          headerLargeTitleStyle: {
            color: theme.colors.textPrimary,
            fontFamily: theme.typography.title.fontFamily,
          },
          headerTintColor: theme.colors.textPrimary,
          headerTitleStyle: {
            color: theme.colors.textPrimary,
            fontFamily: theme.typography.title.fontFamily,

          },
          scrollEdgeEffects: {
            top: "hard",
          },
          title: 'Profil',

        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: 'Einstellungen',
          // iOS
          ...(Platform.OS === 'ios'
            ? parseFloat(String(Platform.Version)) < 26 && {
              headerBlurEffect: 'systemThickMaterialDark',
            } :
            {
              headerStyle: {
                backgroundColor: theme.colors.background,
              },
            }
          ),
          headerBackButtonDisplayMode: 'minimal',
          headerLargeTitle: true,
          headerLargeTitleStyle: {
            color: theme.colors.textPrimary,
            fontFamily: theme.typography.title.fontFamily,
          },
          scrollEdgeEffects: {
            top: "hard",
          },

          headerTintColor: theme.colors.textPrimary,
          headerTitleStyle: {
            color: theme.colors.textPrimary,
            fontFamily: theme.typography.title.fontFamily,
          },
        }}
      />
    </Stack>
  );
}
