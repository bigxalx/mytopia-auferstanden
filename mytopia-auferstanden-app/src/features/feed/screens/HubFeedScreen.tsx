import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Text, type KeyboardEvent, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MissionChatInput } from '@/components/feed/MissionChatInput';
import { MissionChoicePicker } from '@/components/feed/MissionChoicePicker';
import { useChannels } from '@/src/features/channels/data/ChannelContext';
import { useSession } from '@/src/core/session/SessionContext';
import { useActiveMission, useActiveMissionBarVisible } from '@/src/features/tasks/context/ActiveMissionContext';
import {
  ChatThreadList,
  createDefaultScrollState,
  type ChatThreadListHandle,
} from '@/src/features/thread/components/ChatThreadList';
import { useHubThread } from '@/src/features/thread/hooks/useHubThread';
import { useThreadNavigation } from '@/src/features/thread/data/ThreadNavigationContext';
import { theme } from '@/src/shared/ui/theme';

export default function HubFeedScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { selectedMode } = useSession();
  const { getChannelScrollState, saveChannelScrollState } = useChannels();
  const { focusedMission, focusedMissionId, highlightMission, quizSession, registerOptimisticHandler, registerScrollHandler, setActiveChannel } =
    useActiveMission();
  const { consumeExternalTarget, highlightedMessageKey, highlightMessageKey } = useThreadNavigation();
  const { isVisible: isMissionBarVisible, isNative: isNativeMissionBar } = useActiveMissionBarVisible();
  const threadRef = useRef<ChatThreadListHandle>(null);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [pendingExternalBundleId, setPendingExternalBundleId] = useState<string | null>(null);

  const { allItems, canLoadMore, hasWarmState, isHydrated, isLoadingMore, items, loadMore, markRead, typingState } = useHubThread();
  const scrollState = getChannelScrollState('hub') ?? createDefaultScrollState();
  const isTextMissionActive = focusedMission?.kind === 'text';
  const keyboardInset = isTextMissionActive && isKeyboardVisible ? Math.max(0, keyboardHeight - insets.bottom) : 0;

  const footerInset =
    Math.max(72, insets.bottom + 108) +
    (quizSession ? 260 : focusedMissionId ? 140 : 0) +
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
      headerRight: () =>
        selectedMode === 'dev' ? (
          <Text style={modeBadgeStyle}>Dev Mode</Text>
        ) : null,
    });
  }, [navigation, selectedMode]);

  useFocusEffect(
    useCallback(() => {
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
    }, [highlightMission, registerOptimisticHandler, registerScrollHandler, saveChannelScrollState, setActiveChannel])
  );

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

  return (
    <>
      <ChatThreadList
        deferUntilReady={!hasWarmState}
        ref={threadRef}
        footerInset={footerInset}
        highlightedMessageKey={highlightedMessageKey}
        isHydrated={isHydrated}
        isLoadingMore={isLoadingMore}
        items={items}
        newMessagesBottom={newMessagesBottom}
        onEndReached={canLoadMore ? loadMore : undefined}
        onMarkRead={markRead}
        scrollState={scrollState}
        scrollToEndButtonBottom={scrollToEndButtonBottom}
        threadKey={`hub:${selectedMode}`}
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
