import React from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle, type TextStyle, Pressable } from 'react-native';
import { theme } from '@/src/shared/ui/theme';
import { type NarrativeMessageDto } from '@/src/features/feed/data/narrativeFeedClient';

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
  onImagePress: (idx: number) => void;
  containerStyle?: ViewStyle;
}) {
  const isImage = message.attachment?._type === 'imageAttachment';
  const imageUrl = isImage ? (message.attachment as any).url : null;

  return (
    <View style={[styles.bubbleContainer, containerStyle]}>
      <View style={styles.avatarContainer}>
        {showAvatar && message.actor.avatarUrl ? (
          <Image source={{ uri: message.actor.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder} />
        )}
      </View>
      <View style={styles.contentContainer}>
        {showName && (
          <Text style={styles.actorName}>{message.actor.name}</Text>
        )}
        <View style={styles.bubble}>
          {message.text && (
            <Text style={styles.messageText}>{message.text}</Text>
          )}
          {imageUrl && (
            <Pressable
              onPress={() => {
                const idx = gallerySources.findIndex(s => s.uri === imageUrl);
                if (idx !== -1) onImagePress(idx);
              }}
              style={styles.imagePressable}
            >
              <Image source={{ uri: imageUrl }} style={styles.attachmentImage} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// Keep FeedRow as a fallback for the old feed style if needed
export function FeedRow({ item }: { item: any }) {
  // Simplistic implementation as a fallback
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{item.title}</Text>
      <Text style={styles.rowDesc}>{item.description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginVertical: 2,
  } as ViewStyle,
  avatarContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  } as ViewStyle,
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.cardSubtleBackground,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
  },
  contentContainer: {
    flex: 1,
    marginLeft: 8,
  } as ViewStyle,
  actorName: {
    color: theme.colors.cardTextSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    marginLeft: 4,
  } as TextStyle,
  bubble: {
    backgroundColor: theme.colors.beige,
    borderColor: theme.colors.cardBorder,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  } as ViewStyle,
  messageText: {
    color: theme.colors.cardTextPrimary,
    fontSize: 15,
    lineHeight: 20,
  } as TextStyle,
  imagePressable: {
    marginTop: 8,
  } as ViewStyle,
  attachmentImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
    backgroundColor: theme.colors.cardSubtleBackground,
  },
  row: {
    padding: 16,
    backgroundColor: theme.colors.beige,
    marginBottom: 8,
    borderRadius: 12,
  } as ViewStyle,
  rowTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  } as TextStyle,
  rowDesc: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  } as TextStyle,
});
