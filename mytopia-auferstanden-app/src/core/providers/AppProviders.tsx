import { PropsWithChildren } from 'react';

import { SessionProvider } from '@/src/core/session/SessionContext';
import { ExpoUpdatesController } from '@/src/core/updates/ExpoUpdatesController';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SessionProvider>
      <ExpoUpdatesController />
      {children}
    </SessionProvider>
  );
}
