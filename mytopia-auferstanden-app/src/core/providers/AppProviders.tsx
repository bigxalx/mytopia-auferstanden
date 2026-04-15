import { PropsWithChildren } from 'react';
import { SessionProvider } from '@/src/core/session/SessionContext';
import { ExpoUpdatesController } from '@/src/core/updates/ExpoUpdatesController';
import { NarrativeSignalProvider } from '@/src/features/feed/data/NarrativeSignalContext';
import { ActiveMissionProvider } from '@/src/features/tasks/context/ActiveMissionContext';
import { ChannelsProvider } from '@/src/features/channels/data/ChannelContext';
import { ThreadNavigationProvider } from '@/src/features/thread/data/ThreadNavigationContext';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SessionProvider>
      <NarrativeSignalProvider>
        <ChannelsProvider>
          <ThreadNavigationProvider>
            <ActiveMissionProvider>
              <ExpoUpdatesController />
              {children}
            </ActiveMissionProvider>
          </ThreadNavigationProvider>
        </ChannelsProvider>
      </NarrativeSignalProvider>
    </SessionProvider>
  );
}
