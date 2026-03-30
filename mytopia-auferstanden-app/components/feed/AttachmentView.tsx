import React from 'react';
import { StyleSheet, Text, Pressable, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import { theme } from '@/src/shared/ui/theme';
import { VideoAttachmentView } from './VideoAttachmentView';
import { AudioAttachmentView } from './AudioAttachmentView';
import { MissionAttachmentView } from './MissionAttachmentView';
import { type NarrativeAttachmentDto } from '@/src/features/feed/data/narrativeFeedClient';

export function AttachmentView({
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
          <Image
            source={{ uri: attachment.url }}
            style={styles.imageAttachment}
            contentFit="cover"
            cachePolicy="disk"
            transition={200}
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
          />
          {attachment.caption && <Text style={styles.attachmentCaption}>{attachment.caption}</Text>}
        </Pressable>
      );
    }
    case 'videoAttachment':
      return <VideoAttachmentView attachment={attachment} />;
    case 'audioAttachment':
      return <AudioAttachmentView attachment={attachment} />;
    case 'missionAttachment':
      return <MissionAttachmentView attachment={attachment} />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  attachmentBox: { 
    backgroundColor: theme.colors.cardSubtleBackground, 
    borderRadius: 14, 
    overflow: 'hidden' 
  } as ViewStyle,
  attachmentCaption: { 
    color: theme.colors.cardTextSecondary, 
    fontSize: 14, 
    paddingHorizontal: 12, 
    paddingVertical: 10 
  } as TextStyle,
  imageAttachment: { 
    height: 220, 
    width: '100%' 
  } as ImageStyle,
});
