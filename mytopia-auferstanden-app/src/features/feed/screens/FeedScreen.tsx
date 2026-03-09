import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSession } from '@/src/core/session/SessionContext';
import {
  fetchNarrativeFeedPage,
  type NarrativeAttachmentDto,
  type NarrativeBundleDto,
  type NarrativeMessageDto,
} from '@/src/features/feed/data/narrativeFeedClient';
import { subscribeNarrativeSignal } from '@/src/features/feed/data/narrativeSignalClient';

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
  if (!__DEV__) {
    return;
  }

  if (payload) {
    console.log(`[feed-debug] ${message}`, payload);
    return;
  }

  console.log(`[feed-debug] ${message}`);
}

export function FeedScreen() {
  const { selectedMode, user } = useSession();

  const [bundles, setBundles] = useState<NarrativeBundleDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [clockMs, setClockMs] = useState(() => Date.now());

  const requestVersionRef = useRef(0);
  const activeInitialLoadsRef = useRef(0);
  const activeRefreshLoadsRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const latestSignalTokenRef = useRef<string | null>(null);

  const loadFirstPage = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      if (!user) {
        return;
      }

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

      if (mode !== 'silent') {
        setErrorMessage(null);
      }

      debugFeed('loadFirstPage:start', {
        mode,
        requestVersion,
      });

      try {
        const page = await fetchNarrativeFeedPage({ limit: 20, mode: selectedMode });

        if (requestVersion !== requestVersionRef.current) {
          debugFeed('loadFirstPage:stale-success', {
            mode,
            requestVersion,
            currentVersion: requestVersionRef.current,
          });
          return;
        }

        setBundles(page.bundles);
        setNextCursor(page.nextCursor);
        setClockMs(Date.now());
        debugFeed('loadFirstPage:success', {
          mode,
          bundles: page.bundles.length,
          nextCursor: page.nextCursor ? 'set' : 'none',
          requestVersion,
        });
      } catch (error) {
        if (requestVersion !== requestVersionRef.current) {
          debugFeed('loadFirstPage:stale-error', {
            mode,
            requestVersion,
            currentVersion: requestVersionRef.current,
          });
          return;
        }

        const message = error instanceof Error ? error.message : 'Failed to load narrative feed.';
        setErrorMessage(message);
        debugFeed('loadFirstPage:error', {
          mode,
          requestVersion,
          message,
        });
      } finally {
        if (mode === 'initial') {
          activeInitialLoadsRef.current = Math.max(0, activeInitialLoadsRef.current - 1);
          setIsLoadingInitial(activeInitialLoadsRef.current > 0);
        }

        if (mode === 'refresh') {
          activeRefreshLoadsRef.current = Math.max(0, activeRefreshLoadsRef.current - 1);
          setIsRefreshing(activeRefreshLoadsRef.current > 0);
        }

        debugFeed('loadFirstPage:finally', {
          mode,
          requestVersion,
          currentVersion: requestVersionRef.current,
          activeInitialLoads: activeInitialLoadsRef.current,
          activeRefreshLoads: activeRefreshLoadsRef.current,
        });
      }
    },
    [selectedMode, user]
  );

  const loadMore = useCallback(async () => {
    if (!user || !nextCursor || isLoadingMore) {
      return;
    }

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
      const message = error instanceof Error ? error.message : 'Failed to load more feed items.';
      setErrorMessage(message);
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
        void loadFirstPage('silent');
      }
    }, [loadFirstPage, user])
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    return subscribeNarrativeSignal({
      listener: (signal) => {
        if (!signal || signal.token === latestSignalTokenRef.current) {
          return;
        }

        latestSignalTokenRef.current = signal.token;
        void loadFirstPage('silent');
      },
      mode: selectedMode,
    });
  }, [loadFirstPage, selectedMode, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      const wasInactive = previousState === 'inactive' || previousState === 'background';
      if (wasInactive && nextState === 'active') {
        void loadFirstPage('silent');
      }
    });

    return () => {
      subscription.remove();
    };
  }, [loadFirstPage, user]);

  const playbackMessages = useMemo(() => buildPlaybackMessages(bundles), [bundles]);

  const visibleMessages = useMemo(
    () => playbackMessages.filter((item) => item.revealAtMs <= clockMs),
    [clockMs, playbackMessages]
  );

  useEffect(() => {
    const now = Date.now();

    let nextRevealAtMs = Number.POSITIVE_INFINITY;
    for (const item of playbackMessages) {
      if (item.revealAtMs > now && item.revealAtMs < nextRevealAtMs) {
        nextRevealAtMs = item.revealAtMs;
      }
    }

    if (!Number.isFinite(nextRevealAtMs)) {
      return;
    }

    const timeoutMs = Math.max(25, nextRevealAtMs - now + 25);
    const timer = setTimeout(() => {
      setClockMs(Date.now());
    }, timeoutMs);

    return () => {
      clearTimeout(timer);
    };
  }, [playbackMessages, clockMs]);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notfallkanal</Text>
        {selectedMode === 'dev' ? <Text style={styles.modeBadge}>DEV MODE</Text> : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void loadFirstPage('refresh');
            }}
            tintColor="#e5e7eb"
          />
        }
        showsVerticalScrollIndicator={false}>
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {isLoadingInitial ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color="#f97316" />
            <Text style={styles.stateText}>Loading narrative feed...</Text>
          </View>
        ) : null}

        {!isLoadingInitial && visibleMessages.length === 0 ? (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>No released narrative messages yet.</Text>
          </View>
        ) : null}

        {visibleMessages.map((item) => (
          <MessageBubble key={item.key} bundleTitle={item.bundleTitle} message={item.message} />
        ))}

        {nextCursor ? (
          <Pressable
            style={[styles.loadMoreButton, isLoadingMore ? styles.loadMoreButtonDisabled : null]}
            disabled={isLoadingMore}
            onPress={() => {
              void loadMore();
            }}>
            <Text style={styles.loadMoreLabel}>{isLoadingMore ? 'Loading...' : 'Load older messages'}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MessageBubble({
  bundleTitle,
  message,
}: {
  bundleTitle: string;
  message: NarrativeMessageDto;
}) {
  return (
    <View style={styles.messageRow}>
      <ActorAvatar actor={message.actor} />

      <View style={styles.messageBubble}>
        <Text style={styles.actorName}>{message.actor.name}</Text>

        {message.attachment ? <AttachmentView attachment={message.attachment} /> : null}

        {message.text ? <Text style={styles.messageText}>{message.text}</Text> : null}

        <Text style={styles.bundleLabel}>{bundleTitle}</Text>
      </View>
    </View>
  );
}

function ActorAvatar({
  actor,
}: {
  actor: {
    avatarUrl?: string;
    name: string;
  };
}) {
  const fallbackLetter = actor.name.slice(0, 1).toUpperCase();

  if (actor.avatarUrl) {
    return <Image source={{ uri: actor.avatarUrl }} style={styles.avatarImage} contentFit="cover" />;
  }

  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarFallbackLabel}>{fallbackLetter}</Text>
    </View>
  );
}

function AttachmentView({ attachment }: { attachment: NarrativeAttachmentDto }) {
  if (attachment._type === 'imageAttachment') {
    return (
      <View style={styles.attachmentBox}>
        <Image source={{ uri: attachment.url }} style={styles.imageAttachment} contentFit="cover" />
        {attachment.caption ? <Text style={styles.attachmentCaption}>{attachment.caption}</Text> : null}
      </View>
    );
  }

  if (attachment._type === 'videoAttachment') {
    return <VideoAttachmentView attachment={attachment} />;
  }

  if (attachment._type === 'audioAttachment') {
    return <AudioAttachmentView attachment={attachment} />;
  }

  return (
    <Link asChild href={`/tasks/${attachment.missionTaskId}`}>
      <Pressable style={styles.missionCard}>
        <Text style={styles.missionTitle}>{attachment.title || 'Mission available'}</Text>
        {attachment.excerpt ? <Text style={styles.missionExcerpt}>{attachment.excerpt}</Text> : null}
      </Pressable>
    </Link>
  );
}

function VideoAttachmentView({
  attachment,
}: {
  attachment: Extract<NarrativeAttachmentDto, { _type: 'videoAttachment' }>;
}) {
  const player = useVideoPlayer({ uri: attachment.url });

  return (
    <View style={styles.attachmentBox}>
      <VideoView player={player} style={styles.videoAttachment} nativeControls contentFit="cover" />
      {attachment.title ? <Text style={styles.attachmentCaption}>{attachment.title}</Text> : null}
    </View>
  );
}

function AudioAttachmentView({
  attachment,
}: {
  attachment: Extract<NarrativeAttachmentDto, { _type: 'audioAttachment' }>;
}) {
  const audioPlayer = useAudioPlayer({ uri: attachment.url });
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const [isPreparingPlayback, setIsPreparingPlayback] = useState(false);

  const onTogglePlayback = useCallback(async () => {
    if (isPreparingPlayback) {
      return;
    }

    if (audioStatus.playing) {
      audioPlayer.pause();
      return;
    }

    try {
      setIsPreparingPlayback(true);
      await setAudioModeAsync({
        playsInSilentMode: true,
      });
      if (audioStatus.didJustFinish) {
        await audioPlayer.seekTo(0);
      }
      audioPlayer.play();
    } catch (error) {
      console.warn('[feed] Failed to play audio attachment.', error);
    } finally {
      setIsPreparingPlayback(false);
    }
  }, [audioPlayer, audioStatus.didJustFinish, audioStatus.playing, isPreparingPlayback]);

  const buttonLabel = isPreparingPlayback || audioStatus.isBuffering
    ? 'Loading...'
    : audioStatus.playing
      ? 'Pause'
      : 'Play';

  return (
    <View style={styles.attachmentBox}>
      <View style={styles.audioHeader}>
        <Text style={styles.audioTitle}>{attachment.title || 'Audio message'}</Text>
        <Pressable style={styles.audioButton} onPress={() => void onTogglePlayback()}>
          <Text style={styles.audioButtonLabel}>{buttonLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function buildPlaybackMessages(bundles: NarrativeBundleDto[]): PlaybackMessage[] {
  const sorted = [...bundles].sort((left, right) => {
    const leftMs = getBundleReleaseMs(left);
    const rightMs = getBundleReleaseMs(right);

    if (leftMs === rightMs) {
      return left._id.localeCompare(right._id);
    }

    return leftMs - rightMs;
  });

  const playbackItems: PlaybackMessage[] = [];

  for (const bundle of sorted) {
    let cursorMs = getBundleReleaseMs(bundle);

    for (const message of bundle.messages) {
      cursorMs += resolveMessageDelayMs(message);

      playbackItems.push({
        bundleId: bundle._id,
        bundleTitle: bundle.title,
        key: `${bundle._id}:${message.messageId}`,
        message,
        revealAtMs: cursorMs,
      });
    }
  }

  return playbackItems;
}

function resolveMessageDelayMs(message: NarrativeMessageDto) {
  const textLength = message.text?.trim().length ?? 0;

  if (textLength > 0) {
    return clamp(textLength * TEXT_DELAY_FACTOR_MS, TEXT_DELAY_MIN_MS, TEXT_DELAY_MAX_MS);
  }

  if (message.attachment) {
    return ATTACHMENT_ONLY_DELAY_MS;
  }

  return TEXT_DELAY_MIN_MS;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getBundleReleaseMs(bundle: NarrativeBundleDto) {
  const parsed = Date.parse(bundle.releaseAt);

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return Date.now();
}

const styles = StyleSheet.create({
  actorName: {
    color: '#4b5563',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  attachmentBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: 14,
    marginBottom: 8,
    overflow: 'hidden',
  },
  attachmentCaption: {
    color: '#374151',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  audioButton: {
    backgroundColor: '#f97316',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  audioButtonLabel: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
  audioHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
  },
  audioTitle: {
    color: '#111827',
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    marginRight: 12,
  },
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: '#64748b',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginTop: 4,
    width: 48,
  },
  avatarFallbackLabel: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  avatarImage: {
    borderRadius: 24,
    height: 48,
    marginTop: 4,
    width: 48,
  },
  bundleLabel: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  errorBanner: {
    backgroundColor: '#7f1d1d',
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    color: '#fee2e2',
    fontSize: 13,
    lineHeight: 18,
  },
  header: {
    backgroundColor: '#3f454a',
    borderBottomColor: '#1f2937',
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  headerTitle: {
    color: '#eef2ef',
    fontSize: 42,
    fontWeight: '700',
  },
  imageAttachment: {
    height: 220,
    width: '100%',
  },
  loadMoreButton: {
    alignItems: 'center',
    backgroundColor: '#f97316',
    borderRadius: 12,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  loadMoreButtonDisabled: {
    opacity: 0.7,
  },
  loadMoreLabel: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  messageBubble: {
    backgroundColor: '#efeee7',
    borderRadius: 20,
    flex: 1,
    padding: 16,
  },
  messageRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  messageText: {
    color: '#111827',
    fontSize: 17,
    lineHeight: 25,
  },
  modeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f97316',
    borderRadius: 999,
    color: '#111827',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  missionCard: {
    backgroundColor: '#f97316',
    borderRadius: 14,
    marginBottom: 8,
    padding: 14,
  },
  missionExcerpt: {
    color: '#7c2d12',
    fontSize: 14,
    marginTop: 6,
  },
  missionTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  safeArea: {
    backgroundColor: '#252b30',
    flex: 1,
  },
  scrollContent: {
    gap: 14,
    padding: 20,
    paddingBottom: 34,
  },
  stateBox: {
    alignItems: 'center',
    backgroundColor: '#1f2937',
    borderRadius: 12,
    gap: 8,
    padding: 20,
  },
  stateText: {
    color: '#e5e7eb',
    fontSize: 14,
  },
  videoAttachment: {
    aspectRatio: 16 / 9,
    width: '100%',
  },
});
