import React, { useState } from 'react';
import { StyleSheet, View, Text, Pressable, TextInput, ActivityIndicator, Alert, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { theme } from '@/src/shared/ui/theme';
import { type MissionKind } from '@/src/features/tasks/data/missionRepository';

import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';
import { type NarrativeMessageDto } from '@/src/features/feed/data/narrativeFeedClient';
import { useChannels } from '@/src/features/channels/data/ChannelContext';

import { GpsRunner } from '@/src/features/tasks/components/GpsRunner';
import { MissionReference } from './MissionReference';

interface Props {
  missionId: string;
  kind: MissionKind;
  questions?: {
    questionText: string;
    options: { text: string; isCorrect: boolean }[];
  }[];
  onSuccess?: () => void;
  showStartOnly?: boolean; // New prop to force "Start Only" mode if needed
  gpsConfig?: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
  compact?: boolean;
  actor: NarrativeMessageDto['actor'];
  missionTitle: string;
  description?: string;
  imageUrl?: string;
}


export function MissionInteractionZone({ 
  missionId, 
  kind, 
  questions, 
  onSuccess, 
  showStartOnly, 
  gpsConfig, 
  actor, 
  missionTitle,
  description,
  imageUrl,
  compact = false 
}: Props) {
  const router = useRouter();

  const { ensureActorMissionChannel, queuePendingMissionStart } = useChannels();
  const { 
    activeChannel,
    focusedMissionId, 
    activeMission, 
    startMission,
    startChatQuiz,
    persistedSessions,
    completeMission,
  } = useActiveMission();
  const isFocused = focusedMissionId === missionId;
  const isQuizInProgress = kind === 'quiz' && persistedSessions[missionId];
  const resolvedMissionTitle = activeMission?._id === missionId ? activeMission.title : missionTitle;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [textInput, setTextInput] = useState('');

  const handleStartMission = async () => {
    setIsSubmitting(true);
    try {
      if (actor.actorId && activeChannel.channelId !== actor.actorId) {
        const channelId = await ensureActorMissionChannel({
          ...(actor.avatarUrl ? { actorAvatarUrl: actor.avatarUrl } : {}),
          actorId: actor.actorId,
          actorName: actor.name,
          ...(actor.role ? { actorRole: actor.role } : {}),
        });
        queuePendingMissionStart({
          actor,
          channelId,
          data: {
            description,
            imageUrl,
            questions,
            title: resolvedMissionTitle,
          },
          kind,
          missionId,
        });
        router.push({
          pathname: '/(tabs)/feed/[channelId]',
          params: { channelId },
        });
        return;
      }

      if (kind === 'quiz') {
        await startChatQuiz(missionId, actor, {
          title: resolvedMissionTitle,
          questions: questions,
          description: description,
          imageUrl: imageUrl,
        });
      } else {
        await startMission(missionId, actor, {
          description,
          imageUrl,
          title: resolvedMissionTitle,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // If not focused, only show "MISSION STARTEN"
  if (!isFocused || showStartOnly) {
    return (
      <View style={[styles.inputWindow, compact && styles.compactInputWindow]}>
        <Pressable
          disabled={isSubmitting}
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.actionButtonPressed,
            isSubmitting && styles.actionButtonDisabled
          ]}
          onPress={handleStartMission}
        >
          {isSubmitting ? (
            <ActivityIndicator color={styles.actionButtonText.color} size="small" />
          ) : (
            <Text style={styles.actionButtonText}>
              {isQuizInProgress ? 'MISSION FORTSETZEN' : 'MISSION STARTEN'}
            </Text>
          )}
        </Pressable>
      </View>
    );
  }

  const renderReference = () => (
    <MissionReference
      compact
      label={undefined}
      missionId={missionId}
      missionTitle={resolvedMissionTitle}
      style={styles.reference}
    />
  );

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;
    setIsSubmitting(true);
    try {
      await completeMission(missionId, { text: textInput });
      onSuccess?.();
    } catch (err) {
      console.warn('In-feed text submission failed:', err);
      Alert.alert('Fehler', 'Text konnte nicht gesendet werden.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGpsCheckIn = async () => {
    setIsSubmitting(true);
    try {
      await completeMission(missionId, { action: 'checkin' });
      onSuccess?.();
    } catch (err) {
      console.warn('In-feed GPS check-in failed:', err);
      Alert.alert('Fehler', 'Check-In fehlgeschlagen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.inputWindow, compact && styles.compactInputWindow]}>
      {renderReference()}

      <View style={styles.interactionArea}>
        {kind === 'quiz' && (
          <View style={styles.chatFlowInfo}>
            <Text style={styles.chatFlowText}>Quiz läuft im Chat...</Text>
          </View>
        )}

        {kind === 'text' && (
          <View style={styles.textRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Deine Antwort..."
              placeholderTextColor={theme.colors.cardTextMuted}
              value={textInput}
              onChangeText={setTextInput}
              multiline
              editable={!isSubmitting}
            />
            <Pressable
              disabled={isSubmitting || !textInput.trim()}
              style={({ pressed }) => [
                styles.sendButton,
                (pressed || isSubmitting || !textInput.trim()) && styles.actionButtonPressed
              ]}
              onPress={handleTextSubmit}
            >
              {isSubmitting ? (
                <ActivityIndicator color={styles.actionButtonText.color} size="small" />
              ) : (
                <Text style={styles.actionButtonText}>SENDEN</Text>
              )}
            </Pressable>
          </View>
        )}

        {kind === 'gps' && gpsConfig && (
          <GpsRunner
            embedded
            compact
            missionId={missionId}
            target={gpsConfig}
            onComplete={async () => {
              await completeMission(missionId, { action: 'checkin' });
              return { earned: 0 };
            }}
          />
        )}

        {kind === 'gps' && !gpsConfig && (
          <Pressable
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.actionButtonPressed,
              isSubmitting && styles.actionButtonDisabled
            ]}
            onPress={handleGpsCheckIn}
          >
            {isSubmitting ? (
              <ActivityIndicator color={styles.actionButtonText.color} size="small" />
            ) : (
              <Text style={styles.actionButtonText}>EINCHECKEN (Legacy)</Text>
            )}
          </Pressable>
        )}

        {kind === 'photo' && (
          <View style={styles.photoRow}>
            <Pressable
              disabled={isSubmitting}
              style={[styles.actionButton, styles.rowButton]}
              onPress={() => Alert.alert('Kamera', 'Funktion folgt...')}
            >
              <Text style={styles.actionButtonText}>KAMERA</Text>
            </Pressable>
            <Pressable
              disabled={isSubmitting}
              style={[styles.actionButton, styles.rowButton]}
              onPress={() => Alert.alert('Galerie', 'Funktion folgt...')}
            >
              <Text style={styles.actionButtonText}>GALERIE</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inputWindow: {
    backgroundColor: '#F7F6F0',
    borderRadius: 24,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  compactInputWindow: {
    padding: 0,
    gap: 8,
    borderWidth: 0,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  reference: {} as ViewStyle,
  interactionArea: {
    gap: 8,
  },
  textRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 12,
    padding: 12,
    minHeight: 44,
    maxHeight: 120,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 15,
    color: theme.colors.cardTextPrimary,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  photoRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    backgroundColor: '#F77740',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowButton: {
    flex: 1,
  },
  sendButton: {
    backgroundColor: '#F77740',
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionButtonDisabled: {
    opacity: 0.5,
    backgroundColor: theme.colors.disabledSurface,
  },
  actionButtonText: {
    color: '#111827',
    fontFamily: 'Nunito_700Bold',
    fontSize: 14,
  },
  chatFlowInfo: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 12,
  },
  chatFlowText: {
    fontFamily: 'NunitoSans_600SemiBold',
    fontSize: 14,
    color: '#666',
  },
});
