import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
  Animated,
  Platform,
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
} from '@/src/features/feed/data/narrativeFeedClient';
import { useNarrativeSignal } from '@/src/features/feed/data/NarrativeSignalContext';
import { MessageBubble } from '@/components/feed/MessageBubble';
import {
  buildPlaybackMessages,
  type PlaybackMessage,
} from '@/src/features/feed/utils/playback';
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

export default function FeedScreen() {
  const { selectedMode, user } = useSession();
  const { lastSeenTime, markAsRead, pulse } = useNarrativeSignal();
  const insets = useSafeAreaInsets();
  const { focusedMissionId, registerScrollHandler, registerOptimisticHandler, highlightMission, quizSession } = useActiveMission();
  const { isVisible: isMissionBarVisible, isNative: isNativeMissionBar } = useActiveMissionBarVisible();

  const requestVersionRef = useRef(0);
  const activeInitialLoadsRef = useRef(0);
  const activeRefreshLoadsRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const latestSignalTokenRef = useRef<string | null>(null);
  const listRef = useRef<FlashListRef<FeedItem>>(null);
  const isAtBottomRef = useRef(true);
  const prevVisibleCountRef = useRef(0);
  const didInitialScrollRef = useRef(false);
  const isPositionedRef = useRef(false);
  const hasUserInteractedRef = useRef(false);
  const stickyDateHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPullToRefreshActiveRef = useRef(false);
  const didHydrateCacheRef = useRef(false);
  const scrollMetricsRef = useRef({ contentHeight: 0, offsetY: 0, viewportHeight: 0 });

  const navigation = useNavigation<any>();
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [bundles, setBundles] = useState<NarrativeBundleDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [showNewMessagesBadge, setShowNewMessagesBadge] = useState(false);
  const [showScrollToEndButton, setShowScrollToEndButton] = useState(false);
  const [isPositioned, setIsPositioned] = useState(false);
  const [isStickyHeaderShown, setIsStickyHeaderShown] = useState(false);
  const newMessagesOpacity = useRef(new Animated.Value(0)).current;
  const scrollToEndOpacity = useRef(new Animated.Value(0)).current;
  const scrollToEndIconOpacity = useRef(new Animated.Value(0)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;

  const bottomSpacerHeight = Math.max(72, insets.bottom + SCROLL_TO_END_BOTTOM_GAP) + (quizSession ? 260 : (isMissionBarVisible || focusedMissionId) ? 140 : 0);
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

  const cacheKey = user ? `mytopia_feed_cache:${user.id}:${selectedMode}` : null;

  const playbackMessages = useMemo(() => buildPlaybackMessages(bundles), [bundles]);
  const visibleMessages = useMemo(
    () => playbackMessages.filter((item) => item.revealAtMs <= clockMs),
    [clockMs, playbackMessages]
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
      .filter((m) => m.message.attachment?._type === 'imageAttachment')
      .map((m) => ({ uri: (m.message.attachment as any).url }));
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

      try {
        const page = await fetchNarrativeFeedPage({ limit: 40, mode: selectedMode });
        if (requestVersion !== requestVersionRef.current) return;

        setBundles((current) => mergeFreshBundles(current, page.bundles));
        setNextCursor((current) => current ?? page.nextCursor);
        setClockMs(Date.now());
      } catch (error) {
        if (requestVersion !== requestVersionRef.current) return;
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load narrative feed.');
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
      }
    },
    [selectedMode, user]
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
      setClockMs(Date.now());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load more feed items.');
    } finally {
      setIsLoadingMore(false);
      console.log(`[SCROLL_DEBUG] loadMore finished`);
    }
  }, [isLoadingMore, isRefreshing, nextCursor, selectedMode, user]);

  const handleRefresh = useCallback(() => {
    isPullToRefreshActiveRef.current = true;
    void loadFirstPage('refresh');
  }, [loadFirstPage]);

  const scrollToBottom = useCallback((options?: { animated?: boolean }) => {
    if (localFeedItems.length === 0) return;
    const animated = options?.animated ?? true;
    listRef.current?.scrollToEnd({ animated });
  }, [localFeedItems.length]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        selectedMode === 'dev' ? (
          <Text style={styles.modeBadge}>Dev Mode</Text>
        ) : null,
    });
  }, [navigation, selectedMode]);

  useEffect(() => {
    if (!user || !cacheKey) {
      setBundles([]);
      setNextCursor(null);
      setErrorMessage(null);
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
        setClockMs(Date.now());
        setIsLoadingInitial(false);
      })
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) void loadFirstPage(didHydrateCacheRef.current ? 'silent' : 'initial');
      });

    return () => { isCancelled = true; };
  }, [cacheKey, loadFirstPage, user]);

  useEffect(() => {
    if (!cacheKey || bundles.length === 0) return;
    const payload: FeedCachePayload = {
      bundles: bundles.slice(-FEED_CACHE_LIMIT),
      nextCursor,
      savedAt: Date.now(),
      version: FEED_CACHE_VERSION,
    };
    AsyncStorage.setItem(cacheKey, JSON.stringify(payload)).catch(() => {});
  }, [bundles, cacheKey, nextCursor]);

  useFocusEffect(
    useCallback(() => {
      if (user) void loadFirstPage('silent');
    }, [loadFirstPage, user])
  );

  useEffect(() => {
    if (!user || (!pulse && latestSignalTokenRef.current === null)) return;
    if (pulse?.token && pulse.token !== latestSignalTokenRef.current) {
      latestSignalTokenRef.current = pulse.token;
      void loadFirstPage('silent');
    }
  }, [loadFirstPage, pulse, user]);

  useEffect(() => {
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
      const foundMissionId = (localFeedItems[targetIndex].data.message.attachment as any)?.missionId;
      if (foundMissionId) {
        highlightMission(foundMissionId);
      }
    };
    registerScrollHandler(handleScrollToMessage);
    return () => registerScrollHandler(null);
  }, [localFeedItems, registerScrollHandler, highlightMission]);

  useEffect(() => {
    registerOptimisticHandler(setBundles);
    return () => registerOptimisticHandler(null);
  }, [registerOptimisticHandler]);

  useEffect(() => {
    if (!user) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasInactive = appStateRef.current === 'inactive' || appStateRef.current === 'background';
      appStateRef.current = nextState;
      if (wasInactive && nextState === 'active') void loadFirstPage('silent');
    });
    return () => subscription.remove();
  }, [loadFirstPage, user]);

  useEffect(() => {
    if (visibleMessages.length > prevVisibleCountRef.current) {
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
  }, [scrollToBottom, visibleMessages.length, !!quizSession]);

  useEffect(() => {
    if (!didInitialScrollRef.current && !isLoadingInitial && visibleMessages.length > 0 && !isPositionedRef.current) {
      const scrollInitial = () => {
        if (!listRef.current) return;
        
        let targetIndex = -1;
        if (lastSeenTime) {
          // Find first unread message
          targetIndex = localFeedItems.findIndex(item => 
            item.type === 'message' && item.data.revealAtMs > lastSeenTime
          );
        }

        if (targetIndex !== -1) {
          listRef.current.scrollToIndex({ index: targetIndex, animated: false, viewPosition: 0 });
        } else {
          listRef.current.scrollToEnd({ animated: false });
        }
        
        didInitialScrollRef.current = true;
        // Small delay to let FlashList settle before showing
        setTimeout(() => {
          setIsPositioned(true);
          isPositionedRef.current = true;
        }, 100);
      };
      
      requestAnimationFrame(scrollInitial);
    }
  }, [isLoadingInitial, visibleMessages.length, localFeedItems, lastSeenTime]);

  useEffect(() => {
    Animated.timing(newMessagesOpacity, { toValue: showNewMessagesBadge ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [showNewMessagesBadge, newMessagesOpacity]);

  useEffect(() => {
    Animated.timing(scrollToEndOpacity, { toValue: showScrollToEndButton ? 1 : 0, duration: 220, useNativeDriver: true }).start();
    Animated.timing(scrollToEndIconOpacity, { toValue: showScrollToEndButton ? 1 : 0, duration: 220, useNativeDriver: true }).start();
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
    Animated.timing(headerOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [clearStickyHeaderHideTimeout, headerOpacity]);

  const scheduleStickyHeaderHide = useCallback(() => {
    clearStickyHeaderHideTimeout();
    stickyDateHideTimeoutRef.current = setTimeout(() => {
      Animated.timing(headerOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(({ finished }) => {
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
    const now = Date.now();
    let nextRevealAtMs = Number.POSITIVE_INFINITY;
    for (const item of playbackMessages) {
      if (item.revealAtMs > now && item.revealAtMs < nextRevealAtMs) nextRevealAtMs = item.revealAtMs;
    }
    if (!Number.isFinite(nextRevealAtMs)) return;
    const timeoutMs = Math.max(25, nextRevealAtMs - now + 25);
    const timer = setTimeout(() => setClockMs(Date.now()), timeoutMs);
    return () => clearTimeout(timer);
  }, [playbackMessages, clockMs]);

  useEffect(() => {
    const parentNavigation = navigation.getParent();
    if (!parentNavigation) return;
    const unsubscribe = parentNavigation.addListener('tabPress', (e: any) => {
      const feedTabKey = parentNavigation.getState().routes.find((route: any) => route.name === 'feed')?.key;
      if (e.target === feedTabKey && navigation.isFocused()) scrollToBottom();
    });
    return unsubscribe;
  }, [navigation, scrollToBottom]);

  const renderItem = useCallback(({ item, target }: ListRenderItemInfo<FeedItem>) => {
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
    const isSystem = !isPlayer && playbackMessage.message.actor.name === 'System';

    if (isSystem) {
      return (
        <View style={styles.messageRow}>
          <SystemMessage text={playbackMessage.message.text || ''} />
        </View>
      );
    }

    return (
      <View style={[styles.messageRow, isPlayer ? styles.playerMessageRow : styles.npcMessageRow]}>
        <MessageBubble
          message={playbackMessage.message}
          showAvatar={!isPlayer}
          showName={!isPlayer}
          gallerySources={imageSources}
          onImagePress={(imageUrl) => {
            const index = imageSources.findIndex((s) => s.uri === imageUrl);
            if (index !== -1) {
              setViewerIndex(index);
              setViewerVisible(true);
            }
          }}
        />
      </View>
    );
  }, [headerOpacity, imageSources, isStickyHeaderShown]);

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
        onLoad={() => {
          if (!isPositionedRef.current) {
            setIsPositioned(true);
            isPositionedRef.current = true;
          }
        }}
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

          if (isCloseToBottom && showNewMessagesBadge) {
            setShowNewMessagesBadge(false);
            void markAsRead();
          }
        }}
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

      <Animated.View style={StyleSheet.flatten([styles.newMessagesContainer, { bottom: newMessagesBottom, opacity: newMessagesOpacity, pointerEvents: showNewMessagesBadge ? 'auto' : 'none' }])}>
        <Pressable style={styles.newMessagesButton} onPress={() => { scrollToBottom(); setShowNewMessagesBadge(false); }}>
          <FeedDownArrowIcon color="white" size={18} variant="bold" />
          <Text style={styles.newMessagesText}>Neue Nachrichten</Text>
        </Pressable>
      </Animated.View>

      <Animated.View pointerEvents={showScrollToEndButton ? 'box-none' : 'none'} style={[styles.scrollToEndButtonWrap, { bottom: scrollToEndButtonBottom, opacity: scrollToEndOpacity }]}>
        <Pressable accessibilityLabel="Zum Ende scrollen" onPress={() => scrollToBottom()} style={({ pressed }) => [styles.scrollToEndPressable, pressed && styles.scrollToEndPressed]}>
          <View style={[styles.scrollToEndButton, styles.scrollToEndButtonFallback]}>
            <FeedDownArrowIcon color={theme.colors.cardTextHeading} size={22} variant={SCROLL_TO_END_ICON_VARIANT} />
          </View>
        </Pressable>
      </Animated.View>

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

function mergeFreshBundles(current: NarrativeBundleDto[], incoming: NarrativeBundleDto[]) {
  const map = new Map(current.map(b => [b._id, b]));
  for (const b of incoming) map.set(b._id, b);
  return Array.from(map.values());
}

function mergeOlderBundles(current: NarrativeBundleDto[], incoming: NarrativeBundleDto[]) {
  const map = new Map(current.map(b => [b._id, b]));
  for (const b of incoming) if (!map.has(b._id)) map.set(b._id, b);
  return Array.from(map.values());
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
  headerOpacity: Animated.Value;
  isStickyHeaderShown: boolean;
  target: ListRenderItemInfo<FeedItem>['target'];
  title: string;
}) {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const isSticky = target === 'StickyHeader';
  const kind = isSticky ? 'sticky' : target === 'Cell' ? 'regular' : 'measurement';

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, width, x, y } = event.nativeEvent.layout;
  }, [headerKey, kind, target, title]);

  // Both 'sticky' and 'regular' now share the EXACT same layout structure and styles.
  // The only difference is how opacity is handled.
  return (
    <Animated.View
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
    </Animated.View>
  );
}
