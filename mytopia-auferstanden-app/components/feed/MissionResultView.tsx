import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, Text, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/shared/ui/theme';

export interface MissionResultViewProps {
  missionId: string;
  missionTitle: string;
  kind: string;
  payload: any;
  earnedPoints?: number;
  animatePoints?: boolean;
  animationKey?: string | null;
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
  animatePoints = false,
  animationKey,
}: MissionResultViewProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const lastAnimatedKeyRef = useRef<string | null>(null);
  const [displayedPoints, setDisplayedPoints] = useState(0);

  const isRejected = payload?.status === 'rejected' || payload?.action === 'rejected';
  const normalizedStatus = payload?.status ?? 'success';
  const normalizedEarnedPoints =
    typeof earnedPoints === 'number'
      ? earnedPoints
      : isRejected
        ? 0
        : undefined;
  const isFailure =
    isRejected ||
    (kind === 'quiz' && typeof normalizedEarnedPoints === 'number' && normalizedEarnedPoints <= 0);
  const shouldAnimate =
    Boolean(animatePoints) &&
    typeof normalizedEarnedPoints === 'number' &&
    normalizedEarnedPoints > 0;

  useEffect(() => {
    if (typeof normalizedEarnedPoints !== 'number') {
      lastAnimatedKeyRef.current = null;
      opacity.stopAnimation();
      scale.stopAnimation();
      opacity.setValue(1);
      scale.setValue(1);
      setDisplayedPoints(0);
      return;
    }

    const nextAnimationKey = animationKey ?? `${missionId}:${normalizedEarnedPoints}:${normalizedStatus}`;
    const canAnimate = shouldAnimate && nextAnimationKey !== lastAnimatedKeyRef.current;

    opacity.stopAnimation();
    scale.stopAnimation();

    if (!canAnimate) {
      setDisplayedPoints(normalizedEarnedPoints);
      opacity.setValue(1);
      scale.setValue(1);
      return;
    }

    lastAnimatedKeyRef.current = nextAnimationKey;
    setDisplayedPoints(0);
    scale.setValue(0.9);
    opacity.setValue(0);

    Animated.parallel([
      Animated.timing(opacity, {
        duration: 260,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        damping: 11,
        mass: 0.8,
        stiffness: 180,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();

    let startTime: number | null = null;
    let animationFrameId: number | null = null;
    const duration = 2000;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const percentage = Math.min(progress / duration, 1);
      const eased = easeOutCubic(percentage);

      const currentValue = Math.round(eased * normalizedEarnedPoints);
      setDisplayedPoints(currentValue);

      if (progress < duration) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [animationKey, missionId, normalizedEarnedPoints, normalizedStatus, shouldAnimate, opacity, scale]);

  let resultSummary = '';
  if (isRejected) {
    resultSummary = 'Beitrag nicht bestätigt';
  } else if (kind === 'quiz' && payload?.total > 0) {
    resultSummary = `${payload.correct} / ${payload.total} richtig beantwortet`;
  } else if (kind === 'gps') {
    resultSummary = 'Standort bestaetigt';
  } else {
    resultSummary = 'Mission abgeschlossen';
  }

  return (
    <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
      <View style={styles.badgeRow}>
        <Ionicons
          name={isFailure ? 'close-circle' : 'checkmark-circle'}
          size={20}
          color={isFailure ? theme.colors.destructiveText : theme.colors.successText}
        />
        <Text style={[styles.badgeText, isFailure ? styles.badgeTextFailure : null]}>
          {isFailure ? 'MISSION BEENDET' : 'MISSION ERLEDIGT'}
        </Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{missionTitle || missionId}</Text>
        <View style={styles.resultBadge}>
          <Text style={styles.resultText}>{resultSummary}</Text>
        </View>

        {typeof normalizedEarnedPoints === 'number' && (
          <View style={styles.pointsContainer}>
            <View style={styles.pointsValueWrap}>
              {normalizedEarnedPoints > 0 ? <Text style={styles.pointsPrefix}>+</Text> : null}
              <Text style={styles.pointsValue}>{displayedPoints}</Text>
            </View>
            <Text style={styles.pointsLabel}>Punkte erhalten</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    width: '100%',
    paddingHorizontal: 18,
    paddingVertical: 16,
    minWidth: 220,
    maxWidth: 340,
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
  badgeTextFailure: {
    color: theme.colors.destructiveText,
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
  pointsValueWrap: {
    alignItems: 'baseline',
    flexDirection: 'row',
  } as ViewStyle,
  pointsPrefix: {
    color: theme.colors.orange,
    fontFamily: 'NunitoSans_800ExtraBold',
    fontSize: 32,
    lineHeight: 36,
    marginRight: 2,
  } as TextStyle,
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
