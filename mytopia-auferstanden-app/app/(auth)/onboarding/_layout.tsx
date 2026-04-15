import { Stack } from 'expo-router';

import { theme } from '@/src/shared/ui/theme';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'default',
        contentStyle: { backgroundColor: theme.colors.beige },
        gestureEnabled: false,
        headerShown: false,
      }}
    />
  );
}
