import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
  Animated,
  LayoutAnimation,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import Svg, { Path } from 'react-native-svg';
import { theme } from '@/src/shared/ui/theme';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ImageView from 'react-native-image-viewing';
import { createNativeTabStackOptions } from '@/src/shared/navigation/nativeTabStackOptions';

import { useSession } from '@/src/core/session/SessionContext';
import {
  fetchNarrativeFeedPage,
  type NarrativeBundleDto,
} from '@/src/features/feed/data/narrativeFeedClient';
import { useNarrativeSignal } from '@/src/features/feed/data/NarrativeSignalContext';
import { MessageBubble } from '@/components/feed/MessageBubble';
import {
  buildPlaybackMessages,
} from '@/src/features/feed/utils/playback';
import { useActiveMissionBarVisible } from '@/src/features/tasks/context/ActiveMissionContext';

const SCROLL_TO_END_ICON_VARIANT: 'outline' | 'bold' = 'outline';
const SCROLL_TO_END_SHOW_THRESHOLD_PX = 180;
const SCROLL_TO_END_BOTTOM_GAP = 108;
const STICKY_DATE_HIDE_DELAY_MS = 700;
const FEED_CACHE_VERSION = 1;
const FEED_CACHE_LIMIT = 80;
const OLDER_MESSAGES_THRESHOLD_PX = 140;
const IS_GLASS_EFFECT_ENABLED =
  Platform.OS === 'ios' &&
  isGlassEffectAPIAvailable() &&
  isLiquidGlassAvailable();

type FeedItem = 
  | { type: 'header'; key: string; title: string; revealAtMs: number }
  | { type: 'message'; key: string; message: any; bundleId: string; revealAtMs: number; 
      showAvatar: boolean; showName: boolean; marginTop: number };

type FeedCachePayload = {
  bundles: NarrativeBundleDto[];
  nextCursor: string | null;
  savedAt: number;
  version: number;
};

export default function FeedScreen() {
  const { selectedMode, user } = useSession();
  const { lastSeenTime, markAsRead, pulse, refreshKey } = useNarrativeSignal();
  const insets = useSafeAreaInsets();
  const { isVisible: isMissionBarVisible, isNative: isNativeMissionBar } = useActiveMissionBarVisible();

  const requestVersionRef = useRef(0);
  const activeInitialLoadsRef = useRef(0);
  const activeRefreshLoadsRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const latestSignalTokenRef = useRef<string | null>(null);
  const initialRefreshKeyRef = useRef(refreshKey);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const listMetricsRef = useRef({ contentHeight: 0, viewportHeight: 0, currentOffsetY: 0 });
  const isAtBottomRef = useRef(true);
  const prevVisibleCountRef = useRef(0);
  const didInitialScrollRef = useRef(false);
  const isPositionedRef = useRef(false);
  const pendingPrependAdjustmentRef = useRef<null | { previousContentHeight: number; previousOffsetY: number }>(null);
  const didHydrateCacheRef = useRef(false);
  const messageOffsetsRef = useRef<Record<string, number>>({});
  const headerOffsetsRef = useRef<Record<string, number>>({});
  const stickyDateHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [activeSectionTitle, setActiveSectionTitle] = useState<string | null>(null);
  const [isPositioned, setIsPositioned] = useState(false);
  const newMessagesOpacity = useRef(new Animated.Value(0)).current;
  const scrollToEndOpacity = useRef(new Animated.Value(0)).current;
  const scrollToEndIconOpacity = useRef(new Animated.Value(0)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;

  const bottomSpacerHeight = Math.max(72, insets.bottom + SCROLL_TO_END_BOTTOM_GAP);
  const scrollToEndButtonBottom = isNativeMissionBar
    ? Math.max(insets.bottom + 16, 24)  // Native bottom accessory adjusts safe area automatically
    : isMissionBarVisible 
      ? Math.max(insets.bottom + 92, 108)  // Fallback bar needs manual spacing adjustment
      : Math.max(insets.bottom + 16, 24);  // No mission bar
  const cacheKey = user ? `mytopia_feed_cache:${user.id}:${selectedMode}` : null;

  const playbackMessages = useMemo(() => buildPlaybackMessages(bundles), [bundles]);
  const visibleMessages = useMemo(
    () => playbackMessages.filter((item) => item.revealAtMs <= clockMs),
    [clockMs, playbackMessages]
  );

  const { flatData, stickyHeaderIndices } = useMemo(() => {
    const items: FeedItem[] = [];
    const stickyIndices: number[] = [];
    const dayKeys = new Set<string>();

    for (let i = 0; i < visibleMessages.length; i++) {
      const item = visibleMessages[i];
      const dayKey = getDayKey(item.revealAtMs);

      // Inject Header
      if (!dayKeys.has(dayKey)) {
        dayKeys.add(dayKey);
        stickyIndices.push(items.length);
        items.push({
          type: 'header',
          key: `header-${dayKey}`,
          title: formatDayLabel(item.revealAtMs),
          revealAtMs: item.revealAtMs,
        });
      }

      // Calculate message metadata (bubbles logic)
      const nextItem = visibleMessages[i + 1];
      const showAvatar = !nextItem || nextItem.message.actor.name !== item.message.actor.name;
      
      const prevItem = visibleMessages[i - 1];
      const isNewActor = !prevItem || prevItem.message.actor.name !== item.message.actor.name;
      const isNewBundle = prevItem && prevItem.bundleId !== item.bundleId;
      const showName = isNewActor;

      let marginTop = 0;
      if (prevItem) {
        const isSameDay = getDayKey(prevItem.revealAtMs) === dayKey;
        if (!isSameDay) {
          // If the previous item was from another day, the separator handles the space
          marginTop = 0; 
        } else if (isNewActor) {
          marginTop = 36;
        } else if (isNewBundle) {
          marginTop = 16;
        } else {
          marginTop = 6;
        }
      }

      items.push({
        type: 'message',
        key: item.key,
        message: item.message,
        bundleId: item.bundleId,
        revealAtMs: item.revealAtMs,
        showAvatar,
        showName,
        marginTop,
      });
    }

    return { flatData: items, stickyHeaderIndices: stickyIndices };
  }, [visibleMessages]);

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
        const page = await fetchNarrativeFeedPage({ limit: 20, mode: selectedMode });
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
        }
      }
    },
    [selectedMode, user]
  );

  const loadMore = useCallback(async () => {
    if (!user || !nextCursor || isLoadingMore) return;

    pendingPrependAdjustmentRef.current = {
      previousContentHeight: listMetricsRef.current.contentHeight,
      previousOffsetY: listMetricsRef.current.currentOffsetY,
    };

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
      pendingPrependAdjustmentRef.current = null;
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load more feed items.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextCursor, selectedMode, user]);

  const scrollToOffset = useCallback((offset: number, animated: boolean) => {
    scrollViewRef.current?.scrollTo({
      x: 0,
      y: offset,
      animated,
    });
  }, []);

  const scrollToEnd = useCallback((options?: { animated?: boolean; allowCorrection?: boolean }) => {
    if (visibleMessages.length === 0) {
      return;
    }

    const animated = options?.animated ?? true;
    const allowCorrection = options?.allowCorrection ?? Platform.OS !== 'ios';
    const { contentHeight, viewportHeight } = listMetricsRef.current;
    const targetOffset = Math.max(0, contentHeight - viewportHeight);

    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd?.({ animated });

      if (allowCorrection) {
        setTimeout(() => {
          scrollToOffset(targetOffset, false);
        }, animated ? 320 : 0);
      }
    });
  }, [scrollToOffset, visibleMessages.length]);

  useLayoutEffect(() => {
    navigation.setOptions({
      ...createNativeTabStackOptions({
        title: 'Notfallkanal',
        largeTitle: false,
      }),
      headerRight: () =>
        selectedMode === 'dev' ? (
          <Text style={styles.modeBadge}>Dev Mode</Text>
        ) : null,
    });
  }, [navigation, selectedMode]);

  const resolveFirstUnreadMessageKey = useCallback(() => {
    const firstUnreadItem = flatData.find(
      (item): item is Extract<FeedItem, { type: 'message' }> =>
        item.type === 'message' && item.revealAtMs > lastSeenTime
    );

    return firstUnreadItem?.key ?? null;
  }, [flatData, lastSeenTime]);

  const updateActiveSectionForOffset = useCallback((offsetY: number) => {
    let nextActiveTitle: string | null = null;

    for (const stickyIndex of stickyHeaderIndices) {
      const item = flatData[stickyIndex];
      if (!item || item.type !== 'header') {
        continue;
      }

      const headerOffset = headerOffsetsRef.current[item.key];
      if (typeof headerOffset === 'number' && headerOffset <= offsetY + 1) {
        nextActiveTitle = item.title;
      } else {
        break;
      }
    }

    setActiveSectionTitle((currentTitle) =>
      currentTitle === nextActiveTitle ? currentTitle : nextActiveTitle
    );
  }, [flatData, stickyHeaderIndices]);

  const tryCompleteInitialPositioning = useCallback(() => {
    if (
      !didInitialScrollRef.current ||
      isPositionedRef.current ||
      isLoadingInitial ||
      visibleMessages.length === 0 ||
      listMetricsRef.current.viewportHeight <= 0 ||
      listMetricsRef.current.contentHeight <= 0
    ) {
      return;
    }

    const firstUnreadMessageKey = resolveFirstUnreadMessageKey();

    if (!firstUnreadMessageKey) {
      isPositionedRef.current = true;
      requestAnimationFrame(() => {
        scrollToEnd({ animated: false, allowCorrection: true });
        setTimeout(() => setIsPositioned(true), 50);
      });
      return;
    }

    const targetOffset = messageOffsetsRef.current[firstUnreadMessageKey];
    if (typeof targetOffset !== 'number') {
      return;
    }

    isPositionedRef.current = true;
    requestAnimationFrame(() => {
      scrollToOffset(Math.max(0, targetOffset - 100), false);
      setShowNewMessagesBadge(true);
      setTimeout(() => setIsPositioned(true), 50);
    });
  }, [
    isLoadingInitial,
    resolveFirstUnreadMessageKey,
    scrollToEnd,
    scrollToOffset,
    visibleMessages.length,
  ]);

  useEffect(() => {
    if (!user || !cacheKey) {
      setBundles([]);
      setNextCursor(null);
      setErrorMessage(null);
      setIsLoadingInitial(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
      activeInitialLoadsRef.current = 0;
      activeRefreshLoadsRef.current = 0;
      didHydrateCacheRef.current = false;
      return;
    }

    latestSignalTokenRef.current = null;
    didInitialScrollRef.current = false;
    isPositionedRef.current = false;
    didHydrateCacheRef.current = false;
    headerOffsetsRef.current = {};
    messageOffsetsRef.current = {};
    setIsPositioned(false);

    let isCancelled = false;

    AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        if (isCancelled || !raw) {
          return;
        }

        const parsed = JSON.parse(raw) as FeedCachePayload;
        if (
          parsed.version !== FEED_CACHE_VERSION ||
          !Array.isArray(parsed.bundles)
        ) {
          return;
        }

        didHydrateCacheRef.current = true;
        setBundles(parsed.bundles);
        setNextCursor(typeof parsed.nextCursor === 'string' ? parsed.nextCursor : null);
        setClockMs(Date.now());
        setIsLoadingInitial(false);
      })
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) {
          void loadFirstPage(didHydrateCacheRef.current ? 'silent' : 'initial');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [cacheKey, loadFirstPage, selectedMode, user]);

  useEffect(() => {
    if (!cacheKey || bundles.length === 0) {
      return;
    }

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
      if (user) {
        void loadFirstPage('silent');
      }
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
    if (!user) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasInactive = appStateRef.current === 'inactive' || appStateRef.current === 'background';
      appStateRef.current = nextState;
      if (wasInactive && nextState === 'active') void loadFirstPage('silent');
    });
    return () => subscription.remove();
  }, [loadFirstPage, user]);

  useEffect(() => {
    if (refreshKey === initialRefreshKeyRef.current) return;
    if (!user) return;
    void loadFirstPage('silent');
  }, [refreshKey, loadFirstPage, user]);

  useEffect(() => {
    if (visibleMessages.length > prevVisibleCountRef.current) {
      if (!isAtBottomRef.current && didInitialScrollRef.current) {
        setShowNewMessagesBadge(true);
      } else if (prevVisibleCountRef.current > 0 && didInitialScrollRef.current) {
        requestAnimationFrame(() => {
          scrollToEnd();
        });
      }
      prevVisibleCountRef.current = visibleMessages.length;
    }
  }, [scrollToEnd, visibleMessages.length]);

  useEffect(() => {
    if (
      !didInitialScrollRef.current &&
      !isLoadingInitial &&
      visibleMessages.length > 0 &&
      !isPositionedRef.current
    ) {
      didInitialScrollRef.current = true;
      tryCompleteInitialPositioning();
    }
  }, [isLoadingInitial, tryCompleteInitialPositioning, visibleMessages.length]);

  useEffect(() => {
    Animated.timing(newMessagesOpacity, {
      toValue: showNewMessagesBadge ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [showNewMessagesBadge, newMessagesOpacity]);

  useEffect(() => {
    Animated.timing(scrollToEndOpacity, {
      toValue: showScrollToEndButton ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [showScrollToEndButton, scrollToEndOpacity]);

  useEffect(() => {
    Animated.timing(scrollToEndIconOpacity, {
      toValue: showScrollToEndButton ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [showScrollToEndButton, scrollToEndIconOpacity]);

  useEffect(() => {
    return () => {
      if (stickyDateHideTimeoutRef.current) {
        clearTimeout(stickyDateHideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const now = Date.now();
    let nextRevealAtMs = Number.POSITIVE_INFINITY;
    for (const item of playbackMessages) {
      if (item.revealAtMs > now && item.revealAtMs < nextRevealAtMs) {
        nextRevealAtMs = item.revealAtMs;
      }
    }
    if (!Number.isFinite(nextRevealAtMs)) return;

    const timeoutMs = Math.max(25, nextRevealAtMs - now + 25);
    const timer = setTimeout(() => setClockMs(Date.now()), timeoutMs);
    return () => clearTimeout(timer);
  }, [playbackMessages, clockMs]);

  useEffect(() => {
    const parentNavigation = navigation.getParent();
    if (!parentNavigation) {
      return;
    }

    const unsubscribe = parentNavigation.addListener('tabPress', (e: any) => {
      const feedTabKey = parentNavigation
        .getState()
        .routes.find((route: any) => route.name === 'feed')?.key;

      if (e.target === feedTabKey && navigation.isFocused()) {
        scrollToEnd();
      }
    });
    return unsubscribe;
  }, [navigation, scrollToEnd]);

  const ListHeader = useMemo(() => {
    return (
      <View>
        {errorMessage && (
          <View style={StyleSheet.flatten([styles.errorBanner, { marginBottom: 14 }])}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {isLoadingInitial && (
          <View style={StyleSheet.flatten([styles.stateBox, { marginBottom: 14 }])}>
            <ActivityIndicator size="large" color={theme.colors.orange} />
            <Text style={styles.stateText}>Loading narrative feed...</Text>
          </View>
        )}

        {!isLoadingInitial && isLoadingMore && (
          <View style={StyleSheet.flatten([styles.loadingOlderBox, { marginBottom: 14 }])}>
            <ActivityIndicator size="small" color={theme.colors.orange} />
            <Text style={styles.loadingOlderText}>Ältere Nachrichten werden geladen…</Text>
          </View>
        )}

        {!isLoadingInitial && visibleMessages.length === 0 && (
          <View style={StyleSheet.flatten([styles.stateBox, { marginBottom: 14 }])}>
            <Text style={styles.stateText}>No released narrative messages yet.</Text>
          </View>
        )}
      </View>
    );
  }, [errorMessage, isLoadingInitial, isLoadingMore, visibleMessages.length]);

  const ListFooter = useMemo(() => {
    return <View style={{ height: bottomSpacerHeight }} />;
  }, [bottomSpacerHeight]);

  const scrollStickyHeaderIndices = useMemo(
    () => stickyHeaderIndices.map((index) => index + 1),
    [stickyHeaderIndices]
  );

  return (
    <>
      <ScrollView
        ref={scrollViewRef}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadFirstPage('refresh')}
            tintColor={theme.colors.orange}
          />
        }
        stickyHeaderIndices={scrollStickyHeaderIndices}
        style={[styles.scrollView, { opacity: isPositioned ? 1 : 0 }]}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        onContentSizeChange={(_, height) => {
          const pendingAdjustment = pendingPrependAdjustmentRef.current;
          listMetricsRef.current.contentHeight = height;

          if (pendingAdjustment) {
            pendingPrependAdjustmentRef.current = null;
            const delta = height - pendingAdjustment.previousContentHeight;
            scrollToOffset(pendingAdjustment.previousOffsetY + delta, false);
            return;
          }

          tryCompleteInitialPositioning();
        }}
        onLayout={(event) => {
          listMetricsRef.current.viewportHeight = event.nativeEvent.layout.height;
          tryCompleteInitialPositioning();
        }}
        onScrollBeginDrag={() => {
          if (stickyDateHideTimeoutRef.current) {
            clearTimeout(stickyDateHideTimeoutRef.current);
          }
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setIsUserScrolling(true);
          Animated.timing(headerOpacity, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }).start();
        }}
        onMomentumScrollBegin={() => {
          if (stickyDateHideTimeoutRef.current) {
            clearTimeout(stickyDateHideTimeoutRef.current);
          }
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setIsUserScrolling(true);
          Animated.timing(headerOpacity, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }).start();
        }}
        onScrollEndDrag={() => {
          if (stickyDateHideTimeoutRef.current) {
            clearTimeout(stickyDateHideTimeoutRef.current);
          }
          stickyDateHideTimeoutRef.current = setTimeout(() => {
            Animated.timing(headerOpacity, {
              toValue: 0,
              duration: 350,
              useNativeDriver: true,
            }).start(() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setIsUserScrolling(false);
            });
          }, STICKY_DATE_HIDE_DELAY_MS);
        }}
        onMomentumScrollEnd={() => {
          if (stickyDateHideTimeoutRef.current) {
            clearTimeout(stickyDateHideTimeoutRef.current);
          }
          stickyDateHideTimeoutRef.current = setTimeout(() => {
            Animated.timing(headerOpacity, {
              toValue: 0,
              duration: 350,
              useNativeDriver: true,
            }).start(() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setIsUserScrolling(false);
            });
          }, STICKY_DATE_HIDE_DELAY_MS);
        }}
        onScroll={(event) => {
          const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
          listMetricsRef.current.contentHeight = contentSize.height;
          listMetricsRef.current.viewportHeight = layoutMeasurement.height;
          listMetricsRef.current.currentOffsetY = contentOffset.y;
          updateActiveSectionForOffset(contentOffset.y);

          if (
            contentOffset.y <= OLDER_MESSAGES_THRESHOLD_PX &&
            nextCursor &&
            !isLoadingMore &&
            !isLoadingInitial
          ) {
            void loadMore();
          }

          const distanceFromBottom = Math.max(
            0,
            contentSize.height - (layoutMeasurement.height + contentOffset.y)
          );
          const isCloseToBottom = distanceFromBottom <= 100;

          isAtBottomRef.current = isCloseToBottom;
          setShowScrollToEndButton(distanceFromBottom > SCROLL_TO_END_SHOW_THRESHOLD_PX);

          if (isCloseToBottom && showNewMessagesBadge) {
            setShowNewMessagesBadge(false);
            void markAsRead();
          }
        }}
      >
        {ListHeader}
        {flatData.map((item) => {
          if (item.type === 'header') {
            const isCurrentlySticky = isUserScrolling && item.title === activeSectionTitle;

            return (
              <Animated.View
                key={item.key}
                onLayout={(event) => {
                  headerOffsetsRef.current[item.key] = event.nativeEvent.layout.y;
                  updateActiveSectionForOffset(listMetricsRef.current.currentOffsetY);
                }}
                style={[
                  styles.daySeparatorWrap,
                  { opacity: isCurrentlySticky ? headerOpacity : 1 },
                ]}
              >
                <View style={styles.daySeparatorInner}>
                  <View
                    style={[
                      styles.daySeparatorLine,
                      isCurrentlySticky && styles.daySeparatorLineHidden,
                    ]}
                  />
                  <View style={styles.daySeparatorPill}>
                    <Text style={styles.daySeparatorText}>{item.title}</Text>
                  </View>
                  <View
                    style={[
                      styles.daySeparatorLine,
                      isCurrentlySticky && styles.daySeparatorLineHidden,
                    ]}
                  />
                </View>
              </Animated.View>
            );
          }

          return (
            <View
              key={item.key}
              onLayout={(event) => {
                messageOffsetsRef.current[item.key] = event.nativeEvent.layout.y;
                tryCompleteInitialPositioning();
              }}
            >
              <MessageBubble
                message={item.message}
                showAvatar={item.showAvatar}
                showName={item.showName}
                gallerySources={imageSources}
                onImagePress={(idx) => {
                  setViewerIndex(idx);
                  setViewerVisible(true);
                }}
                containerStyle={{ marginTop: item.marginTop }}
              />
            </View>
          );
        })}
        {ListFooter}
      </ScrollView>

      {!isPositioned && (
        <View style={styles.positioningOverlay}>
          <ActivityIndicator size="large" color={theme.colors.orange} />
        </View>
      )}

      <Animated.View style={StyleSheet.flatten([styles.newMessagesContainer, { opacity: newMessagesOpacity, pointerEvents: showNewMessagesBadge ? 'auto' : 'none' }])}>
        <Pressable
          style={styles.newMessagesButton}
          onPress={() => {
            scrollToEnd();
            setShowNewMessagesBadge(false);
          }}>
          <FeedDownArrowIcon color="white" size={18} variant="bold" />
          <Text style={styles.newMessagesText}>Neue Nachrichten</Text>
        </Pressable>
      </Animated.View>

      <Animated.View
        pointerEvents={showScrollToEndButton ? 'box-none' : 'none'}
        style={[
          styles.scrollToEndButtonWrap,
          {
            bottom: scrollToEndButtonBottom,
            opacity: IS_GLASS_EFFECT_ENABLED ? 1 : scrollToEndOpacity,
          },
        ]}
      >
        <Pressable
          accessibilityLabel="Zum Ende scrollen"
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          onPress={() => {
            scrollToEnd();
          }}
          style={({ pressed }) => [styles.scrollToEndPressable, pressed && styles.scrollToEndPressed]}
        >
          {IS_GLASS_EFFECT_ENABLED ? (
            <GlassView
              colorScheme="light"
              glassEffectStyle={{
                style: showScrollToEndButton ? 'regular' : 'none',
                animate: true,
                animationDuration: 0.22,
              }}
              style={[
                styles.scrollToEndButton,
                styles.scrollToEndButtonGlass,
                !showScrollToEndButton && styles.scrollToEndButtonHidden,
              ]}
              tintColor="rgba(237, 236, 224, 0.14)"
            >
              <Animated.View style={{ opacity: scrollToEndIconOpacity }}>
                <FeedDownArrowIcon color={theme.colors.cardTextHeading} size={30} variant={SCROLL_TO_END_ICON_VARIANT} />
              </Animated.View>
            </GlassView>
          ) : (
            <View style={[styles.scrollToEndButton, styles.scrollToEndButtonFallback]}>
              <FeedDownArrowIcon color={theme.colors.cardTextHeading} size={30} variant={SCROLL_TO_END_ICON_VARIANT} />
            </View>
          )}
        </Pressable>
      </Animated.View>

      <ImageView
        images={imageSources}
        imageIndex={viewerIndex}
        visible={viewerVisible}
        onRequestClose={() => setViewerVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: theme.colors.background,
  } as ViewStyle,
  scrollContent: { padding: 20, paddingBottom: 24 } as ViewStyle,
  errorBanner: {
    backgroundColor: theme.colors.errorSurface,
    borderColor: theme.colors.errorBorder,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  } as ViewStyle,
  errorText: { color: theme.colors.errorText, fontSize: 13, lineHeight: 18 } as TextStyle,
  stateBox: {
    alignItems: 'center',
    backgroundColor: theme.colors.headerBackground,
    borderRadius: 12,
    gap: 8,
    padding: 20
  } as ViewStyle,
  stateText: { color: theme.colors.textSecondary, fontSize: 14 } as TextStyle,
  loadingOlderBox: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  } as ViewStyle,
  loadingOlderText: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
    textTransform: 'uppercase',
  } as TextStyle,
  daySeparatorWrap: {
    backgroundColor: 'transparent',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 28,
    paddingBottom: 4,
    paddingTop: 4,
  } as ViewStyle,
  daySeparatorInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  } as ViewStyle,
  daySeparatorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  } as ViewStyle,
  daySeparatorLineHidden: {
    backgroundColor: 'transparent',
  } as ViewStyle,
  daySeparatorPill: {
    backgroundColor: '#3D4344',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  } as ViewStyle,
  daySeparatorText: {
    color: 'rgba(238, 242, 239, 0.88)',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
    letterSpacing: 0.2,
  } as TextStyle,
  newMessagesContainer: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  } as ViewStyle,
  newMessagesButton: {
    backgroundColor: theme.colors.orange,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  } as ViewStyle,
  newMessagesText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
  } as TextStyle,
  scrollToEndButtonWrap: {
    position: 'absolute',
    right: 16,
    zIndex: 110,
  } as ViewStyle,
  scrollToEndPressable: {} as ViewStyle,
  scrollToEndPressed: {
    opacity: 0.82,
  } as ViewStyle,
  scrollToEndButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 52,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  } as ViewStyle,
  scrollToEndButtonFallback: {
    backgroundColor: 'rgba(237, 236, 224, 0.82)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  } as ViewStyle,
  scrollToEndButtonGlass: {
    borderColor: 'rgba(255, 255, 255, 0.18)',
  } as ViewStyle,
  scrollToEndButtonHidden: {
    borderColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
  } as ViewStyle,
  modeBadge: {
    color: theme.colors.orange,
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
    textTransform: 'uppercase',
  } as TextStyle,
  positioningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as ViewStyle,
});

function getDayKey(timestampMs: number) {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayLabel(timestampMs: number) {
  const date = new Date(timestampMs);
  const relativeDay = formatRelativeDay(date);

  if (relativeDay) {
    return relativeDay;
  }

  const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const weekday = weekdays[date.getDay()];
  const dd = String(date.getDate()).padStart(1, '0');
  const mm = String(date.getMonth() + 1).padStart(1, '0');
  const yyyy = date.getFullYear();

  return `${weekday}, ${dd}.${mm}.${yyyy}`;
}

function formatRelativeDay(date: Date) {
  const diffInDays = getCalendarDayDifference(date, new Date());

  const relativeMap: Record<number, string> = {
    [-1]: 'Gestern',
    [0]: 'Heute',
    [1]: 'Morgen',
  };

  return relativeMap[diffInDays] || null;
}

function getCalendarDayDifference(date: Date, now: Date) {
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  return Math.round((dateStart - nowStart) / 86_400_000);
}

function mergeFreshBundles(current: NarrativeBundleDto[], incoming: NarrativeBundleDto[]) {
  const merged = new Map<string, NarrativeBundleDto>();

  for (const bundle of incoming) {
    merged.set(bundle._id, bundle);
  }

  for (const bundle of current) {
    if (!merged.has(bundle._id)) {
      merged.set(bundle._id, bundle);
    }
  }

  return Array.from(merged.values());
}

function mergeOlderBundles(current: NarrativeBundleDto[], incoming: NarrativeBundleDto[]) {
  const merged = new Map<string, NarrativeBundleDto>();

  for (const bundle of current) {
    merged.set(bundle._id, bundle);
  }

  for (const bundle of incoming) {
    if (!merged.has(bundle._id)) {
      merged.set(bundle._id, bundle);
    }
  }

  return Array.from(merged.values());
}

function FeedDownArrowIcon({
  color,
  size,
  variant,
}: {
  color: string;
  size: number;
  variant: 'outline' | 'bold';
}) {
  if (variant === 'bold') {
    return (
      <Svg color={color} fill="none" height={size} viewBox="0 0 24 24" width={size}>
        <Path
          d="M7.75 9.5L12 13.75L16.25 9.5"
          stroke="currentColor"
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  return (
    <Svg color={color} fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Path
        d="M8 9.75L12 13.75L16 9.75"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
