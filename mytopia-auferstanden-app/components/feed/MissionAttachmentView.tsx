import React from 'react';
import { StyleSheet, View, Text, Pressable, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { theme } from '@/src/shared/ui/theme';
import { type NarrativeAttachmentDto } from '@/src/features/feed/data/narrativeFeedClient';

export function MissionAttachmentView({
  attachment,
}: {
  attachment: Extract<NarrativeAttachmentDto, { _type: 'missionAttachment' }>;
}) {
  const description = attachment.excerpt || [
    attachment.missionKind ? (attachment.missionKind === 'quiz' ? '🧠 Quiz' : '📍 GPS') : null,
    attachment.missionPoints ? `${attachment.missionPoints} Punkte` : null
  ].filter(Boolean).join(' · ');

  return (
    <Link asChild href={`/tasks/${attachment.missionId}`}>
      <Pressable style={styles.orange}>
        {attachment.imageUrl && (
          <Image
            source={{ uri: attachment.imageUrl }}
            style={styles.missionCardImage}
            contentFit="cover"
            cachePolicy="disk"
            transition={200}
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
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
    color: theme.colors.cardTextSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 12,
    marginTop: 2
  } as TextStyle,
});
