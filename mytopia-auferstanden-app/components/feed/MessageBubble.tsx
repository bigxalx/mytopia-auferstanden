import React from 'react';
import { StyleSheet, View, Text, type ViewStyle, type TextStyle } from 'react-native';
import { theme } from '@/src/shared/ui/theme';
import { type NarrativeMessageDto } from '@/src/features/feed/data/narrativeFeedClient';
import { ActorAvatar } from './ActorAvatar';
import { AttachmentView } from './AttachmentView';

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
    <View style={[styles.messageRow, containerStyle]}>
      {showAvatar && (
        <View style={styles.avatarColumn}>
          <ActorAvatar actor={message.actor} />
        </View>
      )}

      <View style={styles.bubbleContainer}>
        <View style={styles.messageBubble}>
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
    width: 48 
  } as ViewStyle,
  bubbleContainer: { 
    flex: 1, 
    marginLeft: 60 
  } as ViewStyle,
  messageBubble: { 
    backgroundColor: theme.colors.beige, 
    borderRadius: 10, 
    flex: 1, 
    padding: 10, 
    gap: 8 
  } as ViewStyle,
  headline: { 
    color: theme.colors.charcoal, 
    fontFamily: 'NunitoSans_700Bold', 
    fontSize: 13 
  } as TextStyle,
  messageText: { 
    color: theme.colors.cardTextPrimary, 
    fontFamily: 'NunitoSans_400Regular', 
    fontSize: 12, 
    lineHeight: 18 
  } as TextStyle,
});
