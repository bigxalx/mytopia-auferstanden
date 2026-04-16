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
  action?: 'open' | 'start';
  actor?: NarrativeMessageDto['actor'];
  channelId: string;
  data?: {
    description?: string;
    gpsConfig?: {
      latitude: number;
      longitude: number;
      radiusMeters: number;
    };
    imageUrl?: string;
    questions?: any[];
    title?: string;
  };
  kind: MissionKind;
  missionId: string;
};

export type MissionReturnTarget = 'hub' | 'channel-list';

export type MissionNavigationIntent = {
  action: 'open' | 'start';
  actor?: NarrativeMessageDto['actor'];
  data?: PendingMissionStart['data'];
  kind: MissionKind;
  missionId: string;
  returnTarget: MissionReturnTarget;
  targetChannelId: string;
  targetChannelType: 'hub' | 'actor';
};

export type ChannelScrollState = {
  offsetY: number;
  wasAtBottom: boolean;
};

type ChannelsContextValue = {
  actorChannels: ChannelSummary[];
  activeMissionThreadEntry: MissionNavigationIntent | null;
  clearMissionThreadEntry: (options?: { channelId?: string; missionId?: string }) => void;
  consumeMissionNavigationIntent: (
    channelId: string,
    channelType: 'hub' | 'actor'
  ) => MissionNavigationIntent | null;
  ensureActorMissionChannel: (seed: ActorChannelSeed) => Promise<string>;
  getChannelScrollState: (channelId: string) => ChannelScrollState;
  hubUnreadCount: number;
  queueMissionNavigationIntent: (intent: MissionNavigationIntent | null) => void;
  saveChannelScrollState: (channelId: string, state: ChannelScrollState) => void;
  totalUnreadCount: number;
};

const ChannelsContext = createContext<ChannelsContextValue | null>(null);

export function ChannelsProvider({ children }: PropsWithChildren) {
  const { selectedMode, user } = useSession();
  const { unreadCount: hubUnreadCount } = useNarrativeSignal();
  const [actorChannels, setActorChannels] = useState<ChannelSummary[]>([]);
  const [activeMissionThreadEntry, setActiveMissionThreadEntry] = useState<MissionNavigationIntent | null>(null);
  const [pendingMissionNavigationIntent, setPendingMissionNavigationIntent] = useState<MissionNavigationIntent | null>(null);
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

  useEffect(() => {
    if (user?.id) {
      return;
    }

    setActiveMissionThreadEntry(null);
    setPendingMissionNavigationIntent(null);
  }, [selectedMode, user?.id]);

  const consumeMissionNavigationIntent = useCallback((
    channelId: string,
    channelType: 'hub' | 'actor'
  ) => {
    if (
      !pendingMissionNavigationIntent ||
      pendingMissionNavigationIntent.targetChannelId !== channelId ||
      pendingMissionNavigationIntent.targetChannelType !== channelType
    ) {
      return null;
    }

    setPendingMissionNavigationIntent(null);
    setActiveMissionThreadEntry(pendingMissionNavigationIntent);
    return pendingMissionNavigationIntent;
  }, [pendingMissionNavigationIntent]);

  const clearMissionThreadEntry = useCallback((options?: { channelId?: string; missionId?: string }) => {
    setActiveMissionThreadEntry((current) => {
      if (!current) {
        return current;
      }
      if (options?.channelId && current.targetChannelId !== options.channelId) {
        return current;
      }
      if (options?.missionId && current.missionId !== options.missionId) {
        return current;
      }
      return null;
    });
  }, []);

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
      activeMissionThreadEntry,
      clearMissionThreadEntry,
      consumeMissionNavigationIntent,
      ensureActorMissionChannel,
      getChannelScrollState,
      hubUnreadCount,
      queueMissionNavigationIntent: setPendingMissionNavigationIntent,
      saveChannelScrollState,
      totalUnreadCount,
    }),
    [
      actorChannels,
      activeMissionThreadEntry,
      clearMissionThreadEntry,
      consumeMissionNavigationIntent,
      ensureActorMissionChannel,
      getChannelScrollState,
      hubUnreadCount,
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

export function buildFeedChannelHref(channelId: string) {
  if (channelId === HUB_CHANNEL_ID) {
    return '/(tabs)/feed/hub' as const;
  }

  return {
    pathname: '/(tabs)/feed/[channelId]' as const,
    params: { channelId },
  };
}

export function buildMissionReturnHref(returnTarget: MissionReturnTarget) {
  return returnTarget === 'hub' ? '/(tabs)/feed/hub' : '/(tabs)/feed';
}
