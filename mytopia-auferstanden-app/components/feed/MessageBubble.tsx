import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, Text, type ViewStyle, type TextStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  interpolateColor,
  useSharedValue,
  withTiming,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import { theme } from '@/src/shared/ui/theme';
import { type NarrativeMessageDto } from '@/src/features/feed/data/narrativeFeedClient';
import { ActorAvatar } from './ActorAvatar';
import { AttachmentView } from './AttachmentView';
import { NarrativeReactionBadges } from './NarrativeReactionBadges';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';
import { buildFeedChannelHref, useChannels } from '@/src/features/channels/data/ChannelContext';
import { type NarrativeMessageReactionState } from '@/src/features/feed/reactions/reactionCatalog';
import { type ThreadReactionFrame } from '@/src/features/thread/data/threadReactionTarget';
import { useRouter } from 'expo-router';

const TAIL_WIDTH = 20;
const TAIL_HEIGHT = 12;

function BubbleTail({ isUser }: { isUser?: boolean }) {
  return (
    <View style={[styles.tailWrap, isUser ? styles.tailWrapRight : styles.tailWrapLeft]}>
      <Svg
        width={TAIL_WIDTH}
        height={TAIL_HEIGHT}
        viewBox="0 0 20 12"
        style={isUser ? { transform: [{ scaleX: -1 }] } : undefined}
      >
        <Path
          d="M18 0 C14 0 14 12 0 12 C10 12 6 0 6 0 Z"
          fill={isUser ? theme.colors.accent : theme.colors.beige}
        />
      </Svg>
    </View>
  );
}

export function MessageBubble({
  message,
  showAvatar,
  showName,
  gallerySources,
  onImagePress,
  animateAttachment,
  resultAnimationKey,
  avatarBottomOffset = 0,
  containerStyle,
  isHighlighted = false,
  reactionState,
  onLongPress,
  userInteraction,
  isLastInGroup,
}: {
  message: NarrativeMessageDto;
  showAvatar: boolean;
  showName: boolean;
  gallerySources: { uri: string }[];
  onImagePress: (index: number) => void;
  animateAttachment?: boolean;
  resultAnimationKey?: string | null;
  avatarBottomOffset?: number;
  containerStyle?: ViewStyle;
  isHighlighted?: boolean;
  reactionState?: NarrativeMessageReactionState | null;
  onLongPress?: (sourceFrame: ThreadReactionFrame | null) => void;
  userInteraction?: boolean;
  isLastInGroup?: boolean;
}) {
  const isUser = message.isUser;
  const isCentered = message.attachment?._type === 'missionResultAttachment';
  const isSubmission = message.attachment?._type === 'submissionAttachment';
  const shouldStretchBubble = Boolean(message.attachment) && !isCentered && !isSubmission;
  const router = useRouter();
  const { actorChannels } = useChannels();
  
  const effectiveShowAvatar = showAvatar && !isUser && !isCentered;
  const effectiveShowName = showName && !isUser && !isCentered;

  const { highlightedMissionId } = useActiveMission();
  const highlightProgress = useSharedValue(0);
  const avatarOffsetProgress = useSharedValue(avatarBottomOffset);
  const messageRootRef = useRef<View>(null);

  const isTargetMission =
    message.attachment?._type === 'missionAttachment' &&
    (
      (message.attachment as any).missionId === highlightedMissionId ||
      (message.attachment as any).missionTitle === highlightedMissionId
    );

  const linkedChannelId =
    message.actor.actorId && actorChannels.some((channel) => channel.channelId === message.actor.actorId)
      ? message.actor.actorId
      : null;

  useEffect(() => {
    if (isTargetMission || isHighlighted) {
      // Single elegant pulse
      highlightProgress.value = withSequence(
        withTiming(1, { duration: 500 }),
        withDelay(1500, withTiming(0, { duration: 800 }))
      );
    } else {
      highlightProgress.value = withTiming(0, { duration: 200 });
    }
  }, [highlightProgress, isHighlighted, isTargetMission]);

  useEffect(() => {
    avatarOffsetProgress.value = withTiming(avatarBottomOffset, {
      duration: 220,
    });
  }, [avatarBottomOffset, avatarOffsetProgress]);

  const animatedBubbleStyle = useAnimatedStyle(() => {
    const defaultColor = isUser ? theme.colors.accent : theme.colors.beige;
    // Highlight effect: light amber for user, standard gray pulse for mission
    // Highlight effect: more prominent orange pulse
    const highlightColor = isUser ? '#facc15' : '#f97316'; // Solid orange pulse for mission

    return {
      backgroundColor: interpolateColor(
        highlightProgress.value,
        [0, 1],
        [defaultColor, highlightColor]
      ) as string
    };
  });

  const animatedAvatarStyle = useAnimatedStyle(() => ({
    bottom: -32 - avatarOffsetProgress.value,
  }));

  const handleLongPress = useCallback(() => {
    if (!onLongPress) {
      return;
    }

    messageRootRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        onLongPress({
          height,
          width,
          x,
          y,
        });
        return;
      }

      onLongPress(null);
    });
  }, [onLongPress]);

  return (
    <View ref={messageRootRef} style={[styles.messageRoot, isUser && styles.messageRootUser, containerStyle]}>
      <View style={[
        styles.messageBody,
      ]}>
        {effectiveShowAvatar && (
          <Animated.View style={[styles.avatarColumn, animatedAvatarStyle]}>
            <ActorAvatar
              actor={message.actor}
              onPress={
                linkedChannelId
                  ? () =>
                      router.navigate(buildFeedChannelHref(linkedChannelId))
                  : undefined
              }
            />
          </Animated.View>
        )}

        <Animated.View
          style={[
            styles.bubbleContainer,
            isCentered ? styles.bubbleContainerCentered : (isUser ? styles.bubbleContainerUser : styles.bubbleContainerNPC)
          ]}
        >
          <View
            style={[
              styles.bubbleShell,
              shouldStretchBubble && styles.bubbleShellAttachment,
              isCentered && styles.bubbleShellCentered,
              isUser && styles.bubbleShellUser,
            ]}
          >
            <Pressable
              delayLongPress={220}
              disabled={!onLongPress}
              onLongPress={handleLongPress}
              style={styles.bubblePressable}
            >
              <Animated.View
                style={[
                  styles.messageBubble,
                  isUser && styles.messageBubbleUser,
                  shouldStretchBubble && styles.messageBubbleAttachment,
                  isCentered && styles.messageBubbleCentered,
                  animatedBubbleStyle,
                ]}
              >
                {effectiveShowName && (
                  <Text
                    style={[
                      styles.headline,
                      message.actor.nameColor ? { color: message.actor.nameColor } : {},
                    ]}
                  >
                    {message.actor.name}
                  </Text>
                )}
                {message.text && (message.attachment?._type !== 'submissionAttachment') && (
                  <Text style={[styles.messageText, isUser && styles.messageTextUser]}>
                    {message.text}
                  </Text>
                )}
                {message.attachment && (
                  <AttachmentView
                    attachment={message.attachment}
                    animateAttachment={animateAttachment}
                    resultAnimationKey={resultAnimationKey}
                    messageText={message.text}
                    gallerySources={gallerySources}
                    onImagePress={onImagePress}
                    userInteraction={userInteraction}
                    actor={message.actor}
                  />
                )}
              </Animated.View>
            </Pressable>
            {(isLastInGroup && !isCentered) && <BubbleTail isUser={isUser} />}
          </View>
        </Animated.View>
      </View>

      <NarrativeReactionBadges
        containerStyle={[
          styles.reactionBadgesWrap,
          isCentered
            ? styles.reactionBadgesWrapCentered
            : isUser
              ? styles.reactionBadgesWrapUser
              : styles.reactionBadgesWrapNPC,
        ]}
        isUser={isUser}
        reactionState={reactionState}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  messageRoot: {
    position: 'relative',
  } as ViewStyle,
  messageRootUser: {
    paddingLeft: 40,
  } as ViewStyle,
  messageBody: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    position: 'relative',
  } as ViewStyle,
  avatarColumn: {
    position: 'absolute',
    left: 0,
    bottom: -32,
    width: 48,
    alignItems: 'center',
  } as ViewStyle,
  bubbleContainer: {
    flex: 1,
  } as ViewStyle,
  bubbleContainerNPC: {
    marginLeft: 60,
  } as ViewStyle,
  bubbleContainerCentered: {
    alignItems: 'center',
    marginHorizontal: 12,
  } as ViewStyle,
  bubbleContainerUser: {
    marginLeft: 20,
    marginRight: 10,
    alignItems: 'flex-end',
  } as ViewStyle,
  bubbleShell: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    position: 'relative',
  } as ViewStyle,
  bubbleShellAttachment: {
    alignSelf: 'stretch',
    width: '100%',
  } as ViewStyle,
  bubbleShellCentered: {
    alignSelf: 'center',
  } as ViewStyle,
  bubbleShellUser: {
    alignSelf: 'flex-end',
  } as ViewStyle,
  bubblePressable: {
    alignSelf: 'stretch',
  } as ViewStyle,
  messageBubble: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.beige,
    borderRadius: 16,
    gap: 8,
    maxWidth: '100%',
    padding: 10,
  } as ViewStyle,
  messageBubbleAttachment: {
    alignSelf: 'stretch',
    width: '100%',
  } as ViewStyle,
  messageBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.accent,
    borderBottomRightRadius: 8,
  } as ViewStyle,
  messageBubbleCentered: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
    maxWidth: '100%',
    padding: 0,
    elevation: 0,
    shadowOpacity: 0,
  } as ViewStyle,
  tailWrap: {
    position: 'absolute',
    bottom: -TAIL_HEIGHT + 1,
    width: TAIL_WIDTH,
    height: TAIL_HEIGHT,
  } as ViewStyle,
  tailWrapLeft: {
    left: 6,
  } as ViewStyle,
  tailWrapRight: {
    right: 6,
  } as ViewStyle,
  reactionBadgesWrap: {
    minHeight: 0,
    marginTop: -10,
    transform: [{ translateX: 10 }],
    zIndex: 2,
  } as ViewStyle,
  reactionBadgesWrapNPC: {
    marginLeft: 60,
  } as ViewStyle,
  reactionBadgesWrapUser: {
    marginLeft: 20,
    marginRight: 2,
  } as ViewStyle,
  reactionBadgesWrapCentered: {
    marginHorizontal: 12,
  } as ViewStyle,
  headline: {
    color: theme.colors.charcoal,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 13
  } as TextStyle,
  messageText: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 14,
    lineHeight: 20
  } as TextStyle,
  messageTextUser: {
    color: '#1f2937',
  } as TextStyle,
});
