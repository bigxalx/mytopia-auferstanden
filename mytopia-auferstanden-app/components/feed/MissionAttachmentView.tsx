import React from 'react';
import { StyleSheet, View, Text, Pressable, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { Link } from 'expo-router';
import { theme } from '@/src/shared/ui/theme';
import { type NarrativeAttachmentDto, type NarrativeMessageDto } from '@/src/features/feed/data/narrativeFeedClient';
import { type MissionKind, MISSION_KIND_METADATA } from '@/src/features/tasks/data/missionRepository';
import { AppImage } from '@/src/shared/ui/AppImage';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';
import { MissionInteractionZone } from './MissionInteractionZone';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';
import { getMissionLifecycleStatus } from '@/src/features/tasks/data/missionStatus';
import { useSession } from '@/src/core/session/SessionContext';
import { Ionicons, Feather } from '@expo/vector-icons';

export function MissionAttachmentView({
  attachment,
  userInteraction = false,
  actor,
}: {
  attachment: Extract<NarrativeAttachmentDto, { _type: 'missionAttachment' }>;
  userInteraction?: boolean;
  actor: NarrativeMessageDto['actor'];
}) {
  const { focusedMissionId, setFocus, startChatQuiz } = useActiveMission();
  const { user } = useSession();
  const completedMissions = useCompletedMissions(user?.id);
  const submissionStates = useMissionSubmissionStates(user?.id);

  const isFocused = focusedMissionId === attachment.missionId;
  
  // Create a mission object compatible with getMissionLifecycleStatus
  const missionObj = {
    _id: attachment.missionId,
  } as any;

  const status = getMissionLifecycleStatus(missionObj, completedMissions, submissionStates);
  const isAvailable = status === 'available';

  const meta = attachment.missionKind
    ? MISSION_KIND_METADATA[attachment.missionKind as MissionKind]
    : null;

  const description = attachment.excerpt || [
    meta ? `${meta.emoji} ${meta.label}` : null,
    attachment.missionPoints ? `${attachment.missionPoints} Punkte` : null
  ].filter(Boolean).join(' · ');

  const handleSuccess = () => {
    // Clear focus when mission is complete
    setFocus(null);
  };

  if (userInteraction) {
     return (
        <MissionInteractionZone
          missionId={attachment.missionId}
          kind={attachment.missionKind as MissionKind}
          questions={attachment.questions}
          gpsConfig={attachment.gpsConfig}
          onSuccess={handleSuccess}
          actor={actor}
        />
     );
  }

  if (isFocused) {
    // Active mission interaction moves to user bubble, hide inline card content interaction
    // We only return the card itself (maybe optional? User said "instead show new user bubble")
    // Let's keep the card as a reference but hide the inner zone.
  }

  const content = (
    <View style={styles.missionCardContent}>
      <Text style={styles.missionTitle}>
        {(attachment.title || attachment.missionTitle || 'Mission').toUpperCase()}
      </Text>
      {description && (
        <Text 
          style={styles.missionExcerpt} 
          numberOfLines={isFocused ? 1 : 3}
        >
          {description}
        </Text>
      )}
      
      {isAvailable && !isFocused && (
        <MissionInteractionZone
          missionId={attachment.missionId}
          kind={attachment.missionKind as MissionKind}
          questions={attachment.questions}
          gpsConfig={attachment.gpsConfig}
          onSuccess={handleSuccess}
          actor={actor}
        />
      )}

      {!isAvailable && !isFocused && (
        <View style={styles.statusBadge}>
          {status === 'completed' && (
            <View style={styles.statusRow}>
              <Ionicons name="checkmark-circle" size={16} color={theme.colors.successText} />
              <Text style={[styles.statusText, { color: theme.colors.successText }]}>Abgeschlossen</Text>
            </View>
          )}
          {status === 'pending' && (
            <View style={styles.statusRow}>
              <Feather name="clock" size={16} color="#666" />
              <Text style={styles.statusText}>In Prüfung</Text>
            </View>
          )}
           {status === 'rejected' && (
            <View style={styles.statusRow}>
              <Ionicons name="alert-circle" size={16} color={theme.colors.destructiveText} />
              <Text style={[styles.statusText, { color: theme.colors.destructiveText }]}>Abgelehnt</Text>
            </View>
          )}
          {status === 'expired' && (
            <View style={styles.statusRow}>
              <Feather name="calendar" size={16} color="#999" />
              <Text style={[styles.statusText, { color: '#999' }]}>Abgelaufen</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  if (isAvailable && attachment.missionKind === 'quiz') {
    return (
      <Pressable 
        style={styles.orange} 
        onPress={() => startChatQuiz(attachment.missionId, actor, {
          title: attachment.missionTitle || attachment.title,
          questions: attachment.questions,
          description: attachment.excerpt,
          imageUrl: attachment.imageUrl,
        })}
      >
        {attachment.imageUrl && (
          <AppImage
            uri={attachment.imageUrl}
            style={styles.missionCardImage}
            contentFit="cover"
          />
        )}
        {content}
      </Pressable>
    );
  }

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
        {content}
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
  orangeFocused: {
    backgroundColor: theme.colors.orangeAlpha || 'rgba(255, 149, 0, 0.05)',
    borderWidth: 1.5,
    borderColor: theme.colors.orange,
    borderRadius: 12,
    padding: 6,
  } as ViewStyle,
  missionCardImage: {
    borderRadius: 8,
    height: 120, // Slightly more compact when focused
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
  statusBadge: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  } as ViewStyle,
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  } as ViewStyle,
  statusText: {
    fontSize: 12,
    fontFamily: 'NunitoSans_700Bold',
    color: '#666',
  } as TextStyle,
});
