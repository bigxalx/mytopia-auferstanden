import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  type LayoutChangeEvent,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
  Animated as RNAnimated,
} from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { theme } from '@/src/shared/ui/theme';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ImageView from 'react-native-image-viewing';

import { useSession } from '@/src/core/session/SessionContext';
import {
  fetchNarrativeFeedPage,
  type NarrativeBundleDto,
  type NarrativeMessageDto,
} from '@/src/features/feed/data/narrativeFeedClient';
import { useChannels } from '@/src/features/channels/data/ChannelContext';
import { useNarrativeSignal } from '@/src/features/feed/data/NarrativeSignalContext';
import { MessageBubble } from '@/components/feed/MessageBubble';
import { type PlaybackMessage } from '@/src/features/feed/utils/playback';
import { useActiveMission, useActiveMissionBarVisible } from '@/src/features/tasks/context/ActiveMissionContext';
import { SystemMessage } from '@/components/feed/SystemMessage';
import { MissionChatInput } from '@/components/feed/MissionChatInput';
import { MissionChoicePicker } from '@/components/feed/MissionChoicePicker';

const SCROLL_TO_END_ICON_VARIANT: 'outline' | 'bold' = 'outline';
const SCROLL_TO_END_SHOW_THRESHOLD_PX = 180;
const SCROLL_TO_END_BOTTOM_GAP = 108;
const STICKY_DATE_HIDE_DELAY_MS = 700;
const ENABLE_STICKY_DATE_HEADERS = false; // Feature flag to disable sticky behavior
const FEED_CACHE_VERSION = 1;
const FEED_CACHE_LIMIT = 80;

type FeedCachePayload = {
  bundles: NarrativeBundleDto[];
  nextCursor: string | null;
  savedAt: number;
  version: number;
};

type FeedItem =
  | { type: 'message'; data: PlaybackMessage; key: string }
  | { type: 'header'; title: string; key: string };

type HubFeedSessionSnapshot = {
  bundles: NarrativeBundleDto[];
  cacheKey: string;
  nextCursor: string | null;
};

let hubFeedSessionSnapshot: HubFeedSessionSnapshot | null = null;

export default function FeedScreen() {
  const { selectedMode, user } = useSession();
  const { lastSeenTime, markAsRead, pulse } = useNarrativeSignal();
  const { getChannelScrollState, saveChannelScrollState } = useChannels();
  const cacheKey = user ? `mytopia_feed_cache:${user.id}:${selectedMode}` : null;
  const sessionSnapshot =
    cacheKey && hubFeedSessionSnapshot?.cacheKey === cacheKey ? hubFeedSessionSnapshot : null;
  const hasSessionSnapshot = Boolean(sessionSnapshot);
  const restoredScrollState = getChannelScrollState('hub');
  const restoredScrollOffset = restoredScrollState.offsetY;
  const logTag = useMemo(() => {
    const rawDeviceName =
      typeof Constants.deviceName === 'string' && Constants.deviceName.trim().length > 0
        ? Constants.deviceName.trim().replace(/\s+/g, '-')
        : 'unknown-device';
    return `[hubFeed:${Platform.OS}:${rawDeviceName}]`;
  }, []);
  const logHub = useCallback((event: string, details?: Record<string, unknown>) => {
    if (details) {
      console.log(`${logTag} ${event}`, details);
      return;
    }
    console.log(`${logTag} ${event}`);
  }, [logTag]);
  const insets = useSafeAreaInsets();
  const {
    activeChannel,
    focusedMissionId,
    registerScrollHandler,
    registerOptimisticHandler,
    highlightMission,
    quizSession,
    setActiveChannel,
  } = useActiveMission();
  const { isVisible: isMissionBarVisible, isNative: isNativeMissionBar } = useActiveMissionBarVisible();
  const showMissionComposer = activeChannel.channelType === 'actor';

  const requestVersionRef = useRef(0);
  const activeInitialLoadsRef = useRef(0);
  const activeRefreshLoadsRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const latestSignalTokenRef = useRef<string | null>(null);
  const listRef = useRef<FlashListRef<FeedItem>>(null);
  const initialSessionSnapshotRef = useRef(sessionSnapshot);
  const isAtBottomRef = useRef(true);
  const prevVisibleCountRef = useRef(hasSessionSnapshot ? (sessionSnapshot?.bundles.reduce((sum, bundle) => sum + bundle.messages.length, 0) ?? 0) : 0);
  const didInitialScrollRef = useRef(false);
  const isPositionedRef = useRef(false);
  const hasUserInteractedRef = useRef(false);
  const stickyDateHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPullToRefreshActiveRef = useRef(false);
  const didHydrateCacheRef = useRef(false);
  const canRefreshFromSignalsRef = useRef(false);
  const scrollMetricsRef = useRef({ contentHeight: 0, offsetY: 0, viewportHeight: 0 });
  const seenMessageKeysRef = useRef(new Set<string>());

  const navigation = useNavigation<any>();
  const [bundles, setBundles] = useState<NarrativeBundleDto[]>(() => sessionSnapshot?.bundles ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(() => sessionSnapshot?.nextCursor ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingInitial, setIsLoadingInitial] = useState(() => !sessionSnapshot);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [showNewMessagesBadge, setShowNewMessagesBadge] = useState(false);
  const [showScrollToEndButton, setShowScrollToEndButton] = useState(false);
  const [isPositioned, setIsPositioned] = useState(false);
  const [isStickyHeaderShown, setIsStickyHeaderShown] = useState(false);
  const newMessagesOpacity = useRef(new RNAnimated.Value(0)).current;
  const scrollToEndOpacity = useRef(new RNAnimated.Value(0)).current;
  const scrollToEndIconOpacity = useRef(new RNAnimated.Value(0)).current;
  const headerOpacity = useRef(new RNAnimated.Value(0)).current;

  const bottomSpacerHeight = Math.max(72, insets.bottom + SCROLL_TO_END_BOTTOM_GAP) + (showMissionComposer ? (quizSession ? 260 : focusedMissionId ? 140 : 0) : 0);
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

  const visibleMessages = useMemo(
    () => flattenHubMessages(bundles),
    [bundles]
  );

  /**
   * INVERTED DATA Strategy:
   * Array: [Newest (bottom of screen), ..., Oldest (top of screen)]
   * Index 0 is the latest message.
   */
  const localFeedItems = useMemo(() => {
    const items: FeedItem[] = [];
    
    // Sort visible messages by time ascending (oldest first for standard top-to-bottom list)
    const sorted = [...visibleMessages].sort((a, b) => a.revealAtMs - b.revealAtMs);
    
    for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i];
        const prevItem = sorted[i - 1];
        const currentDay = getDayKey(item.revealAtMs);
        const prevDay = prevItem ? getDayKey(prevItem.revealAtMs) : null;
        
        if (currentDay !== prevDay) {
            items.push({ 
                type: 'header', 
                title: formatDayLabel(item.revealAtMs), 
                key: `header-${currentDay}` 
            });
        }
        items.push({ type: 'message', data: item, key: item.key });
    }
    return items;
  }, [visibleMessages]);

  const stickyHeaderIndices = useMemo(() => {
    if (!ENABLE_STICKY_DATE_HEADERS) return [];
    return localFeedItems
      .map((item, index) => (item.type === 'header' ? index : -1))
      .filter((index) => index !== -1);
  }, [localFeedItems]);

  const imageSources = useMemo(() => {
    return visibleMessages
      .filter((message: PlaybackMessage) => message.message.attachment?._type === 'imageAttachment')
      .map((message: PlaybackMessage) => ({
        uri: (message.message.attachment as Extract<NarrativeMessageDto['attachment'], { _type: 'imageAttachment' }>).url,
      }));
  }, [visibleMessages]);



  const loadFirstPage = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      if (!user) return;

      const requestVersion = requestVersionRef.current + 1;
      requestVersionRef.current = requestVersion;

      if (mode === 'initial') {
        activeInitialLoadsRef.current += 1;
        setIsLoadingInitial(true);
      }
      if (mode === 'refresh') {
        activeRefreshLoadsRef.current += 1;
        setIsRefreshing(true);
      }
      if (mode !== 'silent') setErrorMessage(null);
      logHub('loadFirstPage:start', {
        mode,
        requestVersion,
      });

      try {
        const page = await fetchNarrativeFeedPage({ limit: 40, mode: selectedMode });
        if (requestVersion !== requestVersionRef.current) return;

        setBundles((current) => reconcileLatestBundles(current, page.bundles));
        setNextCursor(page.nextCursor);
        logHub('loadFirstPage:success', {
          bundles: page.bundles.length,
          mode,
          nextCursor: page.nextCursor ? 'set' : 'none',
        });
      } catch (error) {
        if (requestVersion !== requestVersionRef.current) return;
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load narrative feed.');
        logHub('loadFirstPage:error', {
          message: error instanceof Error ? error.message : 'unknown',
          mode,
        });
      } finally {
        if (mode === 'initial') {
          activeInitialLoadsRef.current = Math.max(0, activeInitialLoadsRef.current - 1);
          setIsLoadingInitial(activeInitialLoadsRef.current > 0);
        }
        if (mode === 'refresh') {
          activeRefreshLoadsRef.current = Math.max(0, activeRefreshLoadsRef.current - 1);
          setIsRefreshing(activeRefreshLoadsRef.current > 0);
          if (activeRefreshLoadsRef.current === 0) {
            isPullToRefreshActiveRef.current = false;
          }
        }
        logHub('loadFirstPage:finally', {
          isLoadingInitial: activeInitialLoadsRef.current > 0,
          mode,
        });
      }
    },
    [logHub, selectedMode, user]
  );

  const loadMore = useCallback(async () => {
    if (
      !user ||
      !nextCursor ||
      isLoadingMore ||
      isRefreshing ||
      isPullToRefreshActiveRef.current
    ) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const page = await fetchNarrativeFeedPage({
        cursor: nextCursor,
        limit: 20,
        mode: selectedMode,
      });
      setBundles((current) => mergeOlderBundles(current, page.bundles));
      setNextCursor(page.nextCursor);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load more feed items.');
    } finally {
      setIsLoadingMore(false);
      console.log(`[SCROLL_DEBUG] loadMore finished`);
    }
  }, [isLoadingMore, isRefreshing, nextCursor, selectedMode, user]);


  const scrollToBottom = useCallback((options?: { animated?: boolean }) => {
    if (localFeedItems.length === 0) return;
    const animated = options?.animated ?? true;
    listRef.current?.scrollToEnd({ animated });
  }, [localFeedItems.length]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Notfallkanal',
      headerRight: () =>
        selectedMode === 'dev' ? (
          <Text style={styles.modeBadge}>Dev Mode</Text>
        ) : null,
    });
  }, [navigation, selectedMode]);

  useFocusEffect(
    useCallback(() => {
      logHub('focus', {
        hasSessionSnapshot,
        restoredScrollOffset,
      });
      canRefreshFromSignalsRef.current = false;
      setActiveChannel({
        channelId: 'hub',
        channelType: 'hub',
      });
      return () => {
        const distanceFromBottom = Math.max(
          0,
          scrollMetricsRef.current.contentHeight -
            (scrollMetricsRef.current.offsetY + scrollMetricsRef.current.viewportHeight)
        );
        logHub('blur:saveOffset', {
          distanceFromBottom,
          offsetY: scrollMetricsRef.current.offsetY,
        });
        saveChannelScrollState('hub', {
          distanceFromBottom,
          offsetY: scrollMetricsRef.current.offsetY,
          wasAtBottom: distanceFromBottom <= 120,
        });
      };
    }, [hasSessionSnapshot, logHub, restoredScrollOffset, saveChannelScrollState, setActiveChannel])
  );

  useEffect(() => {
    if (!user || !cacheKey) {
      setBundles([]);
      setNextCursor(null);
      setErrorMessage(null);
      hubFeedSessionSnapshot = null;
      logHub('bootstrap:resetNoUser');
      return;
    }

    didHydrateCacheRef.current = false;

    const bootstrapSnapshot = initialSessionSnapshotRef.current;

    if (bootstrapSnapshot) {
      didHydrateCacheRef.current = true;
      logHub('bootstrap:sessionSnapshot', {
        bundles: bootstrapSnapshot.bundles.length,
        nextCursor: bootstrapSnapshot.nextCursor ? 'set' : 'none',
        restoredScrollOffset,
      });
      void loadFirstPage('silent');
      return;
    }

    let isCancelled = false;
    AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        if (isCancelled || !raw) return;
        const parsed = JSON.parse(raw) as FeedCachePayload;
        if (parsed.version !== FEED_CACHE_VERSION || !Array.isArray(parsed.bundles)) return;
        didHydrateCacheRef.current = true;
        setBundles(parsed.bundles);
        setNextCursor(typeof parsed.nextCursor === 'string' ? parsed.nextCursor : null);
        setIsLoadingInitial(false);
        logHub('bootstrap:asyncStorage', {
          bundles: parsed.bundles.length,
          nextCursor: typeof parsed.nextCursor === 'string' ? 'set' : 'none',
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) void loadFirstPage(didHydrateCacheRef.current ? 'silent' : 'initial');
      });

    return () => { isCancelled = true; };
  }, [cacheKey, loadFirstPage, logHub, restoredScrollOffset, user]);

  useEffect(() => {
    seenMessageKeysRef.current.clear();
    scrollMetricsRef.current.offsetY = restoredScrollOffset;
    didInitialScrollRef.current = false;
    isPositionedRef.current = false;
    setIsPositioned(false);
    prevVisibleCountRef.current = hasSessionSnapshot ? visibleMessages.length : 0;
    logHub('positioning:reset', {
      hasSessionSnapshot,
      restoredScrollOffset,
      visibleMessages: visibleMessages.length,
    });
  }, [cacheKey, hasSessionSnapshot, logHub, restoredScrollOffset, visibleMessages.length]);

  useEffect(() => {
    if (!cacheKey) return;
    const payload: FeedCachePayload = {
      bundles: bundles.slice(-FEED_CACHE_LIMIT),
      nextCursor,
      savedAt: Date.now(),
      version: FEED_CACHE_VERSION,
    };
    AsyncStorage.setItem(cacheKey, JSON.stringify(payload)).catch(() => {});
  }, [bundles, cacheKey, nextCursor]);

  useEffect(() => {
    if (!cacheKey) {
      return;
    }
    if (bundles.length === 0 && isLoadingInitial) {
      return;
    }
    hubFeedSessionSnapshot = {
      bundles,
      cacheKey,
      nextCursor,
    };
  }, [bundles, cacheKey, isLoadingInitial, nextCursor]);

  useEffect(() => {
    if (!user || (!pulse && latestSignalTokenRef.current === null)) return;
    if (!canRefreshFromSignalsRef.current) return;
    if (pulse?.token && pulse.token !== latestSignalTokenRef.current) {
      latestSignalTokenRef.current = pulse.token;
      void loadFirstPage('silent');
    }
  }, [loadFirstPage, pulse, user]);

  useFocusEffect(
    useCallback(() => {
      const handleScrollToMessage = (missionIdOrTitle: string) => {
      hasUserInteractedRef.current = true;

      if (missionIdOrTitle === 'bottom') {
        scrollToBottom();
        return;
      }

      const targetIndex = localFeedItems.findIndex(item => {
        if (item.type !== 'message') return false;
        const attachment = item.data.message.attachment;
        if (attachment?._type !== 'missionAttachment') return false;
        
        const m = attachment as any;
        // Match by ID primarily, or Title as fallback
        return m.missionId === missionIdOrTitle || m.missionTitle === missionIdOrTitle;
      });

      if (targetIndex === -1) return;
      listRef.current?.scrollToIndex({
        animated: true,
        index: targetIndex,
        viewOffset: 60,
        viewPosition: 0.5,
      });
      
      // Also trigger highlight in the context if we found it
      const targetItem = localFeedItems[targetIndex];
      const foundMissionId = targetItem.type === 'message' ? (targetItem.data.message.attachment as any)?.missionId : null;
      if (foundMissionId) {
        highlightMission(foundMissionId);
      }
      };

      registerScrollHandler(handleScrollToMessage);
      registerOptimisticHandler(setBundles);

      return () => {
        registerScrollHandler(null);
        registerOptimisticHandler(null);
      };
    }, [highlightMission, localFeedItems, registerOptimisticHandler, registerScrollHandler, scrollToBottom])
  );

  useEffect(() => {
    if (!user) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasInactive = appStateRef.current === 'inactive' || appStateRef.current === 'background';
      appStateRef.current = nextState;
      if (!canRefreshFromSignalsRef.current) {
        return;
      }
      if (wasInactive && nextState === 'active') void loadFirstPage('silent');
    });
    return () => subscription.remove();
  }, [loadFirstPage, user]);

  useEffect(() => {
    if (visibleMessages.length > prevVisibleCountRef.current) {
      logHub('visibleMessages:increase', {
        didInitialScroll: didInitialScrollRef.current,
        isAtBottom: isAtBottomRef.current,
        isPositioned: isPositionedRef.current,
        nextVisibleCount: visibleMessages.length,
        prevVisibleCount: prevVisibleCountRef.current,
      });
      if (quizSession) {
        // Force auto-scroll during active quiz sessions to follow conversation
        requestAnimationFrame(() => scrollToBottom());
      } else if (!isAtBottomRef.current && didInitialScrollRef.current && isPositionedRef.current) {
        setShowNewMessagesBadge(true);
      } else if (didInitialScrollRef.current) {
        requestAnimationFrame(() => scrollToBottom());
      }
      prevVisibleCountRef.current = visibleMessages.length;
    }
  }, [logHub, scrollToBottom, visibleMessages.length, quizSession]);

  useEffect(() => {
    if (!didInitialScrollRef.current && !isLoadingInitial && visibleMessages.length > 0 && !isPositionedRef.current) {
      const scrollInitial = () => {
        if (!listRef.current) return;

        if (restoredScrollState.wasAtBottom) {
          listRef.current.scrollToEnd({ animated: false });
        } else if (restoredScrollOffset > 0) {
          listRef.current.scrollToOffset({ animated: false, offset: restoredScrollOffset });
        } else {
          let targetIndex = -1;
          if (lastSeenTime) {
            targetIndex = localFeedItems.findIndex(
              (item) => item.type === 'message' && item.data.revealAtMs > lastSeenTime
            );
          }

          if (targetIndex !== -1) {
            listRef.current.scrollToIndex({ index: targetIndex, animated: false, viewPosition: 0 });
          } else {
            listRef.current.scrollToEnd({ animated: false });
          }
        }

        didInitialScrollRef.current = true;
        prevVisibleCountRef.current = visibleMessages.length;
        logHub('positioning:initialApplied', {
          mode: restoredScrollOffset > 0 ? (hasSessionSnapshot ? 'snapshot-offset' : 'offset') : 'unread-or-bottom',
          restoredScrollOffset,
          visibleMessages: visibleMessages.length,
        });
        // Small delay to let FlashList settle before showing
        requestAnimationFrame(() => {
          setIsPositioned(true);
          isPositionedRef.current = true;
          canRefreshFromSignalsRef.current = true;
        });
      };
      
      requestAnimationFrame(scrollInitial);
    }
  }, [hasSessionSnapshot, isLoadingInitial, lastSeenTime, localFeedItems, logHub, restoredScrollOffset, restoredScrollState.wasAtBottom, visibleMessages.length]);

  useEffect(() => {
    RNAnimated.timing(newMessagesOpacity, { toValue: showNewMessagesBadge ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [showNewMessagesBadge, newMessagesOpacity]);

  useEffect(() => {
    RNAnimated.timing(scrollToEndOpacity, { toValue: showScrollToEndButton ? 1 : 0, duration: 220, useNativeDriver: true }).start();
    RNAnimated.timing(scrollToEndIconOpacity, { toValue: showScrollToEndButton ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [showScrollToEndButton, scrollToEndOpacity, scrollToEndIconOpacity]);

  const clearStickyHeaderHideTimeout = useCallback(() => {
    if (stickyDateHideTimeoutRef.current) {
      clearTimeout(stickyDateHideTimeoutRef.current);
      stickyDateHideTimeoutRef.current = null;
    }
  }, []);

  const showStickyHeader = useCallback(() => {
    clearStickyHeaderHideTimeout();
    setIsStickyHeaderShown(true);
    RNAnimated.timing(headerOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [clearStickyHeaderHideTimeout, headerOpacity]);

  const scheduleStickyHeaderHide = useCallback(() => {
    clearStickyHeaderHideTimeout();
    stickyDateHideTimeoutRef.current = setTimeout(() => {
      RNAnimated.timing(headerOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(({ finished }) => {
        if (finished) {
          setIsStickyHeaderShown(false);
        }
      });
    }, STICKY_DATE_HIDE_DELAY_MS);
  }, [clearStickyHeaderHideTimeout, headerOpacity]);

  useEffect(() => {
    return () => {
      clearStickyHeaderHideTimeout();
    };
  }, [clearStickyHeaderHideTimeout]);



  useEffect(() => {
    const parentNavigation = navigation.getParent();
    if (!parentNavigation) return;
    const unsubscribe = parentNavigation.addListener('tabPress', (e: any) => {
      const feedTabKey = parentNavigation.getState().routes.find((route: any) => route.name === 'feed')?.key;
      if (e.target === feedTabKey && navigation.isFocused()) scrollToBottom();
    });
    return unsubscribe;
  }, [navigation, scrollToBottom]);

  const renderItem = useCallback(({ item, index, target }: ListRenderItemInfo<FeedItem>) => {
    if (item.type === 'header') {
      return (
        <FeedDateHeader
          headerKey={item.key}
          headerOpacity={headerOpacity}
          isStickyHeaderShown={isStickyHeaderShown}
          target={target}
          title={item.title}
        />
      );
    }

    const playbackMessage: PlaybackMessage = item.data;
    const isPlayer = Boolean(playbackMessage.message.isUser);
    const attachmentType = playbackMessage.message.attachment?._type;
    const isSystem = attachmentType === 'systemAttachment';
    const isResultCard = attachmentType === 'missionResultAttachment';
    const shouldAnimate =
      didInitialScrollRef.current &&
      isPositionedRef.current &&
      !seenMessageKeysRef.current.has(item.key);

    if (!seenMessageKeysRef.current.has(item.key)) {
      seenMessageKeysRef.current.add(item.key);
    }

    if (isSystem) {
      return (
        <FeedAnimatedRow
          itemKey={item.key}
          shouldAnimate={shouldAnimate}
          style={[styles.messageRow, styles.centeredMessageRow]}
        >
          <SystemMessage
            text={playbackMessage.message.text || ''}
            variant={(playbackMessage.message.attachment as Extract<PlaybackMessage['message']['attachment'], { _type: 'systemAttachment' }>)?.kind ?? 'neutral'}
          />
        </FeedAnimatedRow>
      );
    }

    // --- Message Grouping Logic ---
    const prevItem = localFeedItems[index - 1];
    const nextItem = localFeedItems[index + 1];

    const currentActorName = playbackMessage.message.actor.name;
    const currentIsUser = isPlayer;

    const prevData = prevItem?.type === 'message' ? prevItem.data as PlaybackMessage : null;
    const nextData = nextItem?.type === 'message' ? nextItem.data as PlaybackMessage : null;

    const isFirstInGroup = !prevData || 
      prevData.message.actor.name !== currentActorName || 
      Boolean(prevData.message.isUser) !== currentIsUser;

    const isLastInGroup = !nextData || 
      nextData.message.actor.name !== currentActorName || 
      Boolean(nextData.message.isUser) !== currentIsUser;

    const showName = isFirstInGroup && !isPlayer;
    const showAvatar = isLastInGroup && !isPlayer;
    const marginBottom = isLastInGroup ? 16 : 4;
    const rowStyle = isResultCard
      ? styles.centeredMessageRow
      : isPlayer
        ? styles.playerMessageRow
        : styles.npcMessageRow;

    return (
      <FeedAnimatedRow
        itemKey={item.key}
        shouldAnimate={shouldAnimate}
        style={[styles.messageRow, { marginBottom }, rowStyle]}
      >
        <MessageBubble
          message={playbackMessage.message}
          showAvatar={showAvatar}
          showName={showName}
          isLastInGroup={isLastInGroup}
          gallerySources={imageSources}
          onImagePress={(idx) => {
            setViewerIndex(idx);
            setViewerVisible(true);
          }}
        />
      </FeedAnimatedRow>
    );
  }, [headerOpacity, imageSources, isStickyHeaderShown, localFeedItems]);

  const ListHeader = useMemo(() => (
    <View>
      {errorMessage && (
        <View style={StyleSheet.flatten([styles.errorBanner, { marginBottom: 14 }])}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}
      {isLoadingInitial && (
        <View style={StyleSheet.flatten([styles.stateBox, { marginBottom: 14 }])}>
          <ActivityIndicator size="large" color={theme.colors.orange} />
          <Text style={styles.stateText}>Feed wird geladen...</Text>
        </View>
      )}
      {!isLoadingInitial && visibleMessages.length === 0 && (
        <View style={StyleSheet.flatten([styles.stateBox, { marginBottom: 14 }])}>
          <Text style={styles.stateText}>Noch keine Nachrichten verfügbar.</Text>
        </View>
      )}
    </View>
  ), [errorMessage, isLoadingInitial, visibleMessages.length]);

  return (
    <>
      <FlashList
        ref={listRef}
        data={localFeedItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        stickyHeaderIndices={stickyHeaderIndices}
        onScroll={(event) => {
          const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
          scrollMetricsRef.current.contentHeight = contentSize.height;
          scrollMetricsRef.current.offsetY = contentOffset.y;
          scrollMetricsRef.current.viewportHeight = layoutMeasurement.height;
          const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
          const isCloseToBottom = distanceFromBottom <= 100;
          
          isAtBottomRef.current = isCloseToBottom;
          
          // Show button when NOT at the bottom (scrolled up)
          setShowScrollToEndButton(distanceFromBottom > SCROLL_TO_END_SHOW_THRESHOLD_PX);

          if (isCloseToBottom) {
            if (showNewMessagesBadge) setShowNewMessagesBadge(false);
            void markAsRead();
          }
        }}
        scrollEventThrottle={16}
        onEndReached={() => {
          if (nextCursor && !isLoadingMore && !isLoadingInitial && !isRefreshing) loadMore();
        }}
        onEndReachedThreshold={0.5}
        onLayout={(event) => {
          scrollMetricsRef.current.viewportHeight = event.nativeEvent.layout.height;
        }}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={<View style={{ height: bottomSpacerHeight }} />}
        onScrollBeginDrag={() => {
          hasUserInteractedRef.current = true;
          showStickyHeader();
        }}
        onMomentumScrollBegin={() => {
          showStickyHeader();
        }}
        onScrollEndDrag={() => {
          scheduleStickyHeaderHide();
        }}
        onMomentumScrollEnd={() => {
          scheduleStickyHeaderHide();
        }}
        style={StyleSheet.flatten([styles.scrollView, { opacity: isPositioned ? 1 : 0 }])}
        contentContainerStyle={styles.scrollContent}
      />

      {quizSession ? (
        <MissionChoicePicker />
      ) : (
        <MissionChatInput />
      )}

      {isLoadingInitial && (
        <View style={styles.positioningOverlay}>
          <ActivityIndicator size="large" color={theme.colors.orange} />
        </View>
      )}

      <RNAnimated.View style={StyleSheet.flatten([styles.newMessagesContainer, { bottom: newMessagesBottom, opacity: newMessagesOpacity, pointerEvents: showNewMessagesBadge ? 'auto' : 'none' }])}>
        <Pressable style={styles.newMessagesButton} onPress={() => { scrollToBottom(); setShowNewMessagesBadge(false); }}>
          <FeedDownArrowIcon color="white" size={18} variant="bold" />
          <Text style={styles.newMessagesText}>Neue Nachrichten</Text>
        </Pressable>
      </RNAnimated.View>

      <RNAnimated.View pointerEvents={showScrollToEndButton ? 'box-none' : 'none'} style={[styles.scrollToEndButtonWrap, { bottom: scrollToEndButtonBottom, opacity: scrollToEndOpacity }]}>
        <Pressable accessibilityLabel="Zum Ende scrollen" onPress={() => scrollToBottom()} style={({ pressed }) => [styles.scrollToEndPressable, pressed && styles.scrollToEndPressed]}>
          <View style={[styles.scrollToEndButton, styles.scrollToEndButtonFallback]}>
            <FeedDownArrowIcon color={theme.colors.cardTextHeading} size={22} variant={SCROLL_TO_END_ICON_VARIANT} />
          </View>
        </Pressable>
      </RNAnimated.View>

      <ImageView images={imageSources} imageIndex={viewerIndex} visible={viewerVisible} onRequestClose={() => setViewerVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: { backgroundColor: theme.colors.background } as ViewStyle,
  scrollContent: { padding: 20, paddingBottom: 24 } as ViewStyle,
  messageRow: { marginBottom: 12 } as ViewStyle,
  playerMessageRow: { alignItems: 'flex-end' } as ViewStyle,
  npcMessageRow: { alignItems: 'flex-start' } as ViewStyle,
  centeredMessageRow: { alignItems: 'center' } as ViewStyle,
  errorBanner: { backgroundColor: theme.colors.errorSurface, borderColor: theme.colors.errorBorder, borderRadius: 12, borderWidth: 1, padding: 12 } as ViewStyle,
  errorText: { color: theme.colors.errorText, fontSize: 13, lineHeight: 18 } as TextStyle,
  stateBox: { alignItems: 'center', backgroundColor: theme.colors.headerBackground, borderRadius: 12, gap: 8, padding: 20 } as ViewStyle,
  stateText: { color: theme.colors.textSecondary, fontSize: 14 } as TextStyle,
  daySeparatorWrap: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    gap: 10, 
    marginBottom: 16, 
    marginTop: 28, 
    backgroundColor: 'transparent',
    // Ensure height is consistent to prevent layout jumps
    height: 32,
  } as ViewStyle,
  daySeparatorLine: { flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.08)' } as ViewStyle,
  daySeparatorPill: { backgroundColor: '#3D4344', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, minWidth: 100, alignItems: 'center', justifyContent: 'center' } as ViewStyle,
  daySeparatorText: { color: 'rgba(238, 242, 239, 0.88)', fontFamily: 'NunitoSans_700Bold', fontSize: 12, letterSpacing: 0.2, textAlign: 'center' } as TextStyle,
  newMessagesContainer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 } as ViewStyle,
  newMessagesButton: { backgroundColor: theme.colors.orange, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, gap: 8, elevation: 8 } as ViewStyle,
  newMessagesText: { color: 'white', fontSize: 14, fontWeight: '700', fontFamily: 'Nunito_700Bold' } as TextStyle,
  scrollToEndButtonWrap: { position: 'absolute', right: 16, zIndex: 110 } as ViewStyle,
  scrollToEndPressable: {} as ViewStyle,
  scrollToEndPressed: { opacity: 0.82 } as ViewStyle,
  scrollToEndButton: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 38, justifyContent: 'center', overflow: 'hidden', width: 38, elevation: 10 } as ViewStyle,
  scrollToEndButtonFallback: { backgroundColor: 'rgba(237, 236, 224, 0.82)', borderColor: 'rgba(255, 255, 255, 0.18)' } as ViewStyle,
  modeBadge: { color: theme.colors.orange, fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 4, textTransform: 'uppercase' } as TextStyle,
  positioningOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center', zIndex: 1000 } as ViewStyle,
});

function FeedAnimatedRow({
  children,
  itemKey,
  shouldAnimate,
  style,
}: {
  children: React.ReactNode;
  itemKey: string;
  shouldAnimate: boolean;
  style?: ViewStyle | ViewStyle[];
}) {
  const opacity = useRef(new RNAnimated.Value(shouldAnimate ? 0 : 1)).current;
  const translateY = useRef(new RNAnimated.Value(shouldAnimate ? 10 : 0)).current;

  useEffect(() => {
    if (!shouldAnimate) {
      opacity.stopAnimation();
      translateY.stopAnimation();
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }

    opacity.stopAnimation();
    translateY.stopAnimation();
    opacity.setValue(0);
    translateY.setValue(10);
    RNAnimated.parallel([
      RNAnimated.timing(opacity, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      RNAnimated.timing(translateY, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [itemKey, opacity, shouldAnimate, translateY]);

  if (!shouldAnimate) {
    return <View style={style}>{children}</View>;
  }

  return (
    <RNAnimated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      {children}
    </RNAnimated.View>
  );
}

function getDayKey(timestampMs: number) {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayLabel(timestampMs: number) {
  const date = new Date(timestampMs);
  const relativeDay = formatRelativeDay(date);
  if (relativeDay) return relativeDay;
  const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const dd = String(date.getDate());
  const mm = String(date.getMonth() + 1);
  return `${weekdays[date.getDay()]}, ${dd}.${mm}.${date.getFullYear()}`;
}

function formatRelativeDay(date: Date) {
  const now = new Date();
  const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((d1 - d2) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === -1) return 'Gestern';
  return null;
}

function mergeOlderBundles(current: NarrativeBundleDto[], incoming: NarrativeBundleDto[]) {
  const map = new Map(current.map(b => [b._id, b]));
  for (const b of incoming) if (!map.has(b._id)) map.set(b._id, b);
  return Array.from(map.values());
}

function flattenHubMessages(bundles: NarrativeBundleDto[]): PlaybackMessage[] {
  const sortedBundles = [...bundles].sort((a, b) => Date.parse(a.releaseAt) - Date.parse(b.releaseAt));
  const items: PlaybackMessage[] = [];

  for (const bundle of sortedBundles) {
    const bundleReleaseMs = Date.parse(bundle.releaseAt);
    const revealAtMs = Number.isFinite(bundleReleaseMs) ? bundleReleaseMs : Date.now();

    for (const message of bundle.messages) {
      items.push({
        bundleId: bundle._id,
        bundleTitle: bundle.title,
        key: `${bundle._id}:${message.messageId}`,
        message: { ...message, isUser: bundle.isUser ?? message.isUser },
        revealAtMs,
      });
    }
  }

  return items;
}

function reconcileLatestBundles(current: NarrativeBundleDto[], incoming: NarrativeBundleDto[]) {
  if (current.length === 0) {
    return incoming;
  }
  if (incoming.length === 0) {
    return [];
  }

  const oldestIncomingReleaseMs = incoming.reduce((oldest, bundle) => {
    const releaseMs = Date.parse(bundle.releaseAt);
    return Number.isFinite(releaseMs) ? Math.min(oldest, releaseMs) : oldest;
  }, Number.POSITIVE_INFINITY);

  const incomingIds = new Set(incoming.map((bundle) => bundle._id));
  const preservedOlderBundles = current.filter((bundle) => {
    if (incomingIds.has(bundle._id)) {
      return false;
    }
    const releaseMs = Date.parse(bundle.releaseAt);
    if (!Number.isFinite(releaseMs)) {
      return false;
    }
    return releaseMs < oldestIncomingReleaseMs;
  });

  return [...preservedOlderBundles, ...incoming].sort(
    (a, b) => Date.parse(a.releaseAt) - Date.parse(b.releaseAt)
  );
}



function FeedDownArrowIcon({ color, size, variant }: { color: string; size: number; variant: 'outline' | 'bold' }) {
  return (
    <Svg color={color} fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Path
        d={variant === 'bold' ? "M7.75 9.5L12 13.75L16.25 9.5" : "M8 9.75L12 13.75L16 9.75"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={variant === 'bold' ? "3.25" : "2.4"}
      />
    </Svg>
  );
}

function FeedDateHeader({
  headerKey,
  headerOpacity,
  isStickyHeaderShown,
  target,
  title,
}: {
  headerKey: string;
  headerOpacity: RNAnimated.Value;
  isStickyHeaderShown: boolean;
  target: ListRenderItemInfo<FeedItem>['target'];
  title: string;
}) {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const isSticky = target === 'StickyHeader';

  const handleLayout = useCallback((_event: LayoutChangeEvent) => {
    // Layout tracking placeholder
  }, []);

  // Both 'sticky' and 'regular' now share the EXACT same layout structure and styles.
  // The only difference is how opacity is handled.
  return (
    <RNAnimated.View
      onLayout={handleLayout}
      pointerEvents={isSticky ? 'none' : 'auto'}
      style={[
        styles.daySeparatorWrap,
        isSticky && { 
          opacity: headerOpacity,
          // When stuck at top, we don't want the margin-top to push it down
          marginTop: 0,
          marginBottom: 0,
          // But we need to keep the content position consistent
          paddingTop: 28,
          // Use solid background to mask the lines of the 'Cell' underneath
          backgroundColor: theme.colors.background,
          // Ensure it covers full width to mask lines
          width: '100%',
        }
      ]}
    >
      {/* Side lines are hidden in the sticky header version */}
      <View style={[styles.daySeparatorLine, isSticky && { opacity: 0 }]} />
      
      <View style={styles.daySeparatorPill}>
        <Text style={styles.daySeparatorText}>{title}</Text>
      </View>

      <View style={[styles.daySeparatorLine, isSticky && { opacity: 0 }]} />
    </RNAnimated.View>
  );
}
