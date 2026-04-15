import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type KeyboardEvent,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
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
import { useThreadNavigation } from '@/src/features/thread/data/ThreadNavigationContext';
import { theme } from '@/src/shared/ui/theme';

export function ActorChannelScreen({ channelId }: { channelId: string }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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
    focusedMission,
    focusedMissionId,
    highlightMission,
    interruptMission,
    quizSession,
    registerOptimisticHandler,
    registerScrollHandler,
    resumeInterruptedMission,
    setActiveChannel,
    startChatQuiz,
    startMission,
  } = useActiveMission();
  const { consumeExternalTarget, highlightedMessageKey, highlightMessageKey } = useThreadNavigation();
  const { isVisible: isMissionBarVisible } = useActiveMissionBarVisible();
  const threadRef = useRef<ChatThreadListHandle>(null);

  const channel = actorChannels.find((item) => item.channelId === channelId);
  const scrollState = getChannelScrollState(channelId) ?? createDefaultScrollState();
  const { allItems, applyOptimisticUpdate, hasWarmState, isHydrated, items, markRead, typingState } = useActorThread(channelId);
  const [animatedResultKey, setAnimatedResultKey] = useState<string | null>(null);
  const [celebrationKey, setCelebrationKey] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [pendingExternalBundleId, setPendingExternalBundleId] = useState<string | null>(null);
  const didSeedCelebrationRef = useRef(false);
  const lastResultKeyRef = useRef<string | null>(null);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTextMissionActive = focusedMission?.kind === 'text';
  const keyboardInset = isTextMissionActive && isKeyboardVisible ? Math.max(0, keyboardHeight - insets.bottom) : 0;

  const footerInset =
    Math.max(72, insets.bottom + 84) +
    (activeChannel.channelType === 'actor'
      ? quizSession
        ? 220
        : focusedMissionId
          ? 110
          : isMissionBarVisible
            ? 110
            : 0
      : 0) +
    keyboardInset;
  const scrollToEndButtonBottom = Math.max(insets.bottom + 16, 24);
  const newMessagesBottom = isMissionBarVisible
    ? Math.max(insets.bottom + 92, 108)
    : Math.max(insets.bottom + 24, 32);
  const composerBottomOffset =
    isTextMissionActive && isKeyboardVisible
      ? 8
      : insets.bottom + (Platform.OS === 'android' ? 40 : 24);

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
        if (
          activeChannel.channelType === 'actor' &&
          activeChannel.channelId === channelId &&
          focusedMissionId &&
          focusedMission
        ) {
          void interruptMission();
        }

        const nextScrollState = threadRef.current?.getScrollState() ?? createDefaultScrollState();
        saveChannelScrollState(channelId, nextScrollState);
        registerOptimisticHandler(null);
        registerScrollHandler(null);
      };
    }, [
      activeChannel.channelId,
      activeChannel.channelType,
      applyOptimisticUpdate,
      channel?.actorId,
      channel?.avatarUrl,
      channel?.role,
      channel?.title,
      channelId,
      focusedMission,
      focusedMissionId,
      highlightMission,
      interruptMission,
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

    if (pending.action === 'resume') {
      void resumeInterruptedMission();
      return;
    }

    if (pending.kind === 'quiz') {
      void startChatQuiz(pending.missionId, pending.actor, pending.data);
      return;
    }

    void startMission(pending.missionId, pending.actor, {
      ...pending.data,
      kind: pending.kind,
    });
  }, [channelId, consumePendingMissionStart, pendingMissionStart, resumeInterruptedMission, startChatQuiz, startMission]);

  useEffect(() => {
    const target = consumeExternalTarget(channelId);
    if (target) {
      setPendingExternalBundleId(target.bundleId);
    }
  }, [channelId, consumeExternalTarget]);

  useEffect(() => {
    if (!pendingExternalBundleId) {
      return;
    }

    const target = allItems.find((item) => item.bundleId === pendingExternalBundleId);
    if (!target) {
      return;
    }

    const didScroll = threadRef.current?.scrollToMessageKey(target.key) ?? false;
    if (!didScroll) {
      return;
    }

    highlightMessageKey(target.key);
    setPendingExternalBundleId(null);
  }, [allItems, highlightMessageKey, items.length, pendingExternalBundleId]);

  const latestVisibleResult = useMemo(() => {
    const lastItem = items[items.length - 1];
    if (!lastItem || lastItem.message.attachment?._type !== 'missionResultAttachment') {
      return null;
    }

    return {
      earnedPoints: lastItem.message.attachment.earnedPoints,
      key: lastItem.key,
    };
  }, [items]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!didSeedCelebrationRef.current) {
      if (items.length === 0) {
        return;
      }
      didSeedCelebrationRef.current = true;
      lastResultKeyRef.current = latestVisibleResult?.key ?? null;
      setAnimatedResultKey(null);
      return;
    }

    if (!latestVisibleResult || latestVisibleResult.key === lastResultKeyRef.current) {
      return;
    }

    lastResultKeyRef.current = latestVisibleResult.key;

    if (typeof latestVisibleResult.earnedPoints !== 'number' || latestVisibleResult.earnedPoints <= 0) {
      setAnimatedResultKey(null);
      setCelebrationKey(null);
      return;
    }

    setAnimatedResultKey(latestVisibleResult.key);
    setCelebrationKey(latestVisibleResult.key);
  }, [isHydrated, items.length, latestVisibleResult]);

  const clearPendingReveal = useCallback(() => {
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
  }, []);

  const requestComposerReveal = useCallback(() => {
    if (!isTextMissionActive) {
      return;
    }

    clearPendingReveal();

    const scrollAnimated = (animated: boolean) => {
      threadRef.current?.scrollToBottom({ animated });
    };

    scrollAnimated(true);
    requestAnimationFrame(() => scrollAnimated(false));

    if (Platform.OS === 'android') {
      revealTimeoutRef.current = setTimeout(() => {
        scrollAnimated(false);
        revealTimeoutRef.current = null;
      }, 140);
    }
  }, [clearPendingReveal, isTextMissionActive]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleKeyboardShow = (event: KeyboardEvent) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
      setKeyboardVisible(true);

      if (isTextMissionActive) {
        requestComposerReveal();
      }
    };

    const handleKeyboardHide = () => {
      clearPendingReveal();
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    };

    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      clearPendingReveal();
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [clearPendingReveal, isTextMissionActive, requestComposerReveal]);

  const headerHeight = useHeaderHeight();

  if (channelId === HUB_CHANNEL_ID) {
    return null;
  }

  return (
    <KeyboardAvoidingView 
      style={styles.screen} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      {celebrationKey ? (
        <View pointerEvents="none" style={styles.confettiOverlay}>
          <ConfettiCannon
            autoStart
            count={104}
            explosionSpeed={340}
            fadeOut
            fallSpeed={2700}
            onAnimationEnd={() => setCelebrationKey(null)}
            origin={{ x: width / 2, y: -12 }}
          />
        </View>
      ) : null}
      <View style={styles.threadLayer}>
        <ChatThreadList
          animatedResultKey={animatedResultKey}
          deferUntilReady={!hasWarmState}
          ref={threadRef}
          emptyState={
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>Dieser Kanal ist noch leer.</Text>
            </View>
          }
          footerInset={footerInset}
          highlightedMessageKey={highlightedMessageKey}
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
        {quizSession ? (
          <MissionChoicePicker />
        ) : (
          <MissionChatInput
            bottomOffset={composerBottomOffset}
            onRevealRequest={requestComposerReveal}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: theme.colors.background,
    flex: 1,
    overflow: 'visible',
  } as ViewStyle,
  threadLayer: {
    flex: 1,
    backgroundColor: 'transparent',
    zIndex: 2,
  } as ViewStyle,
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
  confettiOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
    zIndex: 1,
  } as ViewStyle,
});
