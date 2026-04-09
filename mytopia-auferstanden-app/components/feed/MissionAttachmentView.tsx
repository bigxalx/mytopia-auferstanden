import React from 'react';
import { StyleSheet, View, Text, Pressable, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { Link } from 'expo-router';
import { theme } from '@/src/shared/ui/theme';
import { type NarrativeAttachmentDto } from '@/src/features/feed/data/narrativeFeedClient';
import { type MissionKind, MISSION_KIND_METADATA } from '@/src/features/tasks/data/missionRepository';
import { AppImage } from '@/src/shared/ui/AppImage';

export function MissionAttachmentView({
  attachment,
}: {
  attachment: Extract<NarrativeAttachmentDto, { _type: 'missionAttachment' }>;
}) {
  const meta = attachment.missionKind
    ? MISSION_KIND_METADATA[attachment.missionKind as MissionKind]
    : null;

  const description = attachment.excerpt || [
    meta ? `${meta.emoji} ${meta.label}` : null,
    attachment.missionPoints ? `${attachment.missionPoints} Punkte` : null
  ].filter(Boolean).join(' · ');

  return (
    <Link asChild href={`/tasks/${attachment.missionId}`}>
      <Pressable style={styles.orange}>
        {attachment.imageUrl && (
          <AppImage
            uri={attachment.imageUrl}
            style={styles.missionCardImage}
            contentFit="cover"
          />
        )}
        <View style={styles.missionCardContent}>
          <Text style={styles.missionTitle}>
            {(attachment.title || attachment.missionTitle || 'Mission').toUpperCase()}
          </Text>
          {description && <Text style={styles.missionExcerpt}>{description}</Text>}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  orange: {
    backgroundColor: theme.colors.orange,
    borderRadius: 10,
    padding: 5
  } as ViewStyle,
  missionCardImage: {
    borderRadius: 6,
    height: 140,
    width: '100%'
  } as ImageStyle,
  missionCardContent: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 2
  } as ViewStyle,
  missionTitle: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'Nunito_700Bold',
    fontSize: 15
  } as TextStyle,
  missionExcerpt: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 12,
    marginTop: 2
  } as TextStyle,
});
