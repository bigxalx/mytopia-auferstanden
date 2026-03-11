import { useEffect, useRef } from 'react';

import { useSession } from '@/src/core/session/SessionContext';
import { checkAndFetchExpoUpdate, reloadToApplyExpoUpdate, setRequestedExpoUpdateChannel } from '@/src/core/updates/expoUpdatesClient';
import { resolveExpoUpdateChannel } from '@/src/core/updates/expoUpdateChannel';

export function ExpoUpdatesController() {
  const { canUseDevMode, isHydrated, selectedMode } = useSession();
  const requestedChannel = resolveExpoUpdateChannel(selectedMode, canUseDevMode);
  const lastAutoCheckedChannel = useRef<string | null>(null);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (lastAutoCheckedChannel.current === requestedChannel) {
      setRequestedExpoUpdateChannel(requestedChannel);
      return;
    }

    lastAutoCheckedChannel.current = requestedChannel;

    void (async () => {
      try {
        const didDownload = await checkAndFetchExpoUpdate(requestedChannel);

        // Silently apply downloaded updates on next launch cycle.
        if (didDownload) {
          await reloadToApplyExpoUpdate();
        }
      } catch (error) {
        console.warn(`[updates] Automatic check failed for channel "${requestedChannel}".`, error);
      }
    })();
  }, [isHydrated, requestedChannel, canUseDevMode]);

  return null;
}
