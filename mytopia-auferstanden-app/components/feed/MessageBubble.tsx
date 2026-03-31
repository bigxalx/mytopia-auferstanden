import React from 'react';
import { StyleSheet, View, Text, type ViewStyle, type TextStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { theme } from '@/src/shared/ui/theme';
import { type NarrativeMessageDto } from '@/src/features/feed/data/narrativeFeedClient';
import { ActorAvatar } from './ActorAvatar';
import { AttachmentView } from './AttachmentView';

const TAIL_WIDTH = 20;
const TAIL_HEIGHT = 12;

function BubbleTail() {
  return (
    <View style={styles.tailWrap}>
      <Svg width={TAIL_WIDTH} height={TAIL_HEIGHT} viewBox="0 0 20 12">
        <Path
          d="M18 0 C14 0 14 12 0 12 C10 12 6 0 6 0 Z"
          fill={theme.colors.beige}
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
}: {
  message: NarrativeMessageDto;
  showAvatar: boolean;
  showName: boolean;
  gallerySources: { uri: string }[];
  onImagePress: (index: number) => void;
  containerStyle?: ViewStyle;
}) {
  return (
    <View style={[styles.messageRow, containerStyle, showAvatar && { paddingBottom: 24 }]}>
      {showAvatar && (
        <View style={styles.avatarColumn}>
          <ActorAvatar actor={message.actor} />
        </View>
      )}

      <View style={styles.bubbleContainer}>
        <View style={[styles.messageBubble, showAvatar && styles.lastInGroup]}>
          {showName && (
            <Text
              style={[
                styles.headline,
                message.actor.nameColor ? { color: message.actor.nameColor } : {},
              ]}
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
        {showAvatar && <BubbleTail />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    position: 'relative'
  } as ViewStyle,
  avatarColumn: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 48,
  } as ViewStyle,
  bubbleContainer: {
    flex: 1,
    marginLeft: 60
  } as ViewStyle,
  messageBubble: {
    backgroundColor: theme.colors.beige,
    borderRadius: 12,
    flex: 1,
    padding: 8,
    gap: 8
  } as ViewStyle,
  lastInGroup: {} as ViewStyle,
  tailWrap: {
    position: 'absolute',
    bottom: -TAIL_HEIGHT + 1,
    left: 6,
    width: TAIL_WIDTH,
    height: TAIL_HEIGHT,
  } as ViewStyle,
  headline: {
    color: theme.colors.charcoal,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 13
  } as TextStyle,
  messageText: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 13,
    lineHeight: 20
  } as TextStyle,
});
