import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Pressable,
  SectionList,
  type SectionListData,
  type SectionListRenderItemInfo,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
  type ViewToken,
  Animated,
  LayoutAnimation,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import Svg, { Path } from 'react-native-svg';
import { theme } from '@/src/shared/ui/theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  type PlaybackMessage,
} from '@/src/features/feed/utils/playback';

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

type FeedSection = {
  data: PlaybackMessage[];
  key: string;
  title: string;
};

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

  const requestVersionRef = useRef(0);
  const activeInitialLoadsRef = useRef(0);
  const activeRefreshLoadsRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const latestSignalTokenRef = useRef<string | null>(null);
  const initialRefreshKeyRef = useRef(refreshKey);
  const sectionListRef = useRef<any>(null);
  const listMetricsRef = useRef({ contentHeight: 0, viewportHeight: 0, currentOffsetY: 0 });
  const isAtBottomRef = useRef(true);
  const prevVisibleCountRef = useRef(0);
  const didInitialScrollRef = useRef(false);
  const stickyDateHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPrependAdjustmentRef = useRef<null | { previousContentHeight: number; previousOffsetY: number }>(null);
  const didHydrateCacheRef = useRef(false);

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
  const newMessagesOpacity = useRef(new Animated.Value(0)).current;
  const scrollToEndOpacity = useRef(new Animated.Value(0)).current;
  const scrollToEndIconOpacity = useRef(new Animated.Value(0)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;

  // Viewability config for tracking the current sticky header title
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 0,
    minimumViewTime: 0,
  }).current;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<PlaybackMessage>[] }) => {
      // The first item in the list is the one currently at the top of the viewport
      if (viewableItems.length > 0) {
        const firstItem = viewableItems[0];
        // SectionListData is passed through the item structure in FlashList/SectionList usually but
        // for SectionList, we can find the section from the item's key or index if needed.
        // Actually, for SectionList, it's easier to check the rendering or just find by index.
        // Since each section has a TITLE, we look for the section title of the first viewable item.
        // For simplicity, we can rely on the section structure.
        const firstViewableSectionTitle = firstItem.section?.title || null;
        if (firstViewableSectionTitle !== activeSectionTitle) {
          setActiveSectionTitle(firstViewableSectionTitle);
        }
      }
    },
    [activeSectionTitle]
  );

  const bottomSpacerHeight = Math.max(72, insets.bottom + SCROLL_TO_END_BOTTOM_GAP);
  const cacheKey = user ? `mytopia_feed_cache:${user.id}:${selectedMode}` : null;

  const playbackMessages = useMemo(() => buildPlaybackMessages(bundles), [bundles]);
  const visibleMessages = useMemo(
    () => playbackMessages.filter((item) => item.revealAtMs <= clockMs),
    [clockMs, playbackMessages]
  );

  const sections = useMemo<FeedSection[]>(() => {
    const grouped = new Map<string, FeedSection>();

    for (const item of visibleMessages) {
      const key = getDayKey(item.revealAtMs);
      const existing = grouped.get(key);
      if (existing) {
        existing.data.push(item);
        continue;
      }

      grouped.set(key, {
        data: [item],
        key,
        title: formatDayLabel(item.revealAtMs),
      });
    }

    return Array.from(grouped.values());
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
    const list = sectionListRef.current;
    const targetOffset = Math.max(0, offset);

    list?.scrollToLocation?.({
      animated,
      itemIndex: 0,
      sectionIndex: 0,
      viewOffset: -targetOffset,
      viewPosition: 0,
    });

    list?.getScrollResponder?.()?.scrollTo?.({ x: 0, y: targetOffset, animated });
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
      sectionListRef.current?.getScrollResponder?.()?.scrollTo?.({
        x: 0,
        y: targetOffset,
        animated,
      });

      if (allowCorrection) {
        setTimeout(() => {
          sectionListRef.current?.getScrollResponder?.()?.scrollTo?.({
            x: 0,
            y: targetOffset,
            animated: false,
          });
        }, animated ? 320 : 0);
      }
    });
  }, [visibleMessages.length]);

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
    didHydrateCacheRef.current = false;

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
      visibleMessages.length > 0
    ) {
      didInitialScrollRef.current = true;
      
      // Find first unread message
      const firstUnreadIndex = visibleMessages.findIndex(
        (msg) => msg.revealAtMs > lastSeenTime
      );
      
      if (firstUnreadIndex === -1) {
        // No unread messages, scroll to bottom
        requestAnimationFrame(() => {
          scrollToEnd({ animated: false, allowCorrection: true });
        });
      } else {
        // Has unread messages, scroll to first unread and show badge
        const unreadMessage = visibleMessages[firstUnreadIndex];
        const sectionIndex = sections.findIndex((section) =>
          section.data.some((msg) => msg.key === unreadMessage.key)
        );
        
        if (sectionIndex !== -1) {
          const section = sections[sectionIndex];
          const itemIndex = section.data.findIndex(
            (msg) => msg.key === unreadMessage.key
          );
          
          requestAnimationFrame(() => {
            sectionListRef.current?.scrollToLocation?.({
              animated: false,
              itemIndex: Math.max(0, itemIndex),
              sectionIndex,
              viewOffset: 100,
              viewPosition: 0,
            });
            setShowNewMessagesBadge(true);
          });
        } else {
          // Fallback to bottom if section not found
          requestAnimationFrame(() => {
            scrollToEnd({ animated: false, allowCorrection: true });
          });
        }
      }
    }
  }, [isLoadingInitial, lastSeenTime, scrollToEnd, sections, visibleMessages]);


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

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<PlaybackMessage, FeedSection> }) => {
      const isCurrentlySticky =
        isUserScrolling && section.title === activeSectionTitle;
      return (
        <Animated.View
          style={[
            styles.daySeparatorWrap,
            { opacity: isCurrentlySticky ? headerOpacity : 1 },
          ]}
        >
          <View
            style={[
              styles.daySeparatorLine,
              isCurrentlySticky && styles.daySeparatorLineHidden,
            ]}
          />
          <View style={styles.daySeparatorPill}>
            <Text style={styles.daySeparatorText}>{section.title}</Text>
          </View>
          <View
            style={[
              styles.daySeparatorLine,
              isCurrentlySticky && styles.daySeparatorLineHidden,
            ]}
          />
        </Animated.View>
      );
    },
    [headerOpacity, activeSectionTitle, isUserScrolling]
  );

  const renderItem = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<PlaybackMessage, FeedSection>) => {
      const nextItem = section.data[index + 1];
      const showAvatar =
        !nextItem ||
        nextItem.message.actor.name !== item.message.actor.name;

      const prevItem = section.data[index - 1];
      const isNewActor = !prevItem || prevItem.message.actor.name !== item.message.actor.name;
      const isNewBundle = prevItem && prevItem.bundleId !== item.bundleId;
      const showName = isNewActor;

      let marginTop = 0;
      if (prevItem) {
        if (isNewActor) {
          marginTop = 36;
        } else if (isNewBundle) {
          marginTop = 16;
        } else {
          marginTop = 6;
        }
      }

      return (
        <MessageBubble
          message={item.message}
          showAvatar={showAvatar}
          showName={showName}
          gallerySources={imageSources}
          onImagePress={(idx) => {
            setViewerIndex(idx);
            setViewerVisible(true);
          }}
          containerStyle={{ marginTop }}
        />
      );
    },
    [imageSources]
  );

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

  return (
    <>
      <Stack.Screen
        options={{
          ...createNativeTabStackOptions({
            title: 'Notfallkanal',
            largeTitle: false,
          }),
          headerRight: () =>
            selectedMode === 'dev' ? (
              <Text style={styles.modeBadge}>Dev Mode</Text>
            ) : null,
        }}
      />
      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        ref={sectionListRef}
        sections={sections}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => item.key}
        style={{ ...styles.scrollView, flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={(_, height) => {
          const pendingAdjustment = pendingPrependAdjustmentRef.current;
          listMetricsRef.current.contentHeight = height;

          if (pendingAdjustment) {
            pendingPrependAdjustmentRef.current = null;
            const delta = height - pendingAdjustment.previousContentHeight;
            scrollToOffset(pendingAdjustment.previousOffsetY + delta, false);
            return;
          }

          if (
            !didInitialScrollRef.current &&
            !isLoadingInitial &&
            visibleMessages.length > 0
          ) {
            requestAnimationFrame(() => {
              scrollToEnd({ animated: false, allowCorrection: true });
            });
          }
        }}
        onLayout={(event) => {
          listMetricsRef.current.viewportHeight = event.nativeEvent.layout.height;
        }}
        onRefresh={() => void loadFirstPage('refresh')}
        refreshing={isRefreshing}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={11}
        stickySectionHeadersEnabled={true}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
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
            // Mark as read when user scrolls to bottom
            void markAsRead();
          }
        }}
      />

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
            bottom: Math.max(insets.bottom + 16, 24),
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
  scrollView: { backgroundColor: theme.colors.background } as ViewStyle,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    marginTop: 28,
  } as ViewStyle,
  daySeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
});

function getDayKey(timestampMs: number) {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayLabel(timestampMs: number) {
  const date = new Date(timestampMs);
  const weekday = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
  })
    .format(date)
    .replace(/\.$/, '');
  const numericDate = new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(date);

  return `${weekday}, ${numericDate}`;
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
