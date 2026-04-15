import { type FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';

import { type ChannelScrollState } from '@/src/features/channels/data/ChannelContext';
import { type PlaybackMessage } from '@/src/features/feed/utils/playback';
import { type FeedItem } from '@/src/features/thread/data/threadRenderItems';

const SCROLL_TO_END_SHOW_THRESHOLD_PX = 180;

export function useThreadViewportState({
  deferUntilReady,
  feedItems,
  isHydrated,
  items,
  onMarkRead,
  scrollState,
  threadKey,
}: {
  deferUntilReady?: boolean;
  feedItems: FeedItem[];
  isHydrated: boolean;
  items: PlaybackMessage[];
  onMarkRead?: () => void | Promise<void>;
  scrollState: ChannelScrollState;
  threadKey: string;
}) {
  const listRef = useRef<FlashListRef<FeedItem>>(null);
  const latestScrollStateRef = useRef(scrollState);
  const seenMessageKeysRef = useRef(new Set<string>());
  const didCaptureInitialItemsRef = useRef(false);
  const didRestoreScrollRef = useRef(false);
  const hasMeasuredLayoutRef = useRef(false);
  const isAtBottomRef = useRef(scrollState.wasAtBottom);
  const prevMessageCountRef = useRef(items.length);
  const scrollMetricsRef = useRef({
    contentHeight: 0,
    offsetY: scrollState.offsetY,
    viewportHeight: 0,
  });
  const [showNewMessagesBadge, setShowNewMessagesBadge] = useState(false);
  const [showScrollToEndButton, setShowScrollToEndButton] = useState(!scrollState.wasAtBottom);
  const [isReady, setIsReady] = useState(!deferUntilReady);
  const newMessagesOpacity = useRef(new Animated.Value(0)).current;
  const scrollToEndOpacity = useRef(new Animated.Value(showScrollToEndButton ? 1 : 0)).current;

  latestScrollStateRef.current = scrollState;

  const initialContentOffset = useMemo(
    () =>
      scrollState.wasAtBottom
        ? undefined
        : { x: 0, y: Math.max(0, scrollState.offsetY) },
    [scrollState.offsetY, scrollState.wasAtBottom]
  );

  const maintainVisibleContentPosition = useMemo(
    () => ({
      autoscrollToBottomThreshold: 0.02,
      minIndexForVisible: 0,
      ...(scrollState.wasAtBottom ? { startRenderingFromBottom: true } : {}),
    }),
    [scrollState.wasAtBottom]
  );

  const syncChrome = useCallback(() => {
    const distanceFromBottom = Math.max(
      0,
      scrollMetricsRef.current.contentHeight -
        (scrollMetricsRef.current.offsetY + scrollMetricsRef.current.viewportHeight)
    );
    const isCloseToBottom =
      scrollMetricsRef.current.contentHeight <= scrollMetricsRef.current.viewportHeight + 1 ||
      distanceFromBottom <= 100;

    isAtBottomRef.current = isCloseToBottom;
    setShowScrollToEndButton(distanceFromBottom > SCROLL_TO_END_SHOW_THRESHOLD_PX);

    if (isCloseToBottom) {
      setShowNewMessagesBadge(false);
      if (onMarkRead) {
        void onMarkRead();
      }
    }
  }, [onMarkRead]);

  const scrollToBottom = useCallback(
    (options?: { animated?: boolean }) => {
      if (feedItems.length === 0) {
        return;
      }
      listRef.current?.scrollToEnd({ animated: options?.animated ?? true });
    },
    [feedItems.length]
  );

  const getScrollState = useCallback((): ChannelScrollState => {
    const distanceFromBottom = Math.max(
      0,
      scrollMetricsRef.current.contentHeight -
        (scrollMetricsRef.current.offsetY + scrollMetricsRef.current.viewportHeight)
    );
    return {
      offsetY: scrollMetricsRef.current.offsetY,
      wasAtBottom: distanceFromBottom <= 120,
    };
  }, []);

  const scrollToMission = useCallback(
    (missionIdOrTitle: string) => {
      if (missionIdOrTitle === 'bottom') {
        scrollToBottom();
        return true;
      }

      const targetIndex = feedItems.findIndex((item) => {
        if (item.type !== 'message') {
          return false;
        }
        const attachment = item.data.message.attachment;
        if (attachment?._type !== 'missionAttachment') {
          return false;
        }
        return (
          attachment.missionId === missionIdOrTitle ||
          attachment.missionTitle === missionIdOrTitle ||
          attachment.title === missionIdOrTitle
        );
      });

      if (targetIndex < 0) {
        return false;
      }

      listRef.current?.scrollToIndex({
        animated: true,
        index: targetIndex,
        viewOffset: 60,
        viewPosition: 0.5,
      });
      return true;
    },
    [feedItems, scrollToBottom]
  );

  const scrollToMessageKey = useCallback(
    (messageKey: string) => {
      const targetIndex = feedItems.findIndex((item) => item.type === 'message' && item.key === messageKey);
      if (targetIndex < 0) {
        return false;
      }

      listRef.current?.scrollToIndex({
        animated: true,
        index: targetIndex,
        viewOffset: 60,
        viewPosition: 0.5,
      });
      return true;
    },
    [feedItems]
  );

  useEffect(() => {
    const latestScrollState = latestScrollStateRef.current;
    seenMessageKeysRef.current.clear();
    didCaptureInitialItemsRef.current = false;
    didRestoreScrollRef.current = false;
    hasMeasuredLayoutRef.current = false;
    isAtBottomRef.current = latestScrollState.wasAtBottom;
    prevMessageCountRef.current = 0;
    scrollMetricsRef.current = {
      contentHeight: 0,
      offsetY: latestScrollState.offsetY,
      viewportHeight: 0,
    };
    setShowNewMessagesBadge(false);
    setShowScrollToEndButton(!latestScrollState.wasAtBottom);
    setIsReady(!deferUntilReady);
  }, [deferUntilReady, threadKey]);

  useEffect(() => {
    if (!deferUntilReady && !isReady) {
      setIsReady(true);
    }
  }, [deferUntilReady, isReady]);

  useEffect(() => {
    if (!isHydrated || didCaptureInitialItemsRef.current) {
      return;
    }

    for (const item of items) {
      seenMessageKeysRef.current.add(item.key);
    }
    didCaptureInitialItemsRef.current = true;
    prevMessageCountRef.current = items.length;
  }, [isHydrated, items, items.length]);

  useEffect(() => {
    if (!didCaptureInitialItemsRef.current) {
      return;
    }
    if (items.length <= prevMessageCountRef.current) {
      prevMessageCountRef.current = items.length;
      return;
    }

    if (didRestoreScrollRef.current) {
      if (isAtBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom());
      } else {
        setShowNewMessagesBadge(true);
      }
    }

    prevMessageCountRef.current = items.length;
  }, [items.length, scrollToBottom]);

  useEffect(() => {
    if (!deferUntilReady || !isHydrated || feedItems.length > 0 || !hasMeasuredLayoutRef.current) {
      return;
    }

    setIsReady(true);
  }, [deferUntilReady, feedItems.length, isHydrated]);

  useEffect(() => {
    if (!isHydrated || didRestoreScrollRef.current || feedItems.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      if (scrollState.wasAtBottom || scrollState.offsetY <= 0) {
        listRef.current?.scrollToEnd({ animated: false });
      } else {
        listRef.current?.scrollToOffset({
          animated: false,
          offset: scrollState.offsetY,
        });
      }

      didRestoreScrollRef.current = true;
      syncChrome();
      requestAnimationFrame(() => setIsReady(true));
    });
  }, [feedItems.length, isHydrated, scrollState.offsetY, scrollState.wasAtBottom, syncChrome]);

  useEffect(() => {
    Animated.timing(newMessagesOpacity, {
      duration: 220,
      toValue: showNewMessagesBadge ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [newMessagesOpacity, showNewMessagesBadge]);

  useEffect(() => {
    Animated.timing(scrollToEndOpacity, {
      duration: 220,
      toValue: showScrollToEndButton ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [scrollToEndOpacity, showScrollToEndButton]);

  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      scrollMetricsRef.current.contentHeight = height;
      syncChrome();
    },
    [syncChrome]
  );

  const handleLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      hasMeasuredLayoutRef.current = true;
      scrollMetricsRef.current.viewportHeight = event.nativeEvent.layout.height;
      syncChrome();
      if (deferUntilReady && isHydrated && feedItems.length === 0) {
        setIsReady(true);
      }
    },
    [deferUntilReady, feedItems.length, isHydrated, syncChrome]
  );

  const handleScroll = useCallback(
    (event: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      scrollMetricsRef.current.contentHeight = contentSize.height;
      scrollMetricsRef.current.offsetY = contentOffset.y;
      scrollMetricsRef.current.viewportHeight = layoutMeasurement.height;
      syncChrome();
    },
    [syncChrome]
  );

  return {
    clearNewMessagesBadge: () => setShowNewMessagesBadge(false),
    didCaptureInitialItemsRef,
    getScrollState,
    handleContentSizeChange,
    handleLayout,
    handleScroll,
    initialContentOffset,
    isReady,
    listRef,
    maintainVisibleContentPosition,
    newMessagesOpacity,
    scrollToBottom,
    scrollToMessageKey,
    scrollToEndOpacity,
    scrollToMission,
    seenMessageKeysRef,
    showNewMessagesBadge,
    showScrollToEndButton,
  };
}
