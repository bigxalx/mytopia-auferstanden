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

type ChannelsContextValue = {
  actorChannels: ChannelSummary[];
  consumePendingMissionStart: (channelId: string) => PendingMissionStart | null;
  ensureActorMissionChannel: (seed: ActorChannelSeed) => Promise<string>;
  hubUnreadCount: number;
  pendingMissionStart: PendingMissionStart | null;
  queuePendingMissionStart: (pending: PendingMissionStart | null) => void;
  totalUnreadCount: number;
};

const ChannelsContext = createContext<ChannelsContextValue | null>(null);

export function ChannelsProvider({ children }: PropsWithChildren) {
  const { selectedMode, user } = useSession();
  const { unreadCount: hubUnreadCount } = useNarrativeSignal();
  const [actorChannels, setActorChannels] = useState<ChannelSummary[]>([]);
  const [pendingMissionStart, setPendingMissionStart] = useState<PendingMissionStart | null>(null);

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

  const value = useMemo<ChannelsContextValue>(
    () => ({
      actorChannels,
      consumePendingMissionStart,
      ensureActorMissionChannel,
      hubUnreadCount,
      pendingMissionStart,
      queuePendingMissionStart: setPendingMissionStart,
      totalUnreadCount,
    }),
    [
      actorChannels,
      consumePendingMissionStart,
      ensureActorMissionChannel,
      hubUnreadCount,
      pendingMissionStart,
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
