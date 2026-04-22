import { Redirect } from 'expo-router';

import { useSession } from '@/src/core/session/SessionContext';
import { BrandedLaunchScreen } from '@/src/shared/ui/BrandedLaunchScreen';

export default function IndexRoute() {
  const { isHydrated, shouldShowWelcomeBack, user } = useSession();

  if (!isHydrated) {
    return <BrandedLaunchScreen />;
  }

  if (!user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (shouldShowWelcomeBack) {
    return <Redirect href="./welcome-back" />;
  }

  return <Redirect href="/(tabs)/feed" />;
}
