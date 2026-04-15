import React, { useEffect, useRef, type MutableRefObject } from 'react';
import {
  Animated,
  Easing,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ActorAvatar } from '@/components/feed/ActorAvatar';
import { MessageBubble } from '@/components/feed/MessageBubble';
import { SystemMessage } from '@/components/feed/SystemMessage';
import { type PlaybackMessage } from '@/src/features/feed/utils/playback';
import { type FeedItem } from '@/src/features/thread/data/threadRenderItems';
import { threadListStyles as styles } from '@/src/features/thread/components/threadListStyles';

export function ThreadFeedItemRow({
  didCaptureInitialItemsRef,
  feedItems,
  imageSources,
  index,
  item,
  onImagePress,
  seenMessageKeysRef,
}: {
  didCaptureInitialItemsRef: MutableRefObject<boolean>;
  feedItems: FeedItem[];
  imageSources: { uri: string }[];
  index: number;
  item: FeedItem;
  onImagePress: (index: number) => void;
  seenMessageKeysRef: MutableRefObject<Set<string>>;
}) {
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

  if (item.type === 'typing') {
    const previousItem = feedItems[index - 1];
    const previousMessage = previousItem?.type === 'message' ? previousItem.data : null;
    const continueExistingNpcGroup =
      previousMessage &&
      !previousMessage.message.isUser &&
      previousMessage.message.actor.name === item.actor.name &&
      previousMessage.message.actor.actorId === item.actor.actorId;

    return (
      <View style={[styles.messageRow, styles.npcMessageRow, { marginBottom: 20 }]}>
        {continueExistingNpcGroup ? null : (
          <View style={styles.typingAvatarColumn}>
            <ActorAvatar actor={item.actor} />
          </View>
        )}
        <View style={[styles.typingBubbleWrap, continueExistingNpcGroup && styles.typingBubbleWrapInline]}>
          <TypingIndicatorBubble />
        </View>
      </View>
    );
  }

  const playbackMessage = item.data;
  const attachmentType = playbackMessage.message.attachment?._type;
  const isSystem = attachmentType === 'systemAttachment';
  const isResultCard = attachmentType === 'missionResultAttachment';
  const currentIsUser = Boolean(playbackMessage.message.isUser);
  const previousItem = feedItems[index - 1];
  const nextItem = feedItems[index + 1];
  const previousMessage = previousItem?.type === 'message' ? previousItem.data : null;
  const nextMessage = nextItem?.type === 'message' ? nextItem.data : null;
  const currentActorName = playbackMessage.message.actor.name;
  const isFirstInGroup =
    !previousMessage ||
    previousMessage.message.actor.name !== currentActorName ||
    Boolean(previousMessage.message.isUser) !== currentIsUser;
  const isLastInGroup =
    !nextMessage ||
    nextMessage.message.actor.name !== currentActorName ||
    Boolean(nextMessage.message.isUser) !== currentIsUser;
  const isLastInBundle = !nextMessage || nextMessage.bundleId !== playbackMessage.bundleId;
  const shouldAnimate =
    didCaptureInitialItemsRef.current && !seenMessageKeysRef.current.has(item.key);

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
          variant={
            (playbackMessage.message.attachment as Extract<PlaybackMessage['message']['attachment'], { _type: 'systemAttachment' }>)?.kind ??
            'neutral'
          }
        />
      </FeedAnimatedRow>
    );
  }

  return (
    <FeedAnimatedRow
      itemKey={item.key}
      shouldAnimate={shouldAnimate}
      style={[
        styles.messageRow,
        isResultCard
          ? styles.centeredMessageRow
          : currentIsUser
            ? styles.playerMessageRow
            : styles.npcMessageRow,
        { marginBottom: isLastInGroup ? (isLastInBundle ? 24 : 16) : 4 },
      ]}
    >
      <MessageBubble
        gallerySources={imageSources}
        isLastInGroup={isLastInGroup}
        message={playbackMessage.message}
        onImagePress={onImagePress}
        showAvatar={isLastInGroup && !currentIsUser}
        showName={isFirstInGroup && !currentIsUser}
      />
    </FeedAnimatedRow>
  );
}

export function FeedAnimatedRow({
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

function TypingIndicatorBubble() {
  const dotOne = useRef(new Animated.Value(0.45)).current;
  const dotTwo = useRef(new Animated.Value(0.45)).current;
  const dotThree = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const createPulse = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            duration: 220,
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            duration: 220,
            toValue: 0.45,
            useNativeDriver: true,
          }),
          Animated.delay(360),
        ])
      );

    const animations = [
      createPulse(dotOne, 0),
      createPulse(dotTwo, 120),
      createPulse(dotThree, 240),
    ];

    animations.forEach((animation) => animation.start());
    return () => {
      animations.forEach((animation) => animation.stop());
    };
  }, [dotOne, dotThree, dotTwo]);

  return (
    <View style={styles.typingBubble}>
      <View style={styles.typingDots}>
        <Animated.View style={[styles.typingDot, { opacity: dotOne }]} />
        <Animated.View style={[styles.typingDot, { opacity: dotTwo }]} />
        <Animated.View style={[styles.typingDot, { opacity: dotThree }]} />
      </View>
    </View>
  );
}

export function FeedDownArrowIcon({
  color,
  size,
  variant,
}: {
  color: string;
  size: number;
  variant: 'outline' | 'bold';
}) {
  return (
    <Svg color={color} fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Path
        d={variant === 'bold' ? 'M7.75 9.5L12 13.75L16.25 9.5' : 'M8 9.75L12 13.75L16 9.75'}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={variant === 'bold' ? '3.25' : '2.4'}
      />
    </Svg>
  );
}
