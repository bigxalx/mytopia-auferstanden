import { StyleSheet, View, Text, ActivityIndicator, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { theme } from '@/src/shared/ui/theme';
import { Ionicons, Feather } from '@expo/vector-icons';
import { AppImage } from '@/src/shared/ui/AppImage';
import { type MissionKind } from '@/src/features/tasks/data/missionRepository';

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

  return (
    <View
      style={[
        styles.container,
        isCompact ? styles.containerCompact : null,
        isMediaLike ? styles.containerMedia : null,
      ]}
    >
      <View style={[styles.answerArea, isCompact ? styles.answerAreaCompact : null]}>
        {kind === 'text' && (
          <View style={[styles.textAnswerBox, styles.compactBlock]}>
            <Text style={styles.answerText}>{effectiveText || ''}</Text>
          </View>
        )}

        {kind === 'photo' && (typeof payload === 'string' || payload?.photoUrl || payload?.photoPath) && (
          <View style={styles.photoContainer}>
            <AppImage 
              uri={typeof payload === 'string' ? payload : (payload.photoUrl || payload.photoPath)} 
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
        <StatusIndicator status={status} payload={payload} />
      </View>
    </View>
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

function StatusIndicator({ status, payload }: { status: SubmissionStatus; payload?: any }) {
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
        <View style={styles.statusRow}>
          <Text style={[styles.statusText, { color: theme.colors.destructiveText }]}>
            Fehler: {typeof payload === 'string' ? payload : 'Unbekannt'}
          </Text>
          <Ionicons name="alert-circle" size={14} color={theme.colors.destructiveText} />
        </View>
      );
    default:
      return null;
  }
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
  } as ViewStyle,
  answerArea: {
    paddingVertical: 2,
    gap: 8,
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
});
