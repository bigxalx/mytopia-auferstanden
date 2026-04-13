import React from 'react';
import { StyleSheet, View, Text, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/shared/ui/theme';

export interface MissionResultViewProps {
  missionId: string;
  missionTitle: string;
  kind: string;
  payload: any;
  earnedPoints?: number;
}

/**
 * A centered, stem-less card for mission completion notices.
 * Combines score/status and points into a single "fancy" presentation.
 */
export function MissionResultView({
  missionId,
  missionTitle,
  kind,
  payload,
  earnedPoints,
}: MissionResultViewProps) {
  let resultSummary = '';
  if (kind === 'quiz' && payload?.total > 0) {
    resultSummary = `${payload.correct} / ${payload.total} richtig beantwortet`;
  } else if (kind === 'gps') {
    resultSummary = 'Standort bestaetigt';
  } else {
    resultSummary = 'Mission abgeschlossen';
  }

  return (
    <View style={styles.card}>
      <View style={styles.badgeRow}>
        <Ionicons name="checkmark-circle" size={20} color={theme.colors.successText} />
        <Text style={styles.badgeText}>MISSION ERLEDIGT</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{missionTitle || missionId}</Text>
        <View style={styles.resultBadge}>
          <Text style={styles.resultText}>{resultSummary}</Text>
        </View>

        {typeof earnedPoints === 'number' && (
          <View style={styles.pointsContainer}>
            <Text style={styles.pointsValue}>+{earnedPoints}</Text>
            <Text style={styles.pointsLabel}>Punkte erhalten</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 18,
    paddingVertical: 16,
    minWidth: 220,
    maxWidth: 300,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  } as ViewStyle,
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  } as ViewStyle,
  content: {
    alignItems: 'center',
    gap: 12,
  } as ViewStyle,
  badgeText: {
    fontSize: 10,
    fontFamily: 'NunitoSans_800ExtraBold',
    color: theme.colors.successText,
    letterSpacing: 1,
  } as TextStyle,
  title: {
    fontSize: 15,
    fontFamily: 'NunitoSans_700Bold',
    color: '#111827',
    textAlign: 'center',
  } as TextStyle,
  resultBadge: {
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  } as ViewStyle,
  resultText: {
    fontSize: 12,
    fontFamily: 'NunitoSans_700Bold',
    color: '#6b7280',
    letterSpacing: 0.2,
    textAlign: 'center',
  } as TextStyle,
  pointsContainer: {
    alignItems: 'center',
  } as ViewStyle,
  pointsValue: {
    fontSize: 32,
    fontFamily: 'NunitoSans_800ExtraBold',
    color: theme.colors.orange,
    lineHeight: 36,
  } as TextStyle,
  pointsLabel: {
    fontSize: 10,
    fontFamily: 'NunitoSans_700Bold',
    color: '#9ca3af',
    letterSpacing: 0.5,
  } as TextStyle,
});
