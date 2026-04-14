import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { useSession } from '@/src/core/session/SessionContext';
import { useNarrativeSignal } from '@/src/features/feed/data/NarrativeSignalContext';
import type { MissionKind } from '@/src/features/tasks/data/missionRepository';
import type { NarrativeMessageDto } from '@/src/features/feed/data/narrativeFeedClient';

import {
  ensureActorChannel,
  HUB_CHANNEL_ID,
  subscribeToChannelSummaries,
  type ActorChannelSeed,
  type ChannelSummary,
} from './channelStore';

export type PendingMissionStart = {
  actor: NarrativeMessageDto['actor'];
  channelId: string;
  data?: { description?: string; imageUrl?: string; questions?: any[]; title?: string };
  kind: MissionKind;
  missionId: string;
};

export type ChannelScrollState = {
  distanceFromBottom: number;
  offsetY: number;
  wasAtBottom: boolean;
};

type ChannelsContextValue = {
  actorChannels: ChannelSummary[];
  consumePendingMissionStart: (channelId: string) => PendingMissionStart | null;
  ensureActorMissionChannel: (seed: ActorChannelSeed) => Promise<string>;
  getChannelScrollOffset: (channelId: string) => number;
  getChannelScrollState: (channelId: string) => ChannelScrollState;
  hubUnreadCount: number;
  pendingMissionStart: PendingMissionStart | null;
  queuePendingMissionStart: (pending: PendingMissionStart | null) => void;
  saveChannelScrollOffset: (channelId: string, offsetY: number) => void;
  saveChannelScrollState: (channelId: string, state: ChannelScrollState) => void;
  totalUnreadCount: number;
};

const ChannelsContext = createContext<ChannelsContextValue | null>(null);

export function ChannelsProvider({ children }: PropsWithChildren) {
  const { selectedMode, user } = useSession();
  const { unreadCount: hubUnreadCount } = useNarrativeSignal();
  const [actorChannels, setActorChannels] = useState<ChannelSummary[]>([]);
  const [pendingMissionStart, setPendingMissionStart] = useState<PendingMissionStart | null>(null);
  const [channelScrollStates, setChannelScrollStates] = useState<Record<string, ChannelScrollState>>({});

  useEffect(() => {
    return subscribeToChannelSummaries({
      listener: setActorChannels,
      mode: selectedMode,
      uid: user?.id,
    });
  }, [selectedMode, user?.id]);

  const ensureActorMissionChannel = useCallback(
    async (seed: ActorChannelSeed) => {
      if (!user?.id) {
        throw new Error('Cannot create actor channel without a signed-in user.');
      }

      await ensureActorChannel({
        ...seed,
        mode: selectedMode,
        uid: user.id,
      });
      return seed.actorId;
    },
    [selectedMode, user?.id]
  );

  const consumePendingMissionStart = useCallback((channelId: string) => {
    if (!pendingMissionStart || pendingMissionStart.channelId !== channelId) {
      return null;
    }

    setPendingMissionStart(null);
    return pendingMissionStart;
  }, [pendingMissionStart]);

  const totalUnreadCount = useMemo(() => {
    const actorUnread = actorChannels.reduce((sum, channel) => sum + channel.unreadCount, 0);
    return hubUnreadCount + actorUnread;
  }, [actorChannels, hubUnreadCount]);

  const saveChannelScrollState = useCallback((channelId: string, state: ChannelScrollState) => {
    const normalizedState: ChannelScrollState = {
      distanceFromBottom: Number.isFinite(state.distanceFromBottom) ? Math.max(0, state.distanceFromBottom) : 0,
      offsetY: Number.isFinite(state.offsetY) ? Math.max(0, state.offsetY) : 0,
      wasAtBottom: Boolean(state.wasAtBottom),
    };
    setChannelScrollStates((current) => {
      const existing = current[channelId];
      if (
        existing &&
        existing.offsetY === normalizedState.offsetY &&
        existing.distanceFromBottom === normalizedState.distanceFromBottom &&
        existing.wasAtBottom === normalizedState.wasAtBottom
      ) {
        return current;
      }
      return {
        ...current,
        [channelId]: normalizedState,
      };
    });
  }, []);

  const saveChannelScrollOffset = useCallback((channelId: string, offsetY: number) => {
    const normalizedOffset = Number.isFinite(offsetY) ? Math.max(0, offsetY) : 0;
    saveChannelScrollState(channelId, {
      distanceFromBottom: 0,
      offsetY: normalizedOffset,
      wasAtBottom: false,
    });
  }, [saveChannelScrollState]);

  const getChannelScrollOffset = useCallback(
    (channelId: string) => channelScrollStates[channelId]?.offsetY ?? 0,
    [channelScrollStates]
  );

  const getChannelScrollState = useCallback(
    (channelId: string): ChannelScrollState =>
      channelScrollStates[channelId] ?? {
        distanceFromBottom: 0,
        offsetY: 0,
        wasAtBottom: false,
      },
    [channelScrollStates]
  );

  const value = useMemo<ChannelsContextValue>(
    () => ({
      actorChannels,
      consumePendingMissionStart,
      ensureActorMissionChannel,
      getChannelScrollOffset,
      getChannelScrollState,
      hubUnreadCount,
      pendingMissionStart,
      queuePendingMissionStart: setPendingMissionStart,
      saveChannelScrollOffset,
      saveChannelScrollState,
      totalUnreadCount,
    }),
    [
      actorChannels,
      consumePendingMissionStart,
      ensureActorMissionChannel,
      getChannelScrollOffset,
      getChannelScrollState,
      hubUnreadCount,
      pendingMissionStart,
      saveChannelScrollOffset,
      saveChannelScrollState,
      totalUnreadCount,
    ]
  );

  return <ChannelsContext.Provider value={value}>{children}</ChannelsContext.Provider>;
}

export function useChannels() {
  const context = useContext(ChannelsContext);
  if (!context) {
    throw new Error('useChannels must be used within ChannelsProvider');
  }

  return context;
}

export { HUB_CHANNEL_ID };
