import React from 'react';
import { StyleSheet, View, Text, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { theme } from '@/src/shared/ui/theme';
import { Ionicons, Feather } from '@expo/vector-icons';
import { AppImage } from '@/src/shared/ui/AppImage';

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export function SubmissionAttachmentView({
  submissionId,
  status,
  kind,
  payload,
  missionTitle,
  moderatorNote,
}: {
  submissionId: string;
  status: SubmissionStatus;
  kind: 'gps' | 'quiz' | 'text' | 'photo';
  payload: any;
  missionTitle: string;
  moderatorNote?: string;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="flag-outline" size={12} color={theme.colors.cardTextSecondary} />
        <Text style={styles.headerTitle}>{missionTitle}</Text>
      </View>

      <View style={styles.content}>
        {kind === 'gps' && <GpsPreview />}
        {kind === 'photo' && (typeof payload === 'string' || payload?.photoUrl) && (
          <AppImage 
            uri={typeof payload === 'string' ? payload : payload.photoUrl} 
            style={styles.photo} 
            contentFit="cover" 
          />
        )}
        {kind === 'quiz' && (
          <View style={styles.quizBox}>
            <Text style={styles.quizScore}>
              {payload?.correctCount} / {payload?.totalCount} richtig
            </Text>
            <Text style={styles.quizSub}>Punkte erhalten!</Text>
          </View>
        )}
      </View>

      {moderatorNote && (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>Feedback:</Text>
          <Text style={styles.noteText}>{moderatorNote}</Text>
        </View>
      )}

      <View style={styles.footer}>
        <StatusIndicator status={status} />
      </View>
    </View>
  );
}

function GpsPreview() {
  return (
    <View style={styles.gpsBox}>
      <View style={styles.gpsIconCircle}>
        <Ionicons name="location" size={24} color="#fff" />
      </View>
      <View style={styles.gpsTextColumn}>
        <Text style={styles.gpsMainText}>Standort bestätigt</Text>
        <Text style={styles.gpsSubText}>Check-in erfolgreich</Text>
      </View>
    </View>
  );
}

function StatusIndicator({ status }: { status: SubmissionStatus }) {
  switch (status) {
    case 'pending':
      return (
        <View style={styles.statusRow}>
          <Text style={styles.statusText}>In Prüfung</Text>
          <Feather name="clock" size={14} color="#666" />
        </View>
      );
    case 'approved':
      return (
        <View style={styles.statusRow}>
          <Text style={[styles.statusText, { color: theme.colors.successText }]}>Bestätigt</Text>
          <Ionicons name="checkmark-done" size={16} color={theme.colors.successText} />
        </View>
      );
    case 'rejected':
      return (
        <View style={styles.statusRow}>
          <Text style={[styles.statusText, { color: theme.colors.destructiveText }]}>Abgelehnt</Text>
          <Ionicons name="close-circle" size={16} color={theme.colors.destructiveText} />
        </View>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: {
    minWidth: 200,
    gap: 8,
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    opacity: 0.7,
  } as ViewStyle,
  headerTitle: {
    fontSize: 11,
    fontFamily: 'NunitoSans_700Bold',
    color: theme.colors.cardTextSecondary,
    textTransform: 'uppercase',
  } as TextStyle,
  content: {
    borderRadius: 8,
    overflow: 'hidden',
  } as ViewStyle,
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  } as ImageStyle,
  gpsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  } as ViewStyle,
  gpsIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.blue,
      alignItems: 'center',
      justifyContent: 'center',
  } as ViewStyle,
  gpsTextColumn: {
      flex: 1,
  } as ViewStyle,
  gpsMainText: {
      fontSize: 14,
      fontFamily: 'NunitoSans_700Bold',
      color: '#1f2937',
  } as TextStyle,
  gpsSubText: {
      fontSize: 12,
      fontFamily: 'NunitoSans_400Regular',
      color: '#4b5563',
  } as TextStyle,
  quizBox: {
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 12,
    alignItems: 'center',
  } as ViewStyle,
  quizScore: {
    fontSize: 18,
    fontFamily: 'NunitoSans_700Bold',
    color: '#1f2937',
  } as TextStyle,
  quizSub: {
    fontSize: 12,
    color: '#4b5563',
  } as TextStyle,
  noteBox: {
    backgroundColor: 'rgba(255,0,0,0.05)',
    padding: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.destructiveText,
  } as ViewStyle,
  noteLabel: {
    fontSize: 10,
    fontFamily: 'NunitoSans_700Bold',
    color: theme.colors.destructiveText,
  } as TextStyle,
  noteText: {
    fontSize: 12,
    color: '#1f2937',
    fontStyle: 'italic',
  } as TextStyle,
  footer: {
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
    color: '#666',
  } as TextStyle,
});
