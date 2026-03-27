import { Stack } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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
} from 'react-native';
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
  getBundleReleaseMs,
  resolveMessageDelayMs,
  type PlaybackMessage,
} from '@/src/features/feed/utils/playback';

export default function FeedScreen() {
  const { selectedMode, user } = useSession();
  const { markAsRead, pulse, refreshKey } = useNarrativeSignal();

  const requestVersionRef = useRef(0);
  const activeInitialLoadsRef = useRef(0);
  const activeRefreshLoadsRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const latestSignalTokenRef = useRef<string | null>(null);
  const initialRefreshKeyRef = useRef(refreshKey);
  const flashListRef = useRef<any>(null);
  const listMetricsRef = useRef({ contentHeight: 0, viewportHeight: 0 });
  const isAtBottomRef = useRef(true);
  const prevVisibleCountRef = useRef(0);

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
  const [fadeAnim] = useState(new Animated.Value(0));

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

  // Handle new messages badge visibility
  useEffect(() => {
    if (visibleMessages.length > prevVisibleCountRef.current) {
      if (!isAtBottomRef.current) {
        setShowNewMessagesBadge(true);
      }
      prevVisibleCountRef.current = visibleMessages.length;
    }
  }, [visibleMessages.length]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: showNewMessagesBadge ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showNewMessagesBadge, fadeAnim]);

  const scrollToBottom = useCallback(() => {
    if (visibleMessages.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      const list = flashListRef.current;
      const nativeScrollRef = list?.getNativeScrollRef?.();

      if (nativeScrollRef && typeof nativeScrollRef.scrollToEnd === 'function') {
        nativeScrollRef.scrollToEnd({ animated: true });
        setTimeout(() => {
          nativeScrollRef.scrollToEnd({ animated: false });
        }, 260);
        return;
      }

      list?.scrollToOffset?.({
        animated: true,
        offset: Number.MAX_SAFE_INTEGER,
        skipFirstItemOffset: false,
      });
    });
  }, [visibleMessages.length]);

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
        scrollToBottom();
      }
    });
    return unsubscribe;
  }, [navigation, scrollToBottom]);

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
    [imageSources, visibleMessages]
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

        {!isLoadingInitial && visibleMessages.length === 0 && (
          <View style={StyleSheet.flatten([styles.stateBox, { marginBottom: 14 }])}>
            <Text style={styles.stateText}>No released narrative messages yet.</Text>
          </View>
        )}
      </View>
    );
  }, [errorMessage, isLoadingInitial, visibleMessages.length]);

  const ListFooter = useMemo(() => {
    if (!nextCursor) return <View style={{ height: 40 }} />;
    return (
      <Pressable
        style={StyleSheet.flatten([styles.loadMoreButton, isLoadingMore && styles.loadMoreButtonDisabled, { marginTop: 24, marginBottom: 40 }])}
        disabled={isLoadingMore}
        onPress={() => void loadMore()}>
        <Text style={styles.loadMoreLabel}>{isLoadingMore ? 'Loading...' : 'Load older messages'}</Text>
      </Pressable>
    );
  }, [nextCursor, isLoadingMore, loadMore]);

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
        estimatedItemSize={120}
        style={{ ...styles.scrollView, flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={(_, height) => {
          listMetricsRef.current.contentHeight = height;
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
        onScroll={(event) => {
          const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
          listMetricsRef.current.contentHeight = contentSize.height;
          listMetricsRef.current.viewportHeight = layoutMeasurement.height;
          const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 100;
          isAtBottomRef.current = isCloseToBottom;
          if (isCloseToBottom && showNewMessagesBadge) {
            setShowNewMessagesBadge(false);
          }
        }}
      />

      <Animated.View style={StyleSheet.flatten([styles.newMessagesContainer, { opacity: fadeAnim, pointerEvents: showNewMessagesBadge ? 'auto' : 'none' }])}>
        <Pressable
          style={styles.newMessagesButton}
          onPress={() => {
            scrollToBottom();
            setShowNewMessagesBadge(false);
          }}>
          <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ transform: [{ rotate: '90deg' }] }}>
            <Path d="M6 12H18M18 12L13 7M18 12L13 17" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={styles.newMessagesText}>Neue Nachrichten</Text>
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
  scrollContent: { padding: 20, paddingBottom: 34 } as ViewStyle,
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
  loadMoreButton: { alignItems: 'center', backgroundColor: theme.colors.orange, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 } as ViewStyle,
  loadMoreButtonDisabled: { opacity: 0.7 } as ViewStyle,
  loadMoreLabel: { color: theme.colors.cardTextPrimary, fontSize: 14, fontWeight: '700' } as TextStyle,
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
