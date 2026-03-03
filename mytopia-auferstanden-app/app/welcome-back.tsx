import { Redirect } from 'expo-router';

import { useSession } from '@/src/core/session/SessionContext';
import { WelcomeBackScreen } from '@/src/features/auth/screens/WelcomeBackScreen';

export default function WelcomeBackRoute() {
  const { shouldShowWelcomeBack, user } = useSession();

  if (!user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (!shouldShowWelcomeBack || !user.legacySummary) {
    return <Redirect href="/(tabs)/feed" />;
  }

  return <WelcomeBackScreen />;
}
