import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import {
  getInitialNarrativeNotificationOpen,
  subscribeToNarrativeNotificationOpens,
  type FcmNarrativePayload,
} from '@/src/core/firebase/messagingClient';
import { HUB_CHANNEL_ID } from '@/src/features/channels/data/channelStore';
import { useThreadNavigation } from '@/src/features/thread/data/ThreadNavigationContext';

export function NarrativeNotificationBridge() {
  const { queueExternalTarget } = useThreadNavigation();
  const initialHandledRef = useRef(false);

  useEffect(() => {
    const handlePayload = (payload: FcmNarrativePayload | null) => {
      if (!payload) {
        return;
      }

      const channelId = resolveChannelId(payload.route);
      if (payload.bundleId) {
        queueExternalTarget({
          bundleId: payload.bundleId,
          channelId,
        });
      }

      router.push({
        pathname: '/(tabs)/feed/[channelId]',
        params: { channelId },
      });
    };

    if (!initialHandledRef.current) {
      initialHandledRef.current = true;
      void getInitialNarrativeNotificationOpen().then(handlePayload).catch(() => undefined);
    }

    return subscribeToNarrativeNotificationOpens(handlePayload);
  }, [queueExternalTarget]);

  return null;
}

function resolveChannelId(route?: string) {
  if (!route || route.trim().length === 0) {
    return HUB_CHANNEL_ID;
  }

  const normalized = route.trim();
  const match = normalized.match(/\/feed\/([^/?#]+)/);
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }

  if (normalized === 'hub' || normalized.endsWith('/hub')) {
    return HUB_CHANNEL_ID;
  }

  return HUB_CHANNEL_ID;
}
