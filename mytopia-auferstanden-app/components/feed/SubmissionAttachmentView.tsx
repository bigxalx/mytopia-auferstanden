import React from 'react';
import { StyleSheet, View, Text, ActivityIndicator, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { theme } from '@/src/shared/ui/theme';
import { Ionicons, Feather } from '@expo/vector-icons';
import { AppImage } from '@/src/shared/ui/AppImage';
import { MISSION_KIND_METADATA, type MissionKind } from '@/src/features/tasks/data/missionRepository';

export type SubmissionStatus = 'sending' | 'pending' | 'approved' | 'rejected' | 'error';

/**
 * A unified look for mission submissions ("sent" messages).
 * Structure:
 * 1. Unified header with mission info
 * 2. User's specific answer (text, photo, quiz result, or GPS pin)
 * 3. Status indicator
 */
export function SubmissionAttachmentView({
  submissionId,
  status,
  kind,
  payload,
  missionTitle,
  moderatorNote,
  messageText,
}: {
  submissionId: string;
  status: SubmissionStatus;
  kind: MissionKind;
  payload: any;
  missionTitle: string;
  moderatorNote?: string;
  messageText?: string;
}) {
  const meta = MISSION_KIND_METADATA[kind] || { emoji: '🎯', label: 'Mission' };
  const effectiveText = payload?.text || messageText;

  return (
    <View style={styles.container}>
      {/* 1. Unified Header (The referenced mission) */}
      <View style={styles.header}>
        <View style={styles.headerIndicator} />
        <View style={styles.headerContent}>
          <View style={styles.row}>
            <Text style={styles.missionEmoji}>{meta.emoji}</Text>
            <View>
              <Text style={styles.missionLabel}>{meta.label.toUpperCase()}</Text>
              <Text style={styles.missionTitle} numberOfLines={1}>
                {missionTitle}
              </Text>
            </View>
          </View>
        </View>
      </View>

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
        <Text style={styles.gpsPinMain}>Standort {isDone ? 'bestätigt' : isError ? 'Fehler' : 'wird geprüft'}</Text>
        <Text style={styles.gpsPinSub}>{isDone ? 'Check-in erfolgreich' : 'GPS-Pin gesetzt'}</Text>
      </View>
    </View>
  );
}

function StatusIndicator({ status, payload }: { status: SubmissionStatus; payload?: any }) {
  switch (status) {
    case 'sending':
      return (
        <View style={styles.statusRow}>
          <Text style={styles.statusText}>Übermittlung...</Text>
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
          <Text style={[styles.statusText, { color: theme.colors.successText }]}>Bestätigt</Text>
          <Ionicons name="checkmark-done" size={14} color={theme.colors.successText} />
        </View>
      );
    case 'rejected':
      return (
        <View style={styles.statusRow}>
          <Text style={[styles.statusText, { color: theme.colors.destructiveText }]}>Abgelehnt</Text>
          <Ionicons name="close-circle" size={14} color={theme.colors.destructiveText} />
        </View>
      );
    case 'error':
      return (
        <View style={styles.statusRow}>
          <Text style={[styles.statusText, { color: theme.colors.destructiveText }]}>
            {typeof payload === 'string' ? payload : 'Fehler'}
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    overflow: 'hidden',
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    padding: 8,
    gap: 8,
  } as ViewStyle,
  headerIndicator: {
    width: 3,
    backgroundColor: theme.colors.orange,
    borderRadius: 2,
  } as ViewStyle,
  headerContent: {
    flex: 1,
    paddingRight: 8,
  } as ViewStyle,
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  missionEmoji: {
    fontSize: 20,
  } as TextStyle,
  missionLabel: {
    fontSize: 9,
    fontFamily: 'NunitoSans_700Bold',
    color: '#4b5563',
    letterSpacing: 0.5,
  } as TextStyle,
  missionTitle: {
    fontSize: 13,
    fontFamily: 'NunitoSans_700Bold',
    color: '#111827',
  } as TextStyle,
  answerArea: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 8,
  } as ViewStyle,
  textAnswerBox: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    padding: 10,
    borderRadius: 12,
  } as ViewStyle,
  answerText: {
    fontSize: 14,
    fontFamily: 'NunitoSans_600SemiBold',
    color: '#1f2937',
    lineHeight: 18,
  } as TextStyle,
  photoContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  } as ViewStyle,
  photo: {
    width: '100%',
    height: 200,
  } as ImageStyle,
  quizBox: {
    gap: 8,
  } as ViewStyle,
  quizAnswerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    padding: 8,
    borderRadius: 8,
  } as ViewStyle,
  quizResultBox: {
    alignItems: 'center',
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 10,
  } as ViewStyle,
  quizScore: {
    fontSize: 24,
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
    backgroundColor: 'rgba(255,255,255,0.3)',
    padding: 10,
    borderRadius: 12,
  } as ViewStyle,
  gpsPinCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
    marginHorizontal: 12,
    marginBottom: 8,
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
    paddingHorizontal: 12,
    paddingBottom: 8,
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
