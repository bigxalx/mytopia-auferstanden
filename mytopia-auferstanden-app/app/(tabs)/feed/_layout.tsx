import { Stack } from 'expo-router';

import { createNativeTabStackOptions } from '@/src/shared/navigation/nativeTabStackOptions';

export default function FeedTabLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={createNativeTabStackOptions({
          largeTitle: true,
          title: 'Notfallkanal',
        })}
      />
    </Stack>
  );
}
