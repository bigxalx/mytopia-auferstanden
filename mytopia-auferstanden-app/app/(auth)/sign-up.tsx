import { Redirect } from 'expo-router';

import { useSession } from '@/src/core/session/SessionContext';
import { SignUpScreen } from '@/src/features/auth/screens/SignUpScreen';

export default function SignUpRoute() {
  const { user } = useSession();

  if (user) {
    return <Redirect href="/(tabs)/feed" />;
  }

  return <SignUpScreen />;
}
