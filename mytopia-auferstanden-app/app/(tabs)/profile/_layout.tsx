import { Stack } from 'expo-router';
import { theme } from '@/src/shared/ui/theme';

export default function ProfileTabLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    />
  );
}
