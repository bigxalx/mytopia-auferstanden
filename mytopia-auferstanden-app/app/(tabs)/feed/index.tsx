import { Stack } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
  Animated,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import Svg, { Path } from 'react-native-svg';
import { theme } from '@/src/shared/ui/theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ImageView from 'react-native-image-viewing';
import { FlashList } from '@shopify/flash-list';
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
const IS_GLASS_EFFECT_ENABLED =
  Platform.OS === 'ios' &&
  isGlassEffectAPIAvailable() &&
  isLiquidGlassAvailable();

export default function FeedScreen() {
  const { selectedMode, user } = useSession();
  const { markAsRead, pulse, refreshKey } = useNarrativeSignal();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const requestVersionRef = useRef(0);
  const activeInitialLoadsRef = useRef(0);
  const activeRefreshLoadsRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const latestSignalTokenRef = useRef<string | null>(null);
  const initialRefreshKeyRef = useRef(refreshKey);
  const flashListRef = useRef<any>(null);
  const listMetricsRef = useRef({ contentHeight: 0, viewportHeight: 0, currentOffsetY: 0 });
  const isAtBottomRef = useRef(true);
  const prevVisibleCountRef = useRef(0);
  const didInitialBottomScrollRef = useRef(false);
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
  const [stickyDateLabel, setStickyDateLabel] = useState<string | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));

  const bottomSpacerHeight = Math.max(72, insets.bottom + SCROLL_TO_END_BOTTOM_GAP);

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

        setBundles(page.bundles);
        setNextCursor(page.nextCursor);
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

    setIsLoadingMore(true);
    try {
      const page = await fetchNarrativeFeedPage({
        cursor: nextCursor,
        limit: 20,
        mode: selectedMode,
      });
      setBundles((current) => [...current, ...page.bundles]);
      setNextCursor(page.nextCursor);
      setClockMs(Date.now());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load more feed items.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextCursor, selectedMode, user]);

  useEffect(() => {
    if (!user) {
      setBundles([]);
      setNextCursor(null);
      setErrorMessage(null);
      setIsLoadingInitial(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
      activeInitialLoadsRef.current = 0;
      activeRefreshLoadsRef.current = 0;
      return;
    }
    latestSignalTokenRef.current = null;
    didInitialBottomScrollRef.current = false;
    void loadFirstPage('initial');
  }, [loadFirstPage, selectedMode, user]);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        // Feed viewed, mark newest narrative as read to clear icon badge
        markAsRead().catch(() => { });
        void loadFirstPage('silent');
      }
    }, [loadFirstPage, markAsRead, user])
  );

  useEffect(() => {
    if (!user || (!pulse && latestSignalTokenRef.current === null)) return;

    // Default to the first pulse as the starting point so we catch unread
    // updates happening later. Or if the token changed over our remembered token.
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

  const playbackMessages = useMemo(() => buildPlaybackMessages(bundles), [bundles]);
  const visibleMessages = useMemo(
    () => playbackMessages.filter((item) => item.revealAtMs <= clockMs),
    [clockMs, playbackMessages]
  );

  // FCM push notification triggered refresh
  useEffect(() => {
    if (refreshKey === initialRefreshKeyRef.current) return;
    if (!user) return;
    void loadFirstPage('silent');
  }, [refreshKey, loadFirstPage, user]);

  const scrollToEnd = useCallback((options?: { animated?: boolean; allowCorrection?: boolean }) => {
    if (visibleMessages.length === 0) {
      return;
    }

    const animated = options?.animated ?? true;
    const allowCorrection = options?.allowCorrection ?? Platform.OS !== 'ios';

    const performScroll = (shouldAnimate: boolean) => {
      const list = flashListRef.current;
      const nativeScrollRef = list?.getNativeScrollRef?.();
      const { contentHeight, viewportHeight } = listMetricsRef.current;
      const targetOffset = Math.max(0, contentHeight - viewportHeight);

      if (nativeScrollRef && typeof nativeScrollRef.scrollTo === 'function') {
        nativeScrollRef.scrollTo({ x: 0, y: targetOffset, animated: shouldAnimate });
        return;
      }

      list?.scrollToOffset?.({
        animated: shouldAnimate,
        offset: targetOffset,
        skipFirstItemOffset: false,
      });
    };

    requestAnimationFrame(() => {
      performScroll(animated);

      if (allowCorrection) {
        setTimeout(() => performScroll(false), animated ? 320 : 0);
      }
    });
  }, [visibleMessages.length]);

  // Handle new messages badge visibility
  useEffect(() => {
    if (visibleMessages.length > prevVisibleCountRef.current) {
      if (!isAtBottomRef.current) {
        setShowNewMessagesBadge(true);
      } else if (prevVisibleCountRef.current > 0) {
        requestAnimationFrame(() => {
          scrollToEnd();
        });
      }
      prevVisibleCountRef.current = visibleMessages.length;
    }
  }, [scrollToEnd, visibleMessages.length]);

  useEffect(() => {
    if (
      !didInitialBottomScrollRef.current &&
      !isLoadingInitial &&
      visibleMessages.length > 0
    ) {
      didInitialBottomScrollRef.current = true;
      requestAnimationFrame(() => {
        scrollToEnd({ animated: false, allowCorrection: true });
      });
    }
  }, [isLoadingInitial, scrollToEnd, visibleMessages.length]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: showNewMessagesBadge ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showNewMessagesBadge, fadeAnim]);

  useEffect(() => {
    return () => {
      if (stickyDateHideTimeoutRef.current) {
        clearTimeout(stickyDateHideTimeoutRef.current);
      }
    };
  }, []);

  // Scroll to bottom when tapping the active tab
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

  const imageSources = useMemo(() => {
    return visibleMessages
      .filter((m) => m.message.attachment?._type === 'imageAttachment')
      .map((m) => ({ uri: (m.message.attachment as any).url }));
  }, [visibleMessages]);

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

  const renderItem = useCallback(
    ({ item, index }: { item: PlaybackMessage; index: number }) => {
      const nextItem = visibleMessages[index + 1];
      const showAvatar =
        !nextItem ||
        nextItem.message.actor.name !== item.message.actor.name;

      const prevItem = visibleMessages[index - 1];
      const isNewActor = !prevItem || prevItem.message.actor.name !== item.message.actor.name;
      const isNewBundle = prevItem && prevItem.bundleId !== item.bundleId;
      const currentDayKey = getDayKey(item.revealAtMs);
      const prevDayKey = prevItem ? getDayKey(prevItem.revealAtMs) : null;
      const showDaySeparator = !prevDayKey || prevDayKey !== currentDayKey;

      const showName = isNewActor;

      let marginTop = 0;
      if (showDaySeparator) {
        marginTop = 0;
      } else if (prevItem) {
        if (isNewActor) {
          marginTop = 36;
        } else if (isNewBundle) {
          marginTop = 16;
        } else {
          marginTop = 6;
        }
      }

      return (
        <View>
          {showDaySeparator ? (
            <View style={styles.daySeparatorWrap}>
              <View style={styles.daySeparatorLine} />
              <View style={styles.daySeparatorPill}>
                <Text style={styles.daySeparatorText}>{formatDayLabel(item.revealAtMs)}</Text>
              </View>
              <View style={styles.daySeparatorLine} />
            </View>
          ) : null}
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
        </View>
      );
    },
    [imageSources, visibleMessages]
  );

  const stickyDateTop = Math.max(headerHeight + 8, insets.top + 8);

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

        {!isLoadingInitial && visibleMessages.length === 0 && (
          <View style={StyleSheet.flatten([styles.stateBox, { marginBottom: 14 }])}>
            <Text style={styles.stateText}>No released narrative messages yet.</Text>
          </View>
        )}
      </View>
    );
  }, [errorMessage, isLoadingInitial, visibleMessages.length]);

  const ListFooter = useMemo(() => {
    if (!nextCursor) return <View style={{ height: bottomSpacerHeight }} />;
    return (
      <View style={{ paddingTop: 24, paddingBottom: bottomSpacerHeight }}>
        <Pressable
          style={StyleSheet.flatten([styles.loadMoreButton, isLoadingMore && styles.loadMoreButtonDisabled])}
          disabled={isLoadingMore}
          onPress={() => void loadMore()}>
          <Text style={styles.loadMoreLabel}>{isLoadingMore ? 'Loading...' : 'Load older messages'}</Text>
        </Pressable>
      </View>
    );
  }, [bottomSpacerHeight, nextCursor, isLoadingMore, loadMore]);

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
      <FlashList
        contentInsetAdjustmentBehavior="automatic"
        ref={flashListRef}
        data={visibleMessages}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        style={{ ...styles.scrollView, flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={(_, height) => {
          listMetricsRef.current.contentHeight = height;

          if (
            !didInitialBottomScrollRef.current &&
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
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        drawDistance={1000}
        onScrollBeginDrag={() => {
          if (stickyDateHideTimeoutRef.current) {
            clearTimeout(stickyDateHideTimeoutRef.current);
          }
          setIsUserScrolling(true);
        }}
        onMomentumScrollBegin={() => {
          if (stickyDateHideTimeoutRef.current) {
            clearTimeout(stickyDateHideTimeoutRef.current);
          }
          setIsUserScrolling(true);
        }}
        onScrollEndDrag={() => {
          if (stickyDateHideTimeoutRef.current) {
            clearTimeout(stickyDateHideTimeoutRef.current);
          }
          stickyDateHideTimeoutRef.current = setTimeout(() => {
            setIsUserScrolling(false);
          }, STICKY_DATE_HIDE_DELAY_MS);
        }}
        onMomentumScrollEnd={() => {
          if (stickyDateHideTimeoutRef.current) {
            clearTimeout(stickyDateHideTimeoutRef.current);
          }
          setIsUserScrolling(false);
        }}
        onScroll={(event) => {
          const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
          listMetricsRef.current.contentHeight = contentSize.height;
          listMetricsRef.current.viewportHeight = layoutMeasurement.height;
          listMetricsRef.current.currentOffsetY = contentOffset.y;

          const distanceFromBottom = Math.max(
            0,
            contentSize.height - (layoutMeasurement.height + contentOffset.y)
          );
          const isCloseToBottom = distanceFromBottom <= 100;

          isAtBottomRef.current = isCloseToBottom;
          setShowScrollToEndButton(distanceFromBottom > SCROLL_TO_END_SHOW_THRESHOLD_PX);

          const topVisibleMessage = visibleMessages.find((message) => {
            const separatorOffset = getSeparatorOffsetY(visibleMessages, message.key);
            return separatorOffset <= contentOffset.y + 8;
          });

          if (topVisibleMessage) {
            setStickyDateLabel(formatDayLabel(topVisibleMessage.revealAtMs));
          } else if (visibleMessages[0]) {
            setStickyDateLabel(formatDayLabel(visibleMessages[0].revealAtMs));
          }

          if (isCloseToBottom && showNewMessagesBadge) {
            setShowNewMessagesBadge(false);
          }
        }}
      />

      {isUserScrolling && stickyDateLabel ? (
        <View
          pointerEvents="none"
          style={[
            styles.stickyDateOverlay,
            { top: stickyDateTop },
          ]}
        >
          {IS_GLASS_EFFECT_ENABLED ? (
            <GlassView
              colorScheme="light"
              glassEffectStyle="clear"
              style={[styles.stickyDatePill, styles.stickyDatePillGlass]}
              tintColor="rgba(237, 236, 224, 0.14)"
            >
              <Text style={styles.stickyDateText}>{stickyDateLabel}</Text>
            </GlassView>
          ) : (
            <View style={[styles.stickyDatePill, styles.stickyDatePillFallback]}>
              <Text style={styles.stickyDateText}>{stickyDateLabel}</Text>
            </View>
          )}
        </View>
      ) : null}

      <Animated.View style={StyleSheet.flatten([styles.newMessagesContainer, { opacity: fadeAnim, pointerEvents: showNewMessagesBadge ? 'auto' : 'none' }])}>
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

      {showScrollToEndButton ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.scrollToEndButtonWrap,
            { bottom: Math.max(insets.bottom + 16, 24) },
          ]}
        >
          <Pressable
            accessibilityLabel="Zum Ende scrollen"
            onPress={() => {
              scrollToEnd();
            }}
            style={({ pressed }) => [styles.scrollToEndPressable, pressed && styles.scrollToEndPressed]}
          >
            {IS_GLASS_EFFECT_ENABLED ? (
              <GlassView
                colorScheme="light"
                glassEffectStyle="clear"
                style={[styles.scrollToEndButton, styles.scrollToEndButtonGlass]}
                tintColor="rgba(237, 236, 224, 0.14)"
              >
                <FeedDownArrowIcon color={theme.colors.cardTextHeading} size={30} variant={SCROLL_TO_END_ICON_VARIANT} />
              </GlassView>
            ) : (
              <View style={[styles.scrollToEndButton, styles.scrollToEndButtonFallback]}>
                <FeedDownArrowIcon color={theme.colors.cardTextHeading} size={30} variant={SCROLL_TO_END_ICON_VARIANT} />
              </View>
            )}
          </Pressable>
        </View>
      ) : null}

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
  loadMoreButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.orange,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12
  } as ViewStyle,
  loadMoreButtonDisabled: { opacity: 0.7 } as ViewStyle,
  loadMoreLabel: { color: theme.colors.cardTextPrimary, fontSize: 14, fontWeight: '700' } as TextStyle,
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
  daySeparatorPill: {
    backgroundColor: 'rgba(237, 236, 224, 0.12)',
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
  stickyDateOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 120,
  } as ViewStyle,
  stickyDatePill: {
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 8,
  } as ViewStyle,
  stickyDatePillFallback: {
    backgroundColor: 'rgba(37, 43, 48, 0.62)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  } as ViewStyle,
  stickyDatePillGlass: {
    borderColor: 'rgba(255, 255, 255, 0.18)',
  } as ViewStyle,
  stickyDateText: {
    color: 'rgba(238, 242, 239, 0.9)',
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
    backgroundColor: 'rgba(237, 236, 224, 0.74)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
  } as ViewStyle,
  scrollToEndButtonGlass: {
    borderColor: 'rgba(255, 255, 255, 0.18)',
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

function getSeparatorOffsetY(messages: PlaybackMessage[], messageKey: string) {
  const messageIndex = messages.findIndex((message) => message.key === messageKey);
  if (messageIndex <= 0) {
    return 0;
  }

  let offset = 0;

  for (let index = 0; index <= messageIndex; index += 1) {
    const message = messages[index];
    const previousMessage = index > 0 ? messages[index - 1] : null;
    const currentDayKey = getDayKey(message.revealAtMs);
    const previousDayKey = previousMessage ? getDayKey(previousMessage.revealAtMs) : null;
    const showDaySeparator = !previousDayKey || previousDayKey !== currentDayKey;

    if (showDaySeparator) {
      offset += 58;
    }

    if (index < messageIndex) {
      offset += 136;
    }
  }

  return offset;
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
