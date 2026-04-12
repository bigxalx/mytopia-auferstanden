import React, { useEffect } from 'react';
import { StyleSheet, View, Text, type ViewStyle, type TextStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { 
  useAnimatedStyle, 
  interpolateColor, 
  useSharedValue, 
  withTiming, 
  withSequence,
  withDelay
} from 'react-native-reanimated';
import { theme } from '@/src/shared/ui/theme';
import { type NarrativeMessageDto } from '@/src/features/feed/data/narrativeFeedClient';
import { ActorAvatar } from './ActorAvatar';
import { AttachmentView } from './AttachmentView';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';

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
  containerStyle,
  userInteraction,
}: {
  message: NarrativeMessageDto;
  showAvatar: boolean;
  showName: boolean;
  gallerySources: { uri: string }[];
  onImagePress: (index: number) => void;
  containerStyle?: ViewStyle;
  userInteraction?: boolean;
}) {
  const isUser = message.isUser;
  const effectiveShowAvatar = showAvatar && !isUser;
  const effectiveShowName = showName && !isUser;

  const { highlightedMissionId } = useActiveMission();
  const highlightProgress = useSharedValue(0);

  const isTargetMission = 
    message.attachment?._type === 'missionAttachment' && 
    (
      (message.attachment as any).missionId === highlightedMissionId || 
      (message.attachment as any).missionTitle === highlightedMissionId
    );

  useEffect(() => {
    if (isTargetMission) {
      // Single elegant pulse
      highlightProgress.value = withSequence(
        withTiming(1, { duration: 500 }),
        withDelay(1500, withTiming(0, { duration: 800 }))
      );
    } else {
      highlightProgress.value = withTiming(0, { duration: 200 });
    }
  }, [isTargetMission, highlightProgress]);

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

  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser, containerStyle]}>
      {effectiveShowAvatar && (
        <View style={styles.avatarColumn}>
          <ActorAvatar actor={message.actor} />
        </View>
      )}

      <View style={[
        styles.bubbleContainer,
        isUser ? styles.bubbleContainerUser : styles.bubbleContainerNPC
      ]}>
        <Animated.View style={[
          styles.messageBubble, 
          isUser && styles.messageBubbleUser,
          animatedBubbleStyle,
          effectiveShowAvatar && styles.lastInGroup
        ]}>
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
              messageText={message.text}
              gallerySources={gallerySources}
              onImagePress={onImagePress}
              userInteraction={userInteraction}
            />
          )}
        </Animated.View>
        {(effectiveShowAvatar || isUser) && <BubbleTail isUser={isUser} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    position: 'relative',
    marginBottom: 12,
  } as ViewStyle,
  messageRowUser: {
    paddingLeft: 40,
  } as ViewStyle,
  avatarColumn: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 48,
  } as ViewStyle,
  bubbleContainer: {
    flex: 1,
  } as ViewStyle,
  bubbleContainerNPC: {
    marginLeft: 60,
  } as ViewStyle,
  bubbleContainerUser: {
    marginLeft: 20,
    marginRight: 10,
    alignItems: 'flex-end',
  } as ViewStyle,
  messageBubble: {
    backgroundColor: theme.colors.beige,
    borderRadius: 16,
    padding: 10,
    gap: 8,
    maxWidth: '100%',
  } as ViewStyle,
  messageBubbleUser: {
    backgroundColor: theme.colors.accent,
    borderBottomRightRadius: 8,
  } as ViewStyle,
  lastInGroup: {} as ViewStyle,
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
