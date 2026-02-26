import { Redirect } from 'expo-router';

import { useSession } from '@/src/core/session/SessionContext';
import { SignInScreen } from '@/src/features/auth/screens/SignInScreen';

export default function SignInRoute() {
  const { user } = useSession();

  if (user) {
    return <Redirect href="/(tabs)/feed" />;
  }

  return <SignInScreen />;
}
