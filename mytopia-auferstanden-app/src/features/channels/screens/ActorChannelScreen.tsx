import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ImageView from 'react-native-image-viewing';

import { MessageBubble } from '@/components/feed/MessageBubble';
import { MissionChatInput } from '@/components/feed/MissionChatInput';
import { MissionChoicePicker } from '@/components/feed/MissionChoicePicker';
import { SystemMessage } from '@/components/feed/SystemMessage';
import { ActorAvatar } from '@/components/feed/ActorAvatar';
import { useChannels } from '@/src/features/channels/data/ChannelContext';
import { HUB_CHANNEL_ID, markChannelAsRead, subscribeToChannelBundles } from '@/src/features/channels/data/channelStore';
import { useSession } from '@/src/core/session/SessionContext';
import { type NarrativeBundleDto, type NarrativeMessageDto } from '@/src/features/feed/data/narrativeFeedClient';
import { buildPlaybackMessages, type PlaybackMessage } from '@/src/features/feed/utils/playback';
import { useActiveMission, useActiveMissionBarVisible } from '@/src/features/tasks/context/ActiveMissionContext';
import { theme } from '@/src/shared/ui/theme';

type FeedItem =
  | { type: 'message'; data: PlaybackMessage; key: string }
  | { type: 'header'; title: string; key: string };

export function ActorChannelScreen({ channelId }: { channelId: string }) {
  const navigation = useNavigation<any>();
  const {
    actorChannels,
    consumePendingMissionStart,
    getChannelScrollOffset,
    pendingMissionStart,
    saveChannelScrollOffset,
  } = useChannels();
  const { selectedMode, user } = useSession();
  const insets = useSafeAreaInsets();
  const {
    activeChannel,
    focusedMissionId,
    highlightMission,
    quizSession,
    registerOptimisticHandler,
    registerScrollHandler,
    setActiveChannel,
    startChatQuiz,
    startMission,
  } = useActiveMission();
  const { isVisible: isMissionBarVisible } = useActiveMissionBarVisible();

  const channel = actorChannels.find((item) => item.channelId === channelId);
  const channelMessageCount = channel?.messageCount ?? 0;
  const restoredScrollOffset = getChannelScrollOffset(channelId);
  const listRef = useRef<FlashListRef<FeedItem>>(null);
  const didRestoreScrollRef = useRef(false);
  const isAtBottomRef = useRef(restoredScrollOffset <= 12);
  const prevVisibleCountRef = useRef(0);
  const seenMessageKeysRef = useRef(new Set<string>());
  const didCaptureInitialMessagesRef = useRef(false);
  const scrollMetricsRef = useRef({ contentHeight: 0, offsetY: restoredScrollOffset, viewportHeight: 0 });
  const [bundles, setBundles] = useState<NarrativeBundleDto[]>([]);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const bottomSpacerHeight =
    Math.max(72, insets.bottom + 108) +
    (activeChannel.channelType === 'actor' ? (quizSession ? 260 : focusedMissionId ? 140 : isMissionBarVisible ? 140 : 0) : 0);

  const playbackMessages = useMemo(() => {
    const missionActors: Record<string, { actor: NarrativeMessageDto['actor']; title: string }> = {};
    for (const bundle of bundles) {
      for (const message of bundle.messages) {
        if (message.attachment?._type === 'missionAttachment') {
          missionActors[message.attachment.missionId] = {
            actor: message.actor,
            title: message.attachment.missionTitle || message.attachment.title || '',
          };
        }
      }
    }
    return buildPlaybackMessages(bundles, missionActors);
  }, [bundles]);

  const visibleMessages = useMemo(
    () => playbackMessages.filter((item) => item.revealAtMs <= clockMs),
    [clockMs, playbackMessages]
  );

  const imageSources = useMemo(
    () =>
      visibleMessages
        .filter((message) => message.message.attachment?._type === 'imageAttachment')
        .map((message) => ({
          uri: (message.message.attachment as Extract<NarrativeMessageDto['attachment'], { _type: 'imageAttachment' }>).url,
        })),
    [visibleMessages]
  );

  const feedItems = useMemo(() => {
    const items: FeedItem[] = [];
    for (const item of visibleMessages) {
      const previous = items[items.length - 1];
      const dayKey = getDayKey(item.revealAtMs);
      const previousDayKey =
        previous?.type === 'header' ? previous.key.replace('header-', '') : getDayKeyFromFeedItem(previous);

      if (dayKey !== previousDayKey) {
        items.push({ key: `header-${dayKey}`, title: formatDayLabel(item.revealAtMs), type: 'header' });
      }
      items.push({ data: item, key: item.key, type: 'message' });
    }
    return items;
  }, [visibleMessages]);

  useEffect(() => {
    seenMessageKeysRef.current.clear();
    didCaptureInitialMessagesRef.current = !channel || channelMessageCount === 0;
    didRestoreScrollRef.current = false;
    prevVisibleCountRef.current = 0;
    scrollMetricsRef.current = {
      contentHeight: 0,
      offsetY: restoredScrollOffset,
      viewportHeight: 0,
    };
    isAtBottomRef.current = restoredScrollOffset <= 12;
  }, [channel, channelId, channelMessageCount, restoredScrollOffset]);

  useEffect(() => {
    if (isLoading || didCaptureInitialMessagesRef.current) {
      return;
    }

    for (const item of feedItems) {
      seenMessageKeysRef.current.add(item.key);
    }
    didCaptureInitialMessagesRef.current = true;
    prevVisibleCountRef.current = visibleMessages.length;
  }, [feedItems, isLoading, visibleMessages.length]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: channel?.title ?? 'Kanal',
    });
  }, [channel?.title, navigation]);

  useFocusEffect(
    useCallback(() => {
      setActiveChannel({
        ...(channel?.avatarUrl ? { actorAvatarUrl: channel.avatarUrl } : {}),
        ...(channel?.actorId ? { actorId: channel.actorId } : {}),
        ...(channel?.title ? { actorName: channel.title } : {}),
        ...(channel?.role ? { actorRole: channel.role } : {}),
        channelId,
        channelType: 'actor',
      });
    }, [channel?.actorId, channel?.avatarUrl, channel?.role, channel?.title, channelId, setActiveChannel])
  );

  useEffect(() => {
    if (!user?.id) {
      setBundles([]);
      setIsLoading(false);
      return;
    }

    return subscribeToChannelBundles({
      channelId,
      listener: (nextBundles) => {
        setBundles((current) => mergeBundles(current, nextBundles));
        setIsLoading(false);
        setClockMs(Date.now());
      },
      mode: selectedMode,
      uid: user.id,
    });
  }, [channelId, selectedMode, user?.id]);

  useFocusEffect(
    useCallback(() => {
      registerOptimisticHandler((updater) => {
        setBundles((current) => updater(current));
        setClockMs(Date.now());
      });
      registerScrollHandler((missionId) => {
        if (missionId === 'bottom') {
          listRef.current?.scrollToEnd({ animated: true });
          return;
        }

        const targetIndex = feedItems.findIndex((item) => {
          if (item.type !== 'message') {
            return false;
          }
          const attachment = item.data.message.attachment;
          return attachment?._type === 'missionAttachment' && attachment.missionId === missionId;
        });

        if (targetIndex >= 0) {
          listRef.current?.scrollToIndex({ animated: true, index: targetIndex, viewPosition: 0.5 });
          highlightMission(missionId);
        } else {
          listRef.current?.scrollToEnd({ animated: true });
        }
      });

      return () => {
        saveChannelScrollOffset(channelId, scrollMetricsRef.current.offsetY);
        registerOptimisticHandler(null);
        registerScrollHandler(null);
      };
    }, [channelId, feedItems, highlightMission, registerOptimisticHandler, registerScrollHandler, saveChannelScrollOffset])
  );

  useEffect(() => {
    const pending = consumePendingMissionStart(channelId);
    if (!pending) {
      return;
    }

    if (pending.kind === 'quiz') {
      void startChatQuiz(pending.missionId, pending.actor, pending.data);
      return;
    }

    void startMission(pending.missionId, pending.actor, pending.data);
  }, [channelId, consumePendingMissionStart, pendingMissionStart, startChatQuiz, startMission]);

  useEffect(() => {
    if (!user?.id || visibleMessages.length === 0) {
      return;
    }

    if (visibleMessages.length > prevVisibleCountRef.current) {
      if (didRestoreScrollRef.current && isAtBottomRef.current) {
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({ animated: true });
        });
        void markChannelAsRead({
          channelId,
          mode: selectedMode,
          uid: user.id,
        });
      }
      prevVisibleCountRef.current = visibleMessages.length;
    }
  }, [channelId, selectedMode, user?.id, visibleMessages.length]);

  useEffect(() => {
    if (isLoading || visibleMessages.length === 0 || didRestoreScrollRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      if (restoredScrollOffset > 0) {
        listRef.current?.scrollToOffset({ animated: false, offset: restoredScrollOffset });
      } else {
        listRef.current?.scrollToEnd({ animated: false });
      }
      didRestoreScrollRef.current = true;
    });
  }, [isLoading, restoredScrollOffset, visibleMessages.length]);

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
    const timer = setTimeout(() => setClockMs(Date.now()), timeoutMs);
    return () => clearTimeout(timer);
  }, [clockMs, playbackMessages]);

  const renderItem = useCallback(
    ({ index, item }: ListRenderItemInfo<FeedItem>) => {
      if (item.type === 'header') {
        return (
          <View style={styles.daySeparatorWrap}>
            <View style={styles.daySeparatorLine} />
            <View style={styles.daySeparatorPill}>
              <Text style={styles.daySeparatorText}>{item.title}</Text>
            </View>
            <View style={styles.daySeparatorLine} />
          </View>
        );
      }

      const playbackMessage = item.data;
      const attachmentType = playbackMessage.message.attachment?._type;
      const isSystem = attachmentType === 'systemAttachment';
      const isResultCard = attachmentType === 'missionResultAttachment';
      const previousItem = feedItems[index - 1];
      const nextItem = feedItems[index + 1];
      const previousMessage = previousItem?.type === 'message' ? previousItem.data : null;
      const nextMessage = nextItem?.type === 'message' ? nextItem.data : null;
      const currentActorName = playbackMessage.message.actor.name;
      const currentIsUser = Boolean(playbackMessage.message.isUser);
      const isFirstInGroup =
        !previousMessage ||
        previousMessage.message.actor.name !== currentActorName ||
        Boolean(previousMessage.message.isUser) !== currentIsUser;
      const isLastInGroup =
        !nextMessage ||
        nextMessage.message.actor.name !== currentActorName ||
        Boolean(nextMessage.message.isUser) !== currentIsUser;
      const rowStyle = isResultCard
        ? styles.centeredMessageRow
        : currentIsUser
          ? styles.playerMessageRow
          : styles.npcMessageRow;
      const shouldAnimate =
        didCaptureInitialMessagesRef.current && !seenMessageKeysRef.current.has(item.key);
      seenMessageKeysRef.current.add(item.key);

      if (isSystem) {
        return (
          <FeedAnimatedRow itemKey={item.key} shouldAnimate={shouldAnimate} style={[styles.messageRow, styles.centeredMessageRow]}>
            <SystemMessage
              text={playbackMessage.message.text || ''}
              variant={(playbackMessage.message.attachment as Extract<PlaybackMessage['message']['attachment'], { _type: 'systemAttachment' }>)?.kind ?? 'neutral'}
            />
          </FeedAnimatedRow>
        );
      }

      return (
        <FeedAnimatedRow
          itemKey={item.key}
          shouldAnimate={shouldAnimate}
          style={[styles.messageRow, rowStyle, { marginBottom: isLastInGroup ? 16 : 4 }]}
        >
          <MessageBubble
            gallerySources={imageSources}
            isLastInGroup={isLastInGroup}
            message={playbackMessage.message}
            onImagePress={(imageIndex) => {
              setViewerIndex(imageIndex);
              setViewerVisible(true);
            }}
            showAvatar={isLastInGroup && !currentIsUser}
            showName={isFirstInGroup && !currentIsUser}
          />
        </FeedAnimatedRow>
      );
    },
    [feedItems, imageSources]
  );

  if (channelId === HUB_CHANNEL_ID) {
    return null;
  }

  return (
    <>
      <FlashList
        ref={listRef}
        contentContainerStyle={styles.scrollContent}
        data={feedItems}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={
          channel ? (
            <View style={styles.channelHero}>
              <ActorAvatar actor={{ ...(channel.avatarUrl ? { avatarUrl: channel.avatarUrl } : {}), name: channel.title }} />
              <Text style={styles.channelTitle}>{channel.title}</Text>
              <Text style={styles.channelDescription}>
                {channel.role?.trim() ? channel.role : 'Privater Missionskanal'}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator color={theme.colors.orange} size="large" />
              <Text style={styles.stateText}>Kanal wird geladen...</Text>
            </View>
          ) : (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>Dieser Kanal ist noch leer.</Text>
            </View>
          )
        }
        ListFooterComponent={<View style={{ height: bottomSpacerHeight }} />}
        onLayout={(event) => {
          scrollMetricsRef.current.viewportHeight = event.nativeEvent.layout.height;
        }}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          scrollMetricsRef.current.contentHeight = contentSize.height;
          scrollMetricsRef.current.offsetY = contentOffset.y;
          scrollMetricsRef.current.viewportHeight = layoutMeasurement.height;
          const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
          isAtBottomRef.current = distanceFromBottom <= 100;
        }}
        onScrollEndDrag={() => {
          if (user?.id) {
            void markChannelAsRead({
              channelId,
              mode: selectedMode,
              uid: user.id,
            });
          }
        }}
        renderItem={renderItem}
        scrollEventThrottle={16}
        style={styles.scrollView}
      />

      {quizSession ? <MissionChoicePicker /> : <MissionChatInput />}

      <ImageView
        imageIndex={viewerIndex}
        images={imageSources}
        onRequestClose={() => setViewerVisible(false)}
        visible={viewerVisible}
      />
    </>
  );
}

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
  const opacity = useRef(new Animated.Value(shouldAnimate ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(shouldAnimate ? 10 : 0)).current;

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
    Animated.parallel([
      Animated.timing(opacity, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
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
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function mergeBundles(current: NarrativeBundleDto[], incoming: NarrativeBundleDto[]) {
  const map = new Map<string, NarrativeBundleDto>();
  for (const bundle of current) {
    map.set(bundle._id, bundle);
  }
  for (const bundle of incoming) {
    map.set(bundle._id, bundle);
  }
  return Array.from(map.values()).sort((a, b) => Date.parse(a.releaseAt) - Date.parse(b.releaseAt));
}

function getDayKey(timestampMs: number) {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getDayKeyFromFeedItem(item: FeedItem | undefined) {
  if (!item || item.type !== 'message') {
    return null;
  }
  return getDayKey(item.data.revealAtMs);
}

function formatDayLabel(timestampMs: number) {
  const date = new Date(timestampMs);
  const now = new Date();
  const diffDays = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86400000
  );

  if (diffDays === 0) {
    return 'Heute';
  }
  if (diffDays === -1) {
    return 'Gestern';
  }

  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  scrollView: {
    backgroundColor: theme.colors.background,
  } as ViewStyle,
  scrollContent: {
    padding: 20,
    paddingBottom: 24,
  } as ViewStyle,
  messageRow: {
    marginBottom: 12,
  } as ViewStyle,
  playerMessageRow: {
    alignItems: 'flex-end',
  } as ViewStyle,
  npcMessageRow: {
    alignItems: 'flex-start',
  } as ViewStyle,
  centeredMessageRow: {
    alignItems: 'center',
  } as ViewStyle,
  stateBox: {
    alignItems: 'center',
    backgroundColor: theme.colors.headerBackground,
    borderRadius: 12,
    gap: 8,
    marginTop: 24,
    padding: 20,
  } as ViewStyle,
  stateText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  } as TextStyle,
  channelHero: {
    alignItems: 'center',
    backgroundColor: theme.colors.headerBackground,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 18,
    paddingHorizontal: 20,
    paddingVertical: 20,
  } as ViewStyle,
  channelTitle: {
    color: theme.colors.textPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 22,
    marginTop: 12,
    textAlign: 'center',
  } as TextStyle,
  channelDescription: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  } as TextStyle,
  daySeparatorWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 28,
  } as ViewStyle,
  daySeparatorLine: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    flex: 1,
    height: 1,
  } as ViewStyle,
  daySeparatorPill: {
    alignItems: 'center',
    backgroundColor: '#3D4344',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
  } as ViewStyle,
  daySeparatorText: {
    color: 'rgba(238, 242, 239, 0.88)',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
    textAlign: 'center',
  } as TextStyle,
});
