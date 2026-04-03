import { Stack } from 'expo-router';

import { createNativeTabStackOptions } from '@/src/shared/navigation/nativeTabStackOptions';
import { theme } from '@/src/shared/ui/theme';

export default function MapTabLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: theme.colors.background } }}>
      <Stack.Screen
        name="index"
        options={createNativeTabStackOptions({
          title: 'Karte',
          largeTitle: false,
        })}
      />
    </Stack>
  );
}
