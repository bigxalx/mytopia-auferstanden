import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActorAvatar } from '@/components/feed/ActorAvatar';
import { MissionChatInput } from '@/components/feed/MissionChatInput';
import { MissionChoicePicker } from '@/components/feed/MissionChoicePicker';
import { useChannels } from '@/src/features/channels/data/ChannelContext';
import { HUB_CHANNEL_ID } from '@/src/features/channels/data/channelStore';
import { useSession } from '@/src/core/session/SessionContext';
import { useActiveMission, useActiveMissionBarVisible } from '@/src/features/tasks/context/ActiveMissionContext';
import {
  ChatThreadList,
  createDefaultScrollState,
  type ChatThreadListHandle,
} from '@/src/features/thread/components/ChatThreadList';
import { useActorThread } from '@/src/features/thread/hooks/useActorThread';
import { theme } from '@/src/shared/ui/theme';

export function ActorChannelScreen({ channelId }: { channelId: string }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { selectedMode } = useSession();
  const {
    actorChannels,
    consumePendingMissionStart,
    getChannelScrollState,
    pendingMissionStart,
    saveChannelScrollState,
  } = useChannels();
  const {
    activeChannel,
    focusedMissionId,
    highlightMission,
    quizSession,
    registerOptimisticHandler,
    registerScrollHandler,
    setActiveChannel,
    startChatQuiz,
    startMission,
  } = useActiveMission();
  const { isVisible: isMissionBarVisible } = useActiveMissionBarVisible();
  const threadRef = useRef<ChatThreadListHandle>(null);

  const channel = actorChannels.find((item) => item.channelId === channelId);
  const scrollState = getChannelScrollState(channelId) ?? createDefaultScrollState();
  const { applyOptimisticUpdate, isHydrated, items, markRead, typingState } = useActorThread(channelId);

  const footerInset =
    Math.max(72, insets.bottom + 108) +
    (activeChannel.channelType === 'actor'
      ? quizSession
        ? 260
        : focusedMissionId
          ? 140
          : isMissionBarVisible
            ? 140
            : 0
      : 0);
  const scrollToEndButtonBottom = Math.max(insets.bottom + 16, 24);
  const newMessagesBottom = isMissionBarVisible
    ? Math.max(insets.bottom + 92, 108)
    : Math.max(insets.bottom + 24, 32);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: channel?.title ?? 'Kanal',
    });
  }, [channel?.title, navigation]);

  useFocusEffect(
    useCallback(() => {
      setActiveChannel({
        ...(channel?.avatarUrl ? { actorAvatarUrl: channel.avatarUrl } : {}),
        ...(channel?.actorId ? { actorId: channel.actorId } : {}),
        ...(channel?.title ? { actorName: channel.title } : {}),
        ...(channel?.role ? { actorRole: channel.role } : {}),
        channelId,
        channelType: 'actor',
      });

      registerOptimisticHandler(applyOptimisticUpdate);
      registerScrollHandler((missionIdOrTitle) => {
        const didScroll = threadRef.current?.scrollToMission(missionIdOrTitle) ?? false;
        if (didScroll && missionIdOrTitle !== 'bottom') {
          highlightMission(missionIdOrTitle);
        }
      });

      return () => {
        const nextScrollState = threadRef.current?.getScrollState() ?? createDefaultScrollState();
        saveChannelScrollState(channelId, nextScrollState);
        registerOptimisticHandler(null);
        registerScrollHandler(null);
      };
    }, [
      applyOptimisticUpdate,
      channel?.actorId,
      channel?.avatarUrl,
      channel?.role,
      channel?.title,
      channelId,
      highlightMission,
      registerOptimisticHandler,
      registerScrollHandler,
      saveChannelScrollState,
      setActiveChannel,
    ])
  );

  useEffect(() => {
    const pending = consumePendingMissionStart(channelId);
    if (!pending) {
      return;
    }

    if (pending.kind === 'quiz') {
      void startChatQuiz(pending.missionId, pending.actor, pending.data);
      return;
    }

    void startMission(pending.missionId, pending.actor, pending.data);
  }, [channelId, consumePendingMissionStart, pendingMissionStart, startChatQuiz, startMission]);

  if (channelId === HUB_CHANNEL_ID) {
    return null;
  }

  return (
    <>
      <ChatThreadList
        ref={threadRef}
        emptyState={
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>Dieser Kanal ist noch leer.</Text>
          </View>
        }
        footerInset={footerInset}
        hero={
          channel ? (
            <View style={styles.channelHero}>
              <ActorAvatar actor={{ ...(channel.avatarUrl ? { avatarUrl: channel.avatarUrl } : {}), name: channel.title }} />
              <Text style={styles.channelTitle}>{channel.title}</Text>
              <Text style={styles.channelDescription}>
                {channel.role?.trim() ? channel.role : 'Privater Missionskanal'}
              </Text>
            </View>
          ) : null
        }
        isHydrated={isHydrated}
        items={items}
        loadingState={
          <View style={styles.stateBox}>
            <ActivityIndicator color={theme.colors.orange} size="large" />
            <Text style={styles.stateText}>Kanal wird geladen...</Text>
          </View>
        }
        newMessagesBottom={newMessagesBottom}
        onMarkRead={markRead}
        scrollState={scrollState}
        scrollToEndButtonBottom={scrollToEndButtonBottom}
        threadKey={`actor:${channelId}:${selectedMode}`}
        typingState={typingState}
      />
      {quizSession ? <MissionChoicePicker /> : <MissionChatInput />}
    </>
  );
}

const styles = StyleSheet.create({
  stateBox: {
    alignItems: 'center',
    backgroundColor: theme.colors.headerBackground,
    borderRadius: 12,
    gap: 8,
    marginTop: 24,
    padding: 20,
  } as ViewStyle,
  stateText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  } as TextStyle,
  channelHero: {
    alignItems: 'center',
    backgroundColor: theme.colors.headerBackground,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 18,
    paddingHorizontal: 20,
    paddingVertical: 20,
  } as ViewStyle,
  channelTitle: {
    color: theme.colors.textPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 22,
    marginTop: 12,
    textAlign: 'center',
  } as TextStyle,
  channelDescription: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  } as TextStyle,
});
