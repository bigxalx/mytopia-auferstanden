import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { HUB_CHANNEL_ID, markChannelAsRead, subscribeToChannelBundles } from '@/src/features/channels/data/channelStore';
import { useSession } from '@/src/core/session/SessionContext';
import { type NarrativeBundleDto } from '@/src/features/feed/data/narrativeFeedClient';
import { type PlaybackMessage } from '@/src/features/feed/utils/playback';
import {
  flattenBundlesToMessages,
  mergeBundles,
  type ThreadTypingState,
} from '@/src/features/thread/data/threadMessages';

const actorThreadSnapshots = new Map<string, NarrativeBundleDto[]>();

export function useActorThread(channelId: string) {
  const { selectedMode, user } = useSession();
  const isFocused = useIsFocused();
  const snapshot = actorThreadSnapshots.get(snapshotKey(channelId, selectedMode, user?.id));
  const hasWarmState = Boolean(snapshot);
  const [bundles, setBundles] = useState<NarrativeBundleDto[]>(() => snapshot ?? []);
  const [isHydrated, setIsHydrated] = useState(() => Boolean(snapshot));
  const [clockMs, setClockMs] = useState(() => Date.now());

  useEffect(() => {
    const nextSnapshot = actorThreadSnapshots.get(snapshotKey(channelId, selectedMode, user?.id));
    setBundles(nextSnapshot ?? []);
    setIsHydrated(Boolean(nextSnapshot));
    setClockMs(Date.now());
  }, [channelId, selectedMode, user?.id]);

  useEffect(() => {
    if (!user?.id || channelId === HUB_CHANNEL_ID) {
      setBundles([]);
      setIsHydrated(true);
      return;
    }

    return subscribeToChannelBundles({
      channelId,
      listener: (nextBundles) => {
        setBundles((current) => {
          const merged = mergeBundles(current, nextBundles);
          actorThreadSnapshots.set(snapshotKey(channelId, selectedMode, user.id), merged);
          return merged;
        });
        setIsHydrated(true);
        setClockMs(Date.now());
      },
      mode: selectedMode,
      uid: user.id,
    });
  }, [channelId, selectedMode, user?.id]);

  const applyOptimisticUpdate = useCallback((updater: (current: NarrativeBundleDto[]) => NarrativeBundleDto[]) => {
    setBundles((current) => {
      const nextBundles = updater(current);
      if (user?.id) {
        actorThreadSnapshots.set(snapshotKey(channelId, selectedMode, user.id), nextBundles);
      }
      return nextBundles;
    });
    setIsHydrated(true);
    setClockMs(Date.now());
  }, [channelId, selectedMode, user?.id]);

  const scheduledItems = useMemo<PlaybackMessage[]>(
    () => flattenBundlesToMessages(bundles),
    [bundles]
  );
  const effectiveClockMs = isFocused ? clockMs : Date.now();
  const items = useMemo<PlaybackMessage[]>(
    () => scheduledItems.filter((item) => item.revealAtMs <= effectiveClockMs),
    [effectiveClockMs, scheduledItems]
  );

  const typingState = useMemo<ThreadTypingState | null>(() => {
    if (!isFocused) {
      return null;
    }

    const nextMessage = scheduledItems.find((item) => item.revealAtMs > clockMs);
    if (!nextMessage) {
      return null;
    }

    return {
      actor: nextMessage.message.actor,
      upcomingKey: nextMessage.key,
    };
  }, [clockMs, isFocused, scheduledItems]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const nextReveal = scheduledItems.find((item) => item.revealAtMs > clockMs);
    if (!nextReveal) {
      return;
    }

    const timeoutMs = Math.max(25, nextReveal.revealAtMs - clockMs + 25);
    const timer = setTimeout(() => setClockMs(Date.now()), timeoutMs);
    return () => clearTimeout(timer);
  }, [clockMs, isFocused, scheduledItems]);

  const markRead = useCallback(async () => {
    if (!user?.id) {
      return;
    }
    await markChannelAsRead({
      channelId,
      mode: selectedMode,
      uid: user.id,
    });
  }, [channelId, selectedMode, user?.id]);

  return {
    allItems: scheduledItems,
    applyOptimisticUpdate,
    hasWarmState,
    isHydrated,
    items,
    markRead,
    typingState,
  };
}

function snapshotKey(channelId: string, mode: string, uid?: string) {
  return `${mode}__${uid ?? 'anon'}__${channelId}`;
}
