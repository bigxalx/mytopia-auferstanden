import { Stack } from 'expo-router';
import { theme } from '@/src/shared/ui/theme';

export default function FeedTabLayout() {
  return <Stack screenOptions={{ contentStyle: { backgroundColor: theme.colors.background } }} />;
}
