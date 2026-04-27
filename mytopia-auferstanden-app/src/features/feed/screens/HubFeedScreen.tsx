import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Text, type KeyboardEvent, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MissionChatInput } from '@/components/feed/MissionChatInput';
import { MissionChoicePicker } from '@/components/feed/MissionChoicePicker';
import { NarrativeReactionOverlay } from '@/components/feed/NarrativeReactionOverlay';
import { useChannels } from '@/src/features/channels/data/ChannelContext';
import { useSession } from '@/src/core/session/SessionContext';
import { useActiveMission, useActiveMissionBarVisible } from '@/src/features/tasks/context/ActiveMissionContext';
import { useNarrativeReactions } from '@/src/features/feed/hooks/useNarrativeReactions';
import { type NarrativeReactionId } from '@/src/features/feed/reactions/reactionCatalog';
import { type PlaybackMessage } from '@/src/features/feed/utils/playback';
import {
  ChatThreadList,
  createDefaultScrollState,
  type ChatThreadListHandle,
} from '@/src/features/thread/components/ChatThreadList';
import { type ThreadReactionTarget } from '@/src/features/thread/data/threadReactionTarget';
import { useHubThread } from '@/src/features/thread/hooks/useHubThread';
import { useThreadNavigation } from '@/src/features/thread/data/ThreadNavigationContext';
import { theme } from '@/src/shared/ui/theme';

export default function HubFeedScreen() {
  const navigation = useNavigation<any>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedMode, user } = useSession();
  const {
    clearMissionThreadEntry,
    consumeMissionNavigationIntent,
    getChannelScrollState,
    saveChannelScrollState,
  } = useChannels();
  const { focusedMission, focusedMissionChannel, focusedMissionId, highlightMission, openMissionSession, quizSession, registerOptimisticHandler, registerScrollHandler, setActiveChannel, setFocus, startChatQuiz, startMission } =
    useActiveMission();
  const { consumeExternalTarget, highlightedMessageKey, highlightMessageKey } = useThreadNavigation();
  const { isVisible: isMissionBarVisible, isNative: isNativeMissionBar } = useActiveMissionBarVisible();
  const threadRef = useRef<ChatThreadListHandle>(null);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [pendingExternalBundleId, setPendingExternalBundleId] = useState<string | null>(null);
  const [reactionTarget, setReactionTarget] = useState<ThreadReactionTarget | null>(null);

  const { allItems, canLoadMore, isHydrated, isLoadingMore, items, loadMore, markRead, typingState } = useHubThread();
  const { getMessageReaction, submitReaction } = useNarrativeReactions({
    items: allItems,
    mode: selectedMode,
    userId: user?.id,
  });
  const scrollState = getChannelScrollState('hub') ?? createDefaultScrollState();
  const isMissionActiveHere =
    focusedMissionChannel?.channelId === 'hub' &&
    focusedMissionChannel?.channelType === 'hub';
  const isQuizMissionActiveHere =
    isMissionActiveHere &&
    focusedMission?.kind === 'quiz' &&
    quizSession?.missionId === focusedMissionId;
  const isTextMissionActive = isMissionActiveHere && focusedMission?.kind === 'text';
  const keyboardInset = isTextMissionActive && isKeyboardVisible ? Math.max(0, keyboardHeight - insets.bottom) : 0;

  const footerInset =
    Math.max(72, insets.bottom + 108) +
    (isQuizMissionActiveHere ? 260 : isMissionActiveHere ? 140 : 0) +
    keyboardInset;
  const scrollToEndButtonBottom = isNativeMissionBar
    ? Math.max(insets.bottom + 16, 24)
    : isMissionBarVisible
      ? Math.max(insets.bottom + 92, 108)
      : Math.max(insets.bottom + 16, 24);
  const newMessagesBottom = isNativeMissionBar
    ? Math.max(insets.bottom + 16, 24)
    : isMissionBarVisible
    ? Math.max(insets.bottom + 92, 108)
    : Math.max(insets.bottom + 24, 32);
  const composerBottomOffset =
    isTextMissionActive && isKeyboardVisible
      ? 8
      : insets.bottom + (Platform.OS === 'android' ? 40 : 24);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Notfallkanal',
      gestureEnabled: true,
      headerBackVisible: true,
      headerLeft: undefined,
      headerRight: () =>
        selectedMode === 'dev' ? (
          <Text style={modeBadgeStyle}>Entwicklungsmodus</Text>
        ) : null,
      headerTitle: undefined,
    });
  }, [navigation, selectedMode]);

  useFocusEffect(
    useCallback(() => {
      clearMissionThreadEntry();
      setActiveChannel({
        channelId: 'hub',
        channelType: 'hub',
      });

      registerOptimisticHandler(null);
      registerScrollHandler((missionIdOrTitle) => {
        const didScroll = threadRef.current?.scrollToMission(missionIdOrTitle) ?? false;
        if (didScroll && missionIdOrTitle !== 'bottom') {
          highlightMission(missionIdOrTitle);
        }
      });

      return () => {
        const nextScrollState = threadRef.current?.getScrollState() ?? createDefaultScrollState();
        saveChannelScrollState('hub', nextScrollState);
        registerOptimisticHandler(null);
        registerScrollHandler(null);
      };
    }, [clearMissionThreadEntry, highlightMission, registerOptimisticHandler, registerScrollHandler, saveChannelScrollState, setActiveChannel])
  );

  useEffect(() => {
    const pending = consumeMissionNavigationIntent('hub', 'hub');
    if (!pending) {
      return;
    }

    if (pending.action === 'open') {
      if (focusedMissionId === pending.missionId) {
        void setFocus(pending.missionId, {
          channelId: 'hub',
          channelType: 'hub',
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
  }, [consumeMissionNavigationIntent, focusedMissionId, openMissionSession, setFocus, startChatQuiz, startMission]);

  useEffect(() => {
    const target = consumeExternalTarget('hub');
    if (target) {
      setPendingExternalBundleId(target.bundleId);
    }
  }, [consumeExternalTarget]);

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

  const handleReactionOverlayClose = useCallback(() => {
    setReactionTarget(null);
  }, []);

  const handleMessageLongPress = useCallback((target: ThreadReactionTarget) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReactionTarget(target);
  }, []);

  const handleReactionSelectionCommit = useCallback((reaction: NarrativeReactionId | null) => {
    if (!reactionTarget) {
      return;
    }

    void submitReaction({
      bundleId: reactionTarget.playbackMessage.bundleId,
      messageId: reactionTarget.playbackMessage.message.messageId,
      reaction,
    });
  }, [reactionTarget, submitReaction]);

  const getPlaybackMessageReaction = useCallback((playbackMessage: PlaybackMessage) => {
    return getMessageReaction(playbackMessage.bundleId, playbackMessage.message.messageId);
  }, [getMessageReaction]);

  const activeReactionState = reactionTarget
    ? getMessageReaction(
        reactionTarget.playbackMessage.bundleId,
        reactionTarget.playbackMessage.message.messageId
      )
    : null;

  return (
    <>
      <ChatThreadList
        deferUntilReady
        ref={threadRef}
        footerInset={footerInset}
        getReactionState={getPlaybackMessageReaction}
        highlightedMessageKey={highlightedMessageKey}
        isHydrated={isHydrated}
        isLoadingMore={isLoadingMore}
        items={items}
        newMessagesBottom={newMessagesBottom}
        onEndReached={canLoadMore ? loadMore : undefined}
        onMessageLongPress={handleMessageLongPress}
        onMarkRead={markRead}
        scrollState={scrollState}
        scrollToEndButtonBottom={scrollToEndButtonBottom}
        threadKey={`hub:${selectedMode}`}
        typingState={typingState}
      />
      {isQuizMissionActiveHere ? (
        <MissionChoicePicker onClose={() => router.dismissTo('/(tabs)/feed')} />
      ) : (
        <MissionChatInput
          bottomOffset={composerBottomOffset}
          onClose={() => router.dismissTo('/(tabs)/feed')}
          onRevealRequest={requestComposerReveal}
        />
      )}
      <NarrativeReactionOverlay
        onClose={handleReactionOverlayClose}
        onCommitSelection={handleReactionSelectionCommit}
        reactionState={activeReactionState}
        target={reactionTarget}
        visible={reactionTarget !== null}
      />
    </>
  );
}

const modeBadgeStyle: TextStyle = {
  color: theme.colors.orange,
  fontSize: 10,
  fontWeight: '800',
  paddingHorizontal: 8,
  paddingVertical: 4,
  textTransform: 'uppercase',
};
