import { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/src/core/session/SessionContext';
import { ExpoUpdatesController } from '@/src/core/updates/ExpoUpdatesController';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ExpoUpdatesController />
        {children}
      </SessionProvider>
    </SafeAreaProvider>
  );
}
