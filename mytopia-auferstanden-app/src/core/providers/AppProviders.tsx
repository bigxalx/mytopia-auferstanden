import { PropsWithChildren } from 'react';

import { SessionProvider } from '@/src/core/session/SessionContext';

export function AppProviders({ children }: PropsWithChildren) {
  return <SessionProvider>{children}</SessionProvider>;
}
