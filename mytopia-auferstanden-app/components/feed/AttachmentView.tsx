import React from 'react';
import { StyleSheet, Text, Pressable, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { theme } from '@/src/shared/ui/theme';
import { VideoAttachmentView } from './VideoAttachmentView';
import { AudioAttachmentView } from './AudioAttachmentView';
import { MissionAttachmentView } from './MissionAttachmentView';
import { SubmissionAttachmentView } from './SubmissionAttachmentView';
import { type NarrativeAttachmentDto } from '@/src/features/feed/data/narrativeFeedClient';
import { AppImage } from '@/src/shared/ui/AppImage';

export function AttachmentView({
  attachment,
  gallerySources,
  onImagePress,
  userInteraction,
  messageText,
}: {
  attachment: NarrativeAttachmentDto;
  gallerySources: { uri: string }[];
  onImagePress: (index: number) => void;
  userInteraction?: boolean;
  messageText?: string;
}) {
  switch (attachment._type) {
    case 'imageAttachment': {
      const index = gallerySources.findIndex((s) => s.uri === attachment.url);
      return (
        <Pressable style={styles.attachmentBox} onPress={() => index >= 0 && onImagePress(index)}>
          <AppImage
            uri={attachment.url}
            style={styles.imageAttachment}
            contentFit="cover"
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
      return <MissionAttachmentView attachment={attachment} userInteraction={userInteraction} />;
    case 'submissionAttachment':
      return <SubmissionAttachmentView {...attachment} messageText={messageText} />;
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
