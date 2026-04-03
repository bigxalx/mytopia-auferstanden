import { Stack } from 'expo-router';

import { createNativeTabStackOptions } from '@/src/shared/navigation/nativeTabStackOptions';
import { theme } from '@/src/shared/ui/theme';

export default function ProfileTabLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={createNativeTabStackOptions({
          title: 'Profil',
          largeTitle: false,
        })}
      />
      <Stack.Screen
        name="settings"
        options={{
          ...createNativeTabStackOptions({
            title: 'Einstellungen',
            largeTitle: false,
          }),
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
    </Stack>
  );
}
