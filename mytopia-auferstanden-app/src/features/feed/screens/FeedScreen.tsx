import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
  type ImageStyle,
  Animated,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { theme } from '@/src/shared/ui/theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ImageView from 'react-native-image-viewing';
import { FlashList } from '@shopify/flash-list';

import { useSession } from '@/src/core/session/SessionContext';
import {
  fetchNarrativeFeedPage,
  type NarrativeAttachmentDto,
  type NarrativeBundleDto,
  type NarrativeMessageDto,
} from '@/src/features/feed/data/narrativeFeedClient';
import { useNarrativeSignal } from '@/src/features/feed/data/NarrativeSignalContext';
type PlaybackMessage = {
  bundleId: string;
  bundleTitle: string;
  key: string;
  message: NarrativeMessageDto;
  revealAtMs: number;
};

const TEXT_DELAY_FACTOR_MS = 45;
const TEXT_DELAY_MIN_MS = 1500;
const TEXT_DELAY_MAX_MS = 12000;
const ATTACHMENT_ONLY_DELAY_MS = 3500;

export function FeedScreen() {
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
      <FlashList
        contentInsetAdjustmentBehavior="automatic"
        ref={flashListRef}
        data={visibleMessages}
        renderItem={renderItem}
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

function MessageBubble({
  message,
  showAvatar,
  showName,
  gallerySources,
  onImagePress,
  containerStyle,
}: {
  message: NarrativeMessageDto;
  showAvatar: boolean;
  showName: boolean;
  gallerySources: { uri: string }[];
  onImagePress: (index: number) => void;
  containerStyle?: ViewStyle;
}) {
  return (
    <View style={StyleSheet.flatten([styles.messageRow, containerStyle])}>
      {showAvatar && (
        <View style={styles.avatarColumn}>
          <ActorAvatar actor={message.actor} />
        </View>
      )}

      <View style={styles.bubbleContainer}>
        <View style={styles.messageBubble}>
          {showName && (
            <Text
              style={StyleSheet.flatten([
                styles.headline,
                message.actor.nameColor ? { color: message.actor.nameColor } : {},
              ])}
            >
              {message.actor.name}
            </Text>
          )}
          {message.attachment && (
            <AttachmentView
              attachment={message.attachment}
              gallerySources={gallerySources}
              onImagePress={onImagePress}
            />
          )}
          {message.text && <Text style={styles.messageText}>{message.text}</Text>}
        </View>
      </View>
    </View>
  );
}

function ActorAvatar({ actor }: { actor: { avatarUrl?: string; name: string } }) {
  if (actor.avatarUrl) {
    return (
      <Image
        source={{ uri: actor.avatarUrl }}
        style={styles.avatarImage}
        contentFit="cover"
        cachePolicy="disk"
        transition={200}
        placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
      />
    );
  }
  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarFallbackLabel}>{actor.name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function AttachmentView({
  attachment,
  gallerySources,
  onImagePress,
}: {
  attachment: NarrativeAttachmentDto;
  gallerySources: { uri: string }[];
  onImagePress: (index: number) => void;
}) {
  switch (attachment._type) {
    case 'imageAttachment': {
      const index = gallerySources.findIndex((s) => s.uri === attachment.url);
      return (
        <Pressable style={styles.attachmentBox} onPress={() => index >= 0 && onImagePress(index)}>
          <Image
            source={{ uri: attachment.url }}
            style={styles.imageAttachment}
            contentFit="cover"
            cachePolicy="disk"
            transition={200}
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
          />
          {attachment.caption && <Text style={styles.attachmentCaption}>{attachment.caption}</Text>}
        </Pressable>
      );
    }
    case 'videoAttachment':
      return <VideoAttachmentView attachment={attachment} />;
    case 'audioAttachment':
      return <AudioAttachmentView attachment={attachment} />;
    case 'missionAttachment': {
      const description = attachment.excerpt || [
        attachment.missionKind ? (attachment.missionKind === 'quiz' ? '🧠 Quiz' : '📍 GPS') : null,
        attachment.missionPoints ? `${attachment.missionPoints} Punkte` : null
      ].filter(Boolean).join(' · ');
      return (
        <Link asChild href={`/tasks/${attachment.missionId}`}>
          <Pressable style={styles.orange}>
            {attachment.imageUrl && (
              <Image
                source={{ uri: attachment.imageUrl }}
                style={styles.missionCardImage}
                contentFit="cover"
                cachePolicy="disk"
                transition={200}
                placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
              />
            )}
            <View style={styles.missionCardContent}>
              <Text style={styles.missionTitle}>{attachment.title || attachment.missionTitle || 'Mission'}</Text>
              {description && <Text style={styles.missionExcerpt}>{description}</Text>}
            </View>
          </Pressable>
        </Link>
      );
    }
    default: return null;
  }
}

function VideoAttachmentView({ attachment }: { attachment: Extract<NarrativeAttachmentDto, { _type: 'videoAttachment' }> }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const player = useVideoPlayer(attachment.url, (p) => {
    p.muted = false;
    p.loop = false;
    p.staysActiveInBackground = false;
  });
  const videoViewRef = useRef<VideoView>(null);

  useEffect(() => {
    const subscription = player.addListener('videoTrackChange', (payload) => {
      if (payload.videoTrack?.size) {
        setAspectRatio(payload.videoTrack.size.width / payload.videoTrack.size.height);
      }
    });
    return () => subscription.remove();
  }, [player]);

  const handlePress = () => {
    player.play();
    videoViewRef.current?.enterFullscreen();
  };

  return (
    <Pressable style={styles.attachmentBox} onPress={handlePress}>
      <View style={StyleSheet.flatten([styles.videoPlaceholder, { aspectRatio, height: undefined }])}>
        <VideoView
          ref={videoViewRef}
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit={isFullscreen ? 'contain' : 'cover'}
          nativeControls={isFullscreen}
          onFullscreenEnter={() => setIsFullscreen(true)}
          onFullscreenExit={() => {
            setIsFullscreen(false);
            player.pause();
          }}
        />
        <View style={styles.videoOverlay}>
          <View style={styles.playIconCircle}>
            <Svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <Path d="M18.8906 12.846C18.5371 14.189 16.8667 15.1381 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42129C6.35159 5.02241 6.8418 4.73289 7.37983 4.58043C8.6812 4.21165 10.296 5.12907 13.5257 6.96387C16.8667 8.86193 18.5371 9.81096 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z" fill="white" />
            </Svg>
          </View>
        </View>
      </View>
      {attachment.title && <Text style={styles.attachmentCaption}>{attachment.title}</Text>}
    </Pressable>
  );
}

function AudioAttachmentView({ attachment }: { attachment: Extract<NarrativeAttachmentDto, { _type: 'audioAttachment' }> }) {
  const audioPlayer = useAudioPlayer({ uri: attachment.url });
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const [isPreparingPlayback, setIsPreparingPlayback] = useState(false);
  const [playbackWarning, setPlaybackWarning] = useState<string | null>(null);
  const playbackAttemptAtRef = useRef<number | null>(null);

  const isLikelyProblematicAndroidFormat = Platform.OS === 'android' && (
    attachment.extension?.toLowerCase() === 'm4a' ||
    attachment.mimeType?.toLowerCase() === 'audio/x-m4a' ||
    attachment.url.toLowerCase().includes('.m4a')
  );

  useEffect(() => {
    if (!audioStatus.playing && !audioStatus.isBuffering && playbackAttemptAtRef.current) {
      const timer = setTimeout(() => {
        if (!audioStatus.playing && !audioStatus.isBuffering) {
          setPlaybackWarning(isLikelyProblematicAndroidFormat ? 'Format issues detected.' : 'Audio did not start.');
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [audioStatus.playing, audioStatus.isBuffering, isLikelyProblematicAndroidFormat]);

  const onTogglePlayback = async () => {
    if (isPreparingPlayback) return;
    if (audioStatus.playing) {
      audioPlayer.pause();
      return;
    }
    try {
      playbackAttemptAtRef.current = Date.now();
      setIsPreparingPlayback(true);
      await setAudioModeAsync({ playsInSilentMode: true });
      if (audioStatus.didJustFinish) await audioPlayer.seekTo(0);
      audioPlayer.play();
    } catch { /* soft fail */ } finally {
      setIsPreparingPlayback(false);
    }
  };

  const label = isPreparingPlayback || audioStatus.isBuffering ? '...' : (audioStatus.playing ? 'Pause' : 'Play');

  return (
    <View style={styles.attachmentBox}>
      <View style={styles.audioHeader}>
        <Text style={styles.audioTitle}>{attachment.title || 'Audio'}</Text>
        <Pressable style={styles.orange} onPress={() => void onTogglePlayback()}>
          <Text style={styles.audioButtonLabel}>{label}</Text>
        </Pressable>
      </View>
      {playbackWarning && <Text style={styles.attachmentCaption}>{playbackWarning}</Text>}
    </View>
  );
}

function buildPlaybackMessages(bundles: NarrativeBundleDto[]): PlaybackMessage[] {
  const sorted = [...bundles].sort((a, b) => getBundleReleaseMs(a) - getBundleReleaseMs(b));
  const items: PlaybackMessage[] = [];
  for (const bundle of sorted) {
    let cursorMs = getBundleReleaseMs(bundle);
    for (const msg of bundle.messages) {
      cursorMs += resolveMessageDelayMs(msg);
      items.push({ bundleId: bundle._id, bundleTitle: bundle.title, key: `${bundle._id}:${msg.messageId}`, message: msg, revealAtMs: cursorMs });
    }
  }
  return items;
}

function resolveMessageDelayMs(message: NarrativeMessageDto) {
  const textLength = message.text?.trim().length ?? 0;
  if (textLength > 0) {
    return Math.max(TEXT_DELAY_MIN_MS, Math.min(TEXT_DELAY_MAX_MS, textLength * TEXT_DELAY_FACTOR_MS));
  }

  return message.attachment ? ATTACHMENT_ONLY_DELAY_MS : TEXT_DELAY_MIN_MS;
}

function getBundleReleaseMs(bundle: NarrativeBundleDto) {
  const parsed = Date.parse(bundle.releaseAt);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'transparent' } as ViewStyle,
  header: {
    backgroundColor: theme.colors.headerBackground,
    borderBottomColor: theme.colors.headerBorder,
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 6
  } as ViewStyle,
  headerTitle: theme.typography.title,
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
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', position: 'relative' } as ViewStyle,
  avatarColumn: { position: 'absolute', left: 0, bottom: 0, width: 48 } as ViewStyle,
  bubbleContainer: { flex: 1, marginLeft: 60 } as ViewStyle,
  messageBubble: { backgroundColor: theme.colors.beige, borderRadius: 10, flex: 1, padding: 10, gap: 8 } as ViewStyle,
  headline: { color: theme.colors.charcoal, fontFamily: 'NunitoSans_700Bold', fontSize: 13 } as TextStyle,
  messageText: { color: theme.colors.cardTextPrimary, fontFamily: 'NunitoSans_400Regular', fontSize: 12, lineHeight: 18 } as TextStyle,
  avatarImage: { borderRadius: 24, height: 48, width: 48 } as ImageStyle,
  avatarFallback: { alignItems: 'center', backgroundColor: theme.colors.avatarFallback, borderRadius: 24, height: 48, justifyContent: 'center', width: 48 } as ViewStyle,
  avatarFallbackLabel: { color: theme.colors.avatarFallbackText, fontSize: 18, fontWeight: '700' } as TextStyle,
  attachmentBox: { backgroundColor: theme.colors.cardSubtleBackground, borderRadius: 14, overflow: 'hidden' } as ViewStyle,
  attachmentCaption: { color: theme.colors.cardTextSecondary, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 } as TextStyle,
  imageAttachment: { height: 220, width: '100%' } as ImageStyle,
  videoPlaceholder: { alignItems: 'center', backgroundColor: theme.colors.mediaSurface, height: 200, justifyContent: 'center', width: '100%', overflow: 'hidden' } as ViewStyle,
  videoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.overlaySoft, alignItems: 'center', justifyContent: 'center' } as ViewStyle,
  playIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.overlayStrong, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.overlayBorder } as ViewStyle,
  orange: { backgroundColor: theme.colors.orange, borderRadius: 10, padding: 5 } as ViewStyle,
  missionCardImage: { borderRadius: 6, height: 140, width: '100%' } as ImageStyle,
  missionCardContent: { paddingHorizontal: 4, paddingBottom: 2 } as ViewStyle,
  missionTitle: { color: theme.colors.cardTextPrimary, fontFamily: 'Nunito_700Bold', fontSize: 15 } as TextStyle,
  missionExcerpt: { color: theme.colors.cardTextSecondary, fontFamily: 'NunitoSans_400Regular', fontSize: 12, marginTop: 2 } as TextStyle,
  audioHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: 12 } as ViewStyle,
  audioTitle: { color: theme.colors.cardTextPrimary, flex: 1, fontSize: 15, fontWeight: '600', marginRight: 12 } as TextStyle,
  audioButtonLabel: { color: theme.colors.cardTextPrimary, fontSize: 13, fontWeight: '700' } as TextStyle,
  modalContainer: { backgroundColor: theme.colors.modalBackground, flex: 1 } as ViewStyle,
  fullImage: { height: '100%', width: '100%' } as ViewStyle,
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
});
