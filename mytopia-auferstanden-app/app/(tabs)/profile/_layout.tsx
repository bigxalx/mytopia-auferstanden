import { Stack } from 'expo-router';

import { createNativeTabStackOptions } from '@/src/shared/navigation/nativeTabStackOptions';

export default function ProfileTabLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={createNativeTabStackOptions({
          largeTitle: true,
          title: 'Profil',
        })}
      />
    </Stack>
  );
}
