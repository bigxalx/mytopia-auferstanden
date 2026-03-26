import { Stack } from 'expo-router';
import { theme } from '@/src/shared/ui/theme';
import { Platform } from 'react-native';

export default function MapTabLayout() {
  console.log('[DEBUG] MapTabLayout Rendering - map usually has only blurEffect');
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          // iOS
          ...(Platform.OS === 'ios'
            // Before iOS 26 -- No Liquid Glass
            ? parseFloat(String(Platform.Version)) < 26 && {
            } :
            // Android
            {
              headerStyle: {
                backgroundColor: theme.colors.background,
              },
            }
          ),
          headerTintColor: theme.colors.textPrimary,
          headerTitleStyle: {
            color: theme.colors.textPrimary,
            fontFamily: theme.typography.title.fontFamily,
          },
          title: 'Karte',
          headerTransparent: true,
          headerBlurEffect: 'systemThickMaterialDark',

        }}
      />
    </Stack>
  );
}
