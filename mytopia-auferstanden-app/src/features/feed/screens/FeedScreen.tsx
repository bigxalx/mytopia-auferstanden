import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
  type ImageStyle,
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

function debugFeed(message: string, payload?: Record<string, unknown>) {
  // Debug logging disabled
}

export function FeedScreen() {
  const { selectedMode, user } = useSession();
  const { markAsRead, pulse } = useNarrativeSignal();

  const requestVersionRef = useRef(0);
  const activeInitialLoadsRef = useRef(0);
  const activeRefreshLoadsRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const latestSignalTokenRef = useRef<string | null>(null);

  const [clockMs, setClockMs] = useState(() => Date.now());
  const [bundles, setBundles] = useState<NarrativeBundleDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

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
        markAsRead().catch(() => {});
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
        {selectedMode === 'dev' && (
          <View style={styles.devModeContainer}>
            <Text style={styles.modeBadge}>DEV MODE</Text>
          </View>
        )}

        {errorMessage && (
          <View style={[styles.errorBanner, { marginBottom: 14 }]}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {isLoadingInitial && (
          <View style={[styles.stateBox, { marginBottom: 14 }]}>
            <ActivityIndicator size="large" color={theme.colors.orange} />
            <Text style={styles.stateText}>Loading narrative feed...</Text>
          </View>
        )}

        {!isLoadingInitial && visibleMessages.length === 0 && (
          <View style={[styles.stateBox, { marginBottom: 14 }]}>
            <Text style={styles.stateText}>No released narrative messages yet.</Text>
          </View>
        )}
      </View>
    );
  }, [selectedMode, errorMessage, isLoadingInitial, visibleMessages.length]);

  const ListFooter = useMemo(() => {
    if (!nextCursor) return <View style={{ height: 40 }} />;
    return (
      <Pressable
        style={[styles.loadMoreButton, isLoadingMore && styles.loadMoreButtonDisabled, { marginTop: 24, marginBottom: 40 }]}
        disabled={isLoadingMore}
        onPress={() => void loadMore()}>
        <Text style={styles.loadMoreLabel}>{isLoadingMore ? 'Loading...' : 'Load older messages'}</Text>
      </Pressable>
    );
  }, [nextCursor, isLoadingMore, loadMore]);

  return (
    <View style={styles.safeArea}>
      <FlashList
        data={visibleMessages}
        renderItem={renderItem}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onRefresh={() => void loadFirstPage('refresh')}
        refreshing={isRefreshing}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        showsVerticalScrollIndicator={false}
      />

      <ImageView
        images={imageSources}
        imageIndex={viewerIndex}
        visible={viewerVisible}
        onRequestClose={() => setViewerVisible(false)}
      />
    </View>
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
    <View style={[styles.messageRow, containerStyle]}>
      {showAvatar && (
        <View style={styles.avatarColumn}>
          <ActorAvatar actor={message.actor} />
        </View>
      )}

      <View style={styles.bubbleContainer}>
        <View style={styles.messageBubble}>
          {showName && <Text style={styles.headline}>{message.actor.name}</Text>}
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
    return <Image source={{ uri: actor.avatarUrl }} style={styles.avatarImage} contentFit="cover" />;
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
          <Image source={{ uri: attachment.url }} style={styles.imageAttachment} contentFit="cover" />
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
            {attachment.imageUrl && <Image source={{ uri: attachment.imageUrl }} style={styles.missionCardImage} contentFit="cover" />}
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
      <View style={[styles.videoPlaceholder, { aspectRatio, height: undefined }]}>
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
  if (textLength > 0) return Math.max(1500, Math.min(12000, textLength * TEXT_DELAY_FACTOR_MS));
  return message.attachment ? 3500 : 1500;
}

function getBundleReleaseMs(bundle: NarrativeBundleDto) {
  const parsed = Date.parse(bundle.releaseAt);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.headerBackground } as ViewStyle,
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
  devModeContainer: { alignItems: 'center', marginBottom: 4, marginTop: -4 } as ViewStyle,
  modeBadge: { 
    backgroundColor: theme.colors.orange, 
    borderRadius: 999, 
    color: theme.colors.cardTextPrimary, 
    fontSize: 11, 
    fontWeight: '800', 
    marginTop: 10, 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    textTransform: 'uppercase' 
  } as TextStyle,
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
});
