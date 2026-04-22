import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { ActorProfileCard } from '@/src/features/actors/components/ActorProfileCard';
import { buildActorProfileHref } from '@/src/features/actors/navigation';
import {
  buildMissionReturnHref,
  useChannels,
} from '@/src/features/channels/data/ChannelContext';
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { selectedMode } = useSession();
  const {
    activeMissionThreadEntry,
    actorChannels,
    clearMissionThreadEntry,
    consumeMissionNavigationIntent,
    getChannelScrollState,
    saveChannelScrollState,
  } = useChannels();
  const {
    activeChannel,
    focusedMission,
    focusedMissionChannel,
    focusedMissionId,
    highlightMission,
    openMissionSession,
    quizSession,
    registerOptimisticHandler,
    registerScrollHandler,
    setFocus,
    setActiveChannel,
    startChatQuiz,
    startMission,
  } = useActiveMission();
  const { consumeExternalTarget, highlightedMessageKey, highlightMessageKey } = useThreadNavigation();
  const { isVisible: isMissionBarVisible } = useActiveMissionBarVisible();
  const threadRef = useRef<ChatThreadListHandle>(null);

  const channel = actorChannels.find((item) => item.channelId === channelId);
  const scrollState = getChannelScrollState(channelId) ?? createDefaultScrollState();
  const { allItems, applyOptimisticUpdate, isHydrated, items, markRead, typingState } = useActorThread(channelId);
  const [animatedResultKey, setAnimatedResultKey] = useState<string | null>(null);
  const [celebrationKey, setCelebrationKey] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [pendingExternalBundleId, setPendingExternalBundleId] = useState<string | null>(null);
  const didSeedCelebrationRef = useRef(false);
  const lastResultKeyRef = useRef<string | null>(null);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMissionActiveHere =
    focusedMissionChannel?.channelId === channelId &&
    focusedMissionChannel?.channelType === 'actor';
  const isQuizMissionActiveHere = isMissionActiveHere && Boolean(quizSession);
  const isTextMissionActive = isMissionActiveHere && focusedMission?.kind === 'text';
  const keyboardInset = isTextMissionActive && isKeyboardVisible ? Math.max(0, keyboardHeight - insets.bottom) : 0;

  const footerInset =
    Math.max(72, insets.bottom + 84) +
    (activeChannel.channelType === 'actor'
      ? isQuizMissionActiveHere
        ? 220
        : isMissionActiveHere
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
  const actorProfileHref = channel?.actorId
    ? buildActorProfileHref({
        ...(channel.avatarUrl ? { actorAvatarUrl: channel.avatarUrl } : {}),
        actorId: channel.actorId,
        actorName: channel.title,
        ...(channel.role ? { actorRole: channel.role } : {}),
      })
    : null;

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
    const pending = consumeMissionNavigationIntent(channelId, 'actor');
    if (!pending) {
      return;
    }

    if (pending.action === 'open') {
      if (focusedMissionId === pending.missionId) {
        void setFocus(pending.missionId, {
          channelId,
          channelType: 'actor',
        });
      } else {
        void openMissionSession(pending.missionId);
      }
      return;
    }

    if (pending.kind === 'quiz' && pending.actor) {
      void startChatQuiz(pending.missionId, pending.actor, pending.data);
      return;
    }

    void startMission(pending.missionId, pending.actor, {
      ...pending.data,
      kind: pending.kind,
    });
  }, [channelId, consumeMissionNavigationIntent, focusedMissionId, openMissionSession, setFocus, startChatQuiz, startMission]);

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

  const missionThreadEntry =
    activeMissionThreadEntry &&
    activeMissionThreadEntry.targetChannelId === channelId &&
    activeMissionThreadEntry.targetChannelType === 'actor'
      ? activeMissionThreadEntry
      : null;

  const shouldUseMissionReturnTarget =
    Boolean(missionThreadEntry) &&
    focusedMissionId === missionThreadEntry?.missionId &&
    isMissionActiveHere;

  const leaveMissionThread = useCallback(() => {
    if (!shouldUseMissionReturnTarget || !missionThreadEntry) {
      if (router.canGoBack()) {
        router.back();
        return;
      }

      router.dismissTo('/(tabs)/feed');
      return;
    }

    clearMissionThreadEntry({
      channelId,
      missionId: missionThreadEntry.missionId,
    });
    router.dismissTo(buildMissionReturnHref(missionThreadEntry.returnTarget));
  }, [channelId, clearMissionThreadEntry, missionThreadEntry, router, shouldUseMissionReturnTarget]);

  useLayoutEffect(() => {
    navigation.setOptions({
      gestureEnabled: !shouldUseMissionReturnTarget,
      headerBackButtonMenuEnabled: false,
      headerBackVisible: !shouldUseMissionReturnTarget,
      headerTitle: () =>
        actorProfileHref ? (
          <Pressable
            hitSlop={8}
            onPress={() => router.push(actorProfileHref)}
            style={({ pressed }) => [styles.headerTitleWrap, pressed && styles.headerTitlePressed]}
          >
            <ActorAvatar
              actor={{ ...(channel?.avatarUrl ? { avatarUrl: channel.avatarUrl } : {}), name: channel?.title ?? 'Kanal' }}
              size={28}
            />
            <Text numberOfLines={1} style={styles.headerTitleText}>
              {channel?.title ?? 'Kanal'}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.headerTitleWrap}>
            <ActorAvatar
              actor={{ ...(channel?.avatarUrl ? { avatarUrl: channel.avatarUrl } : {}), name: channel?.title ?? 'Kanal' }}
              size={28}
            />
            <Text numberOfLines={1} style={styles.headerTitleText}>
              {channel?.title ?? 'Kanal'}
            </Text>
          </View>
        ),
      headerLeft: shouldUseMissionReturnTarget
        ? () => (
            <Pressable
              accessibilityLabel="Kanal schließen"
              hitSlop={8}
              onPress={leaveMissionThread}
              style={styles.headerBackButton}
            >
              <MaterialIcons color={theme.colors.textPrimary} name="arrow-back" size={24} />
            </Pressable>
          )
        : undefined,
    });
  }, [actorProfileHref, channel?.avatarUrl, channel?.title, leaveMissionThread, navigation, router, shouldUseMissionReturnTarget]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android' || !shouldUseMissionReturnTarget) {
        return undefined;
      }

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        leaveMissionThread();
        return true;
      });

      return () => {
        subscription.remove();
      };
    }, [leaveMissionThread, shouldUseMissionReturnTarget])
  );

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
          deferUntilReady
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
              <ActorProfileCard
                actor={{
                  ...(channel.avatarUrl ? { avatarUrl: channel.avatarUrl } : {}),
                  name: channel.title,
                  ...(channel.role ? { role: channel.role } : {}),
                }}
                onInfoPress={actorProfileHref ? () => router.push(actorProfileHref) : undefined}
                showChannelButton={false}
                style={styles.channelHero}
              />
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
          showNpcAvatars={false}
          scrollToEndButtonBottom={scrollToEndButtonBottom}
          threadKey={`actor:${channelId}:${selectedMode}`}
          typingState={typingState}
        />
        {quizSession ? (
          <MissionChoicePicker onClose={leaveMissionThread} />
        ) : (
          <MissionChatInput
            bottomOffset={composerBottomOffset}
            onClose={leaveMissionThread}
            onRevealRequest={requestComposerReveal}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerBackButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  } as ViewStyle,
  headerTitleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    maxWidth: 240,
  } as ViewStyle,
  headerTitlePressed: {
    opacity: 0.82,
  } as ViewStyle,
  headerTitleText: {
    color: theme.colors.textPrimary,
    flexShrink: 1,
    fontFamily: theme.typography.title.fontFamily,
    fontSize: 18,
    textTransform: 'uppercase',
  } as TextStyle,
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
    marginBottom: 18,
  } as ViewStyle,
  confettiOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
    zIndex: 1,
  } as ViewStyle,
});
