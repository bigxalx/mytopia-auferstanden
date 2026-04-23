import { Stack } from 'expo-router';

import { createNativeTabStackOptions } from '@/src/shared/navigation/nativeTabStackOptions';
import { theme } from '@/src/shared/ui/theme';

export default function FeedTabLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: theme.colors.background } }}>
      <Stack.Screen
        name="index"
        options={createNativeTabStackOptions({
          title: 'Kanäle',
          largeTitle: false,
        })}
      />
      <Stack.Screen
        name="hub"
        options={createNativeTabStackOptions({
          title: 'Notfallkanal',
          largeTitle: false,
        })}
      />
      <Stack.Screen
        name="[channelId]"
        options={createNativeTabStackOptions({
          title: 'Kanal',
          largeTitle: false,
        })}
      />
      <Stack.Screen
        name="actors/[actorId]/index"
        options={createNativeTabStackOptions({
          title: 'Info',
          largeTitle: false,
        })}
      />
      <Stack.Screen
        name="actors/[actorId]/actions"
        options={{
          animation: 'fade',
          contentStyle: { backgroundColor: 'transparent' },
          headerShown: false,
          presentation: 'transparentModal',
        }}
      />
    </Stack>
  );
}
