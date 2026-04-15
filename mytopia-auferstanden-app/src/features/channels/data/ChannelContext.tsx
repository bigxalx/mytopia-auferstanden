import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { useSession } from '@/src/core/session/SessionContext';
import { useNarrativeSignal } from '@/src/features/feed/data/NarrativeSignalContext';
import type { MissionKind } from '@/src/features/tasks/data/missionRepository';
import type { NarrativeMessageDto } from '@/src/features/feed/data/narrativeFeedClient';

import {
  ensureActorChannel,
  findMissionChannelTarget as findMissionChannelTargetInStore,
  HUB_CHANNEL_ID,
  subscribeToChannelSummaries,
  type ActorChannelSeed,
  type ChannelSummary,
  type MissionChannelTarget,
} from './channelStore';

export type PendingMissionStart = {
  action?: 'resume' | 'start';
  actor: NarrativeMessageDto['actor'];
  channelId: string;
  data?: { description?: string; imageUrl?: string; questions?: any[]; title?: string };
  kind: MissionKind;
  missionId: string;
};

export type ChannelScrollState = {
  offsetY: number;
  wasAtBottom: boolean;
};

type ChannelsContextValue = {
  actorChannels: ChannelSummary[];
  consumePendingMissionStart: (channelId: string) => PendingMissionStart | null;
  ensureActorMissionChannel: (seed: ActorChannelSeed) => Promise<string>;
  findMissionChannelTarget: (missionId: string) => Promise<MissionChannelTarget | null>;
  getChannelScrollState: (channelId: string) => ChannelScrollState;
  hubUnreadCount: number;
  pendingMissionStart: PendingMissionStart | null;
  queuePendingMissionStart: (pending: PendingMissionStart | null) => void;
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

  const findMissionChannelTarget = useCallback(
    async (missionId: string) => {
      if (!user?.id) {
        return null;
      }

      return findMissionChannelTargetInStore({
        missionId,
        mode: selectedMode,
        uid: user.id,
      });
    },
    [selectedMode, user?.id]
  );

  const totalUnreadCount = useMemo(() => {
    const actorUnread = actorChannels.reduce((sum, channel) => sum + channel.unreadCount, 0);
    return hubUnreadCount + actorUnread;
  }, [actorChannels, hubUnreadCount]);

  const saveChannelScrollState = useCallback((channelId: string, state: ChannelScrollState) => {
    const normalizedState: ChannelScrollState = {
      offsetY: Number.isFinite(state.offsetY) ? Math.max(0, state.offsetY) : 0,
      wasAtBottom: Boolean(state.wasAtBottom),
    };
    setChannelScrollStates((current) => {
      const existing = current[channelId];
      if (
        existing &&
        existing.offsetY === normalizedState.offsetY &&
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

  const getChannelScrollState = useCallback(
    (channelId: string): ChannelScrollState =>
      channelScrollStates[channelId] ?? {
        offsetY: 0,
        wasAtBottom: true,
      },
    [channelScrollStates]
  );

  const value = useMemo<ChannelsContextValue>(
    () => ({
      actorChannels,
      consumePendingMissionStart,
      ensureActorMissionChannel,
      findMissionChannelTarget,
      getChannelScrollState,
      hubUnreadCount,
      pendingMissionStart,
      queuePendingMissionStart: setPendingMissionStart,
      saveChannelScrollState,
      totalUnreadCount,
    }),
    [
      actorChannels,
      consumePendingMissionStart,
      ensureActorMissionChannel,
      findMissionChannelTarget,
      getChannelScrollState,
      hubUnreadCount,
      pendingMissionStart,
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
