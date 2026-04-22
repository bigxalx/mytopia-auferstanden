import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { theme } from '@/src/shared/ui/theme';
import { Ionicons, Feather } from '@expo/vector-icons';
import { AppImage } from '@/src/shared/ui/AppImage';
import { type MissionKind } from '@/src/features/tasks/data/missionRepository';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';
import { resolveRetryLocalPhotoUri } from '@/src/features/tasks/data/photoMissionUpload';

export type SubmissionStatus = 'sending' | 'pending' | 'approved' | 'rejected' | 'error';

/**
 * A unified look for mission submissions ("sent" messages).
 * Structure:
 * 1. Unified header with mission info (Tappable to jump to mission)
 * 2. User's specific answer (text, photo, quiz result, or GPS pin)
 * 3. Status indicator
 */
export function SubmissionAttachmentView({
  submissionId,
  status,
  kind,
  payload,
  missionTitle,
  missionId,
  messageText,
}: {
  submissionId: string;
  status: SubmissionStatus;
  kind: MissionKind;
  payload: any;
  missionTitle: string;
  missionId?: string;
  messageText?: string;
}) {
  const effectiveText = payload?.text || messageText;
  const isCompact = kind === 'text' || kind === 'quiz';
  const isMediaLike = kind === 'photo' || kind === 'gps';
  const photoUri = kind === 'photo' ? resolveRenderablePhotoUri(payload) : null;
  const errorDetails = status === 'error' ? resolveErrorDetails(payload) : null;
  const canRetry = kind === 'photo' && Boolean(missionId) && Boolean(resolveRetryLocalPhotoUri(payload));
  const { retryMissionSubmission } = useActiveMission();
  const [isErrorModalVisible, setIsErrorModalVisible] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    if (!missionId || !canRetry || isRetrying) {
      setIsErrorModalVisible(false);
      return;
    }

    setIsRetrying(true);
    try {
      await retryMissionSubmission({
        kind,
        missionId,
        missionTitle,
        payload,
        submissionId,
      });
      setIsErrorModalVisible(false);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <>
      <View
        style={[
          styles.container,
          isCompact ? styles.containerCompact : null,
          isMediaLike ? styles.containerMedia : null,
        ]}
      >
        <View
          style={[
            styles.answerArea,
            isCompact ? styles.answerAreaCompact : null,
            isMediaLike ? styles.answerAreaMedia : null,
          ]}
        >
          {kind === 'text' && (
            <View style={[styles.textAnswerBox, styles.compactBlock]}>
              <Text style={styles.answerText}>{effectiveText || ''}</Text>
            </View>
          )}

          {kind === 'photo' && photoUri && (
            <View style={styles.photoContainer}>
              <AppImage 
                uri={photoUri}
                style={styles.photo} 
                contentFit="cover" 
              />
            </View>
          )}

          {kind === 'quiz' && (
            <View style={[styles.quizBox, isCompact ? styles.compactBlock : null]}>
              {payload?.answerText ? (
                <View style={styles.quizAnswerRow}>
                  <Ionicons name="radio-button-on" size={14} color={theme.colors.cardTextSecondary} />
                  <Text style={styles.answerText}>{payload.answerText}</Text>
                </View>
              ) : (
                <View style={styles.quizSubmittedBox}>
                  <Ionicons name="checkmark-circle" size={18} color={theme.colors.successText} />
                  <Text style={styles.quizSubmittedText}>Antworten gesendet</Text>
                </View>
              )}
            </View>
          )}

          {kind === 'gps' && <GpsPinSection status={status} />}
        </View>

        <View style={[styles.footer, isCompact ? styles.footerCompact : null]}>
          <StatusIndicator
            status={status}
            payload={payload}
            onErrorPress={
              status === 'error' && errorDetails
                ? () => setIsErrorModalVisible(true)
                : undefined
            }
          />
        </View>
      </View>
      <Modal
        animationType="fade"
        onRequestClose={() => setIsErrorModalVisible(false)}
        transparent
        visible={isErrorModalVisible}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setIsErrorModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Fehlerdetails</Text>
            <Text style={styles.modalBody}>{errorDetails ?? 'Unbekannter Fehler.'}</Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setIsErrorModalVisible(false)}
                style={[styles.modalButton, styles.modalButtonSecondary]}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={!canRetry || isRetrying}
                onPress={() => {
                  void handleRetry();
                }}
                style={[
                  styles.modalButton,
                  styles.modalButtonPrimary,
                  (!canRetry || isRetrying) ? styles.modalButtonDisabled : null,
                ]}
              >
                <Text style={styles.modalButtonPrimaryText}>
                  {isRetrying ? 'Retry...' : 'Retry'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}


function GpsPinSection({ status }: { status: SubmissionStatus }) {
  const isDone = status === 'approved';
  const isError = status === 'error';
  
  return (
    <View style={styles.gpsPinContainer}>
      <View style={[
        styles.gpsPinCircle, 
        isDone && { backgroundColor: theme.colors.successText },
        isError && { backgroundColor: theme.colors.destructiveText }
      ]}>
        <Ionicons name={isError ? "alert" : "location"} size={20} color="white" />
      </View>
      <View>
        <Text style={styles.gpsPinMain}>Standort {isDone ? 'bestätigt' : isError ? 'Fehler' : 'In Prüfung'}</Text>
        <Text style={styles.gpsPinSub}>{isDone ? 'Erfolgreich eingereicht' : 'GPS-Check an diesem Ort'}</Text>
      </View>
    </View>
  );
}

function StatusIndicator({
  status,
  payload,
  onErrorPress,
}: {
  status: SubmissionStatus;
  payload?: any;
  onErrorPress?: () => void;
}) {
  switch (status) {
    case 'sending':
      return (
        <View style={styles.statusRow}>
          <Text style={styles.statusText}>
            {typeof payload?.uploadProgress === 'number'
              ? `Sende... ${payload.uploadProgress}%`
              : 'Sende...'}
          </Text>
          <ActivityIndicator size="small" color="#666" style={{ transform: [{ scale: 0.6 }] }} />
        </View>
      );
    case 'pending':
      return (
        <View style={styles.statusRow}>
          <Text style={styles.statusText}>In Prüfung</Text>
          <Feather name="clock" size={12} color="#666" />
        </View>
      );
    case 'approved':
      return (
        <View style={styles.statusRow}>
          <Text style={[styles.statusText, { color: theme.colors.successText }]}>Erfolgreich</Text>
          <Ionicons name="checkmark-done" size={14} color={theme.colors.successText} />
        </View>
      );
    case 'rejected':
      return (
        <View style={styles.statusRow}>
          <Text style={[styles.statusText, { color: theme.colors.destructiveText }]}>Gescheitert</Text>
          <Ionicons name="close-circle" size={14} color={theme.colors.destructiveText} />
        </View>
      );
    case 'error':
      return (
        <Pressable onPress={onErrorPress} style={styles.statusRow}>
          <Text style={[styles.statusText, styles.statusTextError]}>Fehler</Text>
          <Ionicons name="alert-circle" size={14} color={theme.colors.destructiveText} />
        </Pressable>
      );
    default:
      return null;
  }
}

function resolveRenderablePhotoUri(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const rawPayload = payload as { photoPath?: unknown; photoUrl?: unknown };
  const candidate =
    typeof rawPayload.photoUrl === 'string'
      ? rawPayload.photoUrl
      : typeof rawPayload.photoPath === 'string'
        ? rawPayload.photoPath
        : null;

  if (!candidate) {
    return null;
  }

  return /^(?:(?:file|content|assets-library|ph):\/\/|https?:\/\/|data:)/i.test(candidate)
    ? candidate
    : null;
}

function resolveErrorMessage(payload: unknown) {
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload.trim();
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const errorMessage = (payload as { errorMessage?: unknown }).errorMessage;
    if (typeof errorMessage === 'string' && errorMessage.trim().length > 0) {
      return errorMessage.trim();
    }
  }

  return 'Unbekannt';
}

function resolveErrorDetails(payload: unknown) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const errorDetails = (payload as { errorDetails?: unknown }).errorDetails;
    if (typeof errorDetails === 'string' && errorDetails.trim().length > 0) {
      return errorDetails.trim();
    }
  }

  return resolveErrorMessage(payload);
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  } as ViewStyle,
  containerCompact: {
    flexShrink: 1,
    minWidth: 0,
  } as ViewStyle,
  containerMedia: {
    alignSelf: 'stretch',
    width: '100%',
  } as ViewStyle,
  answerArea: {
    paddingVertical: 2,
    gap: 8,
  } as ViewStyle,
  answerAreaMedia: {
    width: '100%',
  } as ViewStyle,
  answerAreaCompact: {
    alignSelf: 'flex-start',
    minWidth: 0,
  } as ViewStyle,
  compactBlock: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  } as ViewStyle,
  textAnswerBox: {
    paddingVertical: 2,
  } as ViewStyle,
  answerText: {
    fontSize: 14,
    fontFamily: 'NunitoSans_400Regular',
    color: '#1f2937',
    lineHeight: 20,
  } as TextStyle,
  photoContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.05)',
    width: '100%',
  } as ViewStyle,
  photo: {
    width: '100%',
    height: 220,
  } as ImageStyle,
  quizBox: {
    gap: 8,
  } as ViewStyle,
  quizAnswerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  } as ViewStyle,
  quizResultBox: {
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 12,
  } as ViewStyle,
  quizSubmittedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  } as ViewStyle,
  quizScore: {
    fontSize: 28,
    fontFamily: 'NunitoSans_800ExtraBold',
    color: '#111827',
  } as TextStyle,
  quizSub: {
    fontSize: 10,
    fontFamily: 'NunitoSans_700Bold',
    color: '#4b5563',
    letterSpacing: 0.5,
  } as TextStyle,
  quizSubmittedText: {
    fontSize: 14,
    fontFamily: 'NunitoSans_700Bold',
    color: '#111827',
  } as TextStyle,
  gpsPinContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  } as ViewStyle,
  gpsPinCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  gpsPinMain: {
    fontSize: 14,
    fontFamily: 'NunitoSans_700Bold',
    color: '#111827',
  } as TextStyle,
  gpsPinSub: {
    fontSize: 11,
    color: '#6b7280',
    fontFamily: 'NunitoSans_400Regular',
  } as TextStyle,
  noteBox: {
    marginVertical: 8,
    backgroundColor: 'rgba(249, 115, 22, 0.08)',
    padding: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.orange,
  } as ViewStyle,
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  } as ViewStyle,
  noteLabel: {
    fontSize: 8,
    fontFamily: 'NunitoSans_800ExtraBold',
    color: theme.colors.orange,
    letterSpacing: 0.5,
  } as TextStyle,
  noteText: {
    fontSize: 12,
    color: '#4b5563',
    fontStyle: 'italic',
    lineHeight: 16,
  } as TextStyle,
  footer: {
    marginTop: 8,
    paddingBottom: 2,
    alignItems: 'flex-end',
    width: '100%',
  } as ViewStyle,
  footerCompact: {
    alignSelf: 'flex-start',
  } as ViewStyle,
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  } as ViewStyle,
  statusText: {
    fontSize: 10,
    fontFamily: 'NunitoSans_700Bold',
    color: '#6b7280',
  } as TextStyle,
  statusTextError: {
    color: theme.colors.destructiveText,
  } as TextStyle,
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  } as ViewStyle,
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    padding: 18,
    gap: 14,
  } as ViewStyle,
  modalTitle: {
    color: '#111827',
    fontSize: 17,
    fontFamily: 'NunitoSans_700Bold',
  } as TextStyle,
  modalBody: {
    color: '#374151',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'NunitoSans_400Regular',
  } as TextStyle,
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  } as ViewStyle,
  modalButton: {
    borderRadius: 10,
    minWidth: 92,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  modalButtonPrimary: {
    backgroundColor: theme.colors.orange,
  } as ViewStyle,
  modalButtonSecondary: {
    backgroundColor: '#f3f4f6',
  } as ViewStyle,
  modalButtonPrimaryText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: 'NunitoSans_700Bold',
  } as TextStyle,
  modalButtonSecondaryText: {
    color: '#111827',
    fontSize: 13,
    fontFamily: 'NunitoSans_700Bold',
  } as TextStyle,
  modalButtonDisabled: {
    opacity: 0.45,
  } as ViewStyle,
});
