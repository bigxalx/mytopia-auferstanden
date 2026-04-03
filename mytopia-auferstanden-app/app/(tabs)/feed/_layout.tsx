import { Stack } from 'expo-router';

import { createNativeTabStackOptions } from '@/src/shared/navigation/nativeTabStackOptions';
import { theme } from '@/src/shared/ui/theme';

export default function FeedTabLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: theme.colors.background } }}>
      <Stack.Screen
        name="index"
        options={createNativeTabStackOptions({
          title: 'Notfallkanal',
          largeTitle: false,
        })}
      />
    </Stack>
  );
}
