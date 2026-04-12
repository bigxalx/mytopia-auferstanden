import { StyleSheet, View, Text, ActivityIndicator, Pressable, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { theme } from '@/src/shared/ui/theme';
import { Ionicons, Feather } from '@expo/vector-icons';
import { AppImage } from '@/src/shared/ui/AppImage';
import { type MissionKind } from '@/src/features/tasks/data/missionRepository';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';

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
  moderatorNote,
  messageText,
}: {
  submissionId: string;
  status: SubmissionStatus;
  kind: MissionKind;
  payload: any;
  missionTitle: string;
  missionId?: string;
  moderatorNote?: string;
  messageText?: string;
}) {
  const { scrollToMessage } = useActiveMission();
  const effectiveText = payload?.text || messageText;

  const handlePressReference = () => {
    // Try scrolling by ID if we have it, otherwise fallback to Title
    scrollToMessage(missionId || missionTitle);
  };

  return (
    <View style={styles.container}>
      {/* 1. Unified Header (The referenced mission) */}
      <Pressable 
        style={({ pressed }) => [
          styles.header,
          pressed && { backgroundColor: 'rgba(0,0,0,0.1)' }
        ]} 
        onPress={handlePressReference}
      >
        <View style={styles.headerIndicator} />
        <View style={styles.headerContent}>
          <Text style={styles.missionTitle} numberOfLines={1}>
            {missionTitle}
          </Text>
        </View>
      </Pressable>

      {/* 2. Answer Content Area */}
      <View style={styles.answerArea}>
        {/* Text Answer */}
        {kind === 'text' && (
          <View style={styles.textAnswerBox}>
            <Text style={styles.answerText}>{effectiveText || ''}</Text>
          </View>
        )}

        {/* Photo Answer */}
        {kind === 'photo' && (typeof payload === 'string' || payload?.photoUrl || payload?.photoPath) && (
          <View style={styles.photoContainer}>
            <AppImage 
              uri={typeof payload === 'string' ? payload : (payload.photoUrl || payload.photoPath)} 
              style={styles.photo} 
              contentFit="cover" 
            />
          </View>
        )}

        {/* Quiz Answer or Result */}
        {kind === 'quiz' && (
          <View style={styles.quizBox}>
            {payload?.answerText ? (
              <View style={styles.quizAnswerRow}>
                <Ionicons name="radio-button-on" size={14} color={theme.colors.cardTextSecondary} />
                <Text style={styles.answerText}>{payload.answerText}</Text>
              </View>
            ) : (
              <View style={styles.quizResultBox}>
                <Text style={styles.quizScore}>
                  {payload?.correctCount ?? payload?.correct ?? '?'} / {payload?.totalCount ?? payload?.total ?? '?'}
                </Text>
                <Text style={styles.quizSub}>RICHTIG BEANTWORTET</Text>
              </View>
            )}
          </View>
        )}

        {/* GPS Answer */}
        {kind === 'gps' && <GpsPinSection status={status} />}
      </View>

      {/* Feedback Note (if any) */}
      {moderatorNote && (
        <View style={styles.noteBox}>
          <View style={styles.noteHeader}>
            <Feather name="message-circle" size={10} color={theme.colors.orange} />
            <Text style={styles.noteLabel}>FEEDBACK VOM MODERATOR</Text>
          </View>
          <Text style={styles.noteText}>{moderatorNote}</Text>
        </View>
      )}

      {/* 3. Status Footer */}
      <View style={styles.footer}>
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
          <Text style={styles.statusText}>Sende...</Text>
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
    minWidth: 220,
    alignSelf: 'stretch',
    borderRadius: 14,
    overflow: 'hidden',
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 14,
    padding: 6,
    gap: 8,
  } as ViewStyle,
  headerIndicator: {
    width: 3,
    backgroundColor: theme.colors.orange,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  } as ViewStyle,
  headerContent: {
    flex: 1,
    paddingRight: 4,
    justifyContent: 'center',
  } as ViewStyle,
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  missionTitle: {
    fontSize: 12,
    fontFamily: 'NunitoSans_700Bold',
    color: 'rgba(0,0,0,0.6)',
  } as TextStyle,
  answerArea: {
    paddingVertical: 2,
    gap: 8,
  } as ViewStyle,
  textAnswerBox: {
    // Background removed as requested
  } as ViewStyle,
  answerText: {
    fontSize: 16,
    fontFamily: 'NunitoSans_400Regular',
    color: '#1f2937',
    lineHeight: 22,
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
    paddingBottom: 2,
    alignItems: 'flex-end',
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
