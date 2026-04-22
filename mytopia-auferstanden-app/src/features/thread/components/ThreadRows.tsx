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
import { type NarrativeMessageReactionState } from '@/src/features/feed/reactions/reactionCatalog';
import { SystemMessage } from '@/components/feed/SystemMessage';
import { type PlaybackMessage } from '@/src/features/feed/utils/playback';
import { type ThreadReactionTarget } from '@/src/features/thread/data/threadReactionTarget';
import { type FeedItem } from '@/src/features/thread/data/threadRenderItems';
import { threadListStyles as styles } from '@/src/features/thread/components/threadListStyles';
import { theme } from '@/src/shared/ui/theme';

const INLINE_TYPING_AVATAR_OFFSET = 42;

export function ThreadFeedItemRow({
  allowAnimations,
  didCaptureInitialItemsRef,
  feedItems,
  getReactionState,
  animatedResultKey,
  highlightedMessageKey,
  imageSources,
  index,
  item,
  onMessageLongPress,
  onImagePress,
  showNpcAvatars = true,
  seenMessageKeysRef,
}: {
  allowAnimations: boolean;
  didCaptureInitialItemsRef: MutableRefObject<boolean>;
  feedItems: FeedItem[];
  getReactionState?: (playbackMessage: PlaybackMessage) => NarrativeMessageReactionState | null;
  animatedResultKey?: string | null;
  highlightedMessageKey?: string | null;
  imageSources: { uri: string }[];
  index: number;
  item: FeedItem;
  onMessageLongPress?: (target: ThreadReactionTarget) => void;
  onImagePress: (index: number) => void;
  showNpcAvatars?: boolean;
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

    if (continueExistingNpcGroup) {
      return null;
    }

    return (
      <View style={[styles.messageRow, styles.npcMessageRow, { marginBottom: 20 }]}>
        {showNpcAvatars ? (
          <View style={styles.typingAvatarColumn}>
            <ActorAvatar actor={item.actor} />
          </View>
        ) : null}
        <View style={[styles.typingBubbleWrap, !showNpcAvatars && styles.typingBubbleWrapNoAvatar]}>
          <TypingIndicatorBubble showTail />
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
  const typingContinuesGroup =
    nextItem?.type === 'typing' &&
    !currentIsUser &&
    nextItem.actor.name === currentActorName &&
    nextItem.actor.actorId === playbackMessage.message.actor.actorId;
  const isLastInBundle = !nextMessage || nextMessage.bundleId !== playbackMessage.bundleId;
  const shouldAnimate =
    allowAnimations &&
    didCaptureInitialItemsRef.current &&
    !seenMessageKeysRef.current.has(item.key);
  const shouldAnimateResult = allowAnimations && isResultCard && animatedResultKey === item.key;
  const shouldAnimateRow = isResultCard ? shouldAnimateResult : shouldAnimate;
  const resultCardTopSpacing =
    isResultCard && (previousItem?.type === 'typing' || (previousMessage && !previousMessage.message.isUser)) ? 52 : 0;
  const showAvatar = showNpcAvatars && (isLastInGroup || typingContinuesGroup) && !currentIsUser;
  const showName = isFirstInGroup && !currentIsUser;
  const isReactableMessage = Boolean(onMessageLongPress) && !isSystem && !isResultCard;
  const reactionState = getReactionState?.(playbackMessage) ?? null;

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
          actionLabel={
            (playbackMessage.message.attachment as Extract<PlaybackMessage['message']['attachment'], { _type: 'systemAttachment' }>)?.actionLabel
          }
          actionType={
            (playbackMessage.message.attachment as Extract<PlaybackMessage['message']['attachment'], { _type: 'systemAttachment' }>)?.actionType
          }
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
      pop={shouldAnimateResult}
      shouldAnimate={shouldAnimateRow}
      style={[
        styles.messageRow,
        isResultCard
          ? styles.centeredMessageRow
          : currentIsUser
            ? styles.playerMessageRow
            : styles.npcMessageRow,
        {
          marginBottom: isLastInGroup ? (isLastInBundle ? 24 : 16) : 4,
          marginTop: resultCardTopSpacing,
        },
      ]}
    >
      <View style={styles.rowContent}>
        <MessageBubble
          animateAttachment={isResultCard ? shouldAnimateResult : shouldAnimate}
          avatarBottomOffset={typingContinuesGroup ? INLINE_TYPING_AVATAR_OFFSET : 0}
          gallerySources={imageSources}
          isHighlighted={highlightedMessageKey === item.key}
          isLastInGroup={isLastInGroup && !typingContinuesGroup}
          message={playbackMessage.message}
          onLongPress={
            isReactableMessage
              ? (sourceFrame) =>
                  onMessageLongPress?.({
                    isLastInGroup: isLastInGroup && !typingContinuesGroup,
                    playbackMessage,
                    showAvatar,
                    showName,
                    sourceFrame,
                  })
              : undefined
          }
          onImagePress={onImagePress}
          reactionState={reactionState}
          resultAnimationKey={shouldAnimateResult ? item.key : null}
          reserveNpcAvatarSpace={showNpcAvatars}
          showAvatar={showAvatar}
          showName={showName}
        />
        {typingContinuesGroup ? (
          <View style={[styles.inlineTypingWrap, !showNpcAvatars && styles.inlineTypingWrapNoAvatar]}>
            <TypingIndicatorBubble showTail />
          </View>
        ) : null}
      </View>
    </FeedAnimatedRow>
  );
}

export function FeedAnimatedRow({
  children,
  itemKey,
  pop = false,
  shouldAnimate,
  style,
}: {
  children: React.ReactNode;
  itemKey: string;
  pop?: boolean;
  shouldAnimate: boolean;
  style?: ViewStyle | ViewStyle[];
}) {
  const opacity = useRef(new Animated.Value(shouldAnimate ? 0 : 1)).current;
  const scale = useRef(new Animated.Value(shouldAnimate && pop ? 0.92 : 1)).current;
  const translateY = useRef(new Animated.Value(shouldAnimate ? 18 : 0)).current;

  useEffect(() => {
    if (!shouldAnimate) {
      opacity.stopAnimation();
      scale.stopAnimation();
      translateY.stopAnimation();
      opacity.setValue(1);
      scale.setValue(1);
      translateY.setValue(0);
      return;
    }

    opacity.stopAnimation();
    scale.stopAnimation();
    translateY.stopAnimation();
    opacity.setValue(0);
    scale.setValue(pop ? 0.92 : 1);
    translateY.setValue(18);
    Animated.parallel([
      Animated.timing(opacity, {
        duration: 320,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        duration: 320,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        duration: pop ? 320 : 260,
        easing: Easing.out(Easing.back(1.2)),
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [itemKey, opacity, pop, scale, shouldAnimate, translateY]);

  if (!shouldAnimate) {
    return <View style={style}>{children}</View>;
  }

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function TypingIndicatorBubble({ showTail = false }: { showTail?: boolean }) {
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
    <View style={styles.typingBubbleShell}>
      <View style={styles.typingBubble}>
        <View style={styles.typingDots}>
          <Animated.View style={[styles.typingDot, { opacity: dotOne }]} />
          <Animated.View style={[styles.typingDot, { opacity: dotTwo }]} />
          <Animated.View style={[styles.typingDot, { opacity: dotThree }]} />
        </View>
      </View>
      {showTail ? <TypingBubbleTail /> : null}
    </View>
  );
}

function TypingBubbleTail() {
  return (
    <View style={styles.typingTailWrap}>
      <Svg height={12} viewBox="0 0 20 12" width={20}>
        <Path d="M18 0 C14 0 14 12 0 12 C10 12 6 0 6 0 Z" fill={theme.colors.beige} />
      </Svg>
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
