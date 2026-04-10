import { PropsWithChildren } from 'react';
import { SessionProvider } from '@/src/core/session/SessionContext';
import { ExpoUpdatesController } from '@/src/core/updates/ExpoUpdatesController';
import { NarrativeSignalProvider } from '@/src/features/feed/data/NarrativeSignalContext';
import { ActiveMissionProvider } from '@/src/features/tasks/context/ActiveMissionContext';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SessionProvider>
      <NarrativeSignalProvider>
        <ActiveMissionProvider>
          <ExpoUpdatesController />
          {children}
        </ActiveMissionProvider>
      </NarrativeSignalProvider>
    </SessionProvider>
  );
}
