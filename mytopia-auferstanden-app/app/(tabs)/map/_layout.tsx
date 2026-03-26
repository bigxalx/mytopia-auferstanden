import { Stack } from 'expo-router';

import { createNativeTabStackOptions } from '@/src/shared/navigation/nativeTabStackOptions';

export default function MapTabLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={createNativeTabStackOptions({
          title: 'Karte',
          variant: 'overlay',
        })}
      />
    </Stack>
  );
}
