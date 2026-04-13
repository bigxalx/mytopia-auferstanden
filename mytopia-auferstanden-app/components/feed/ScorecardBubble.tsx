import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming 
} from 'react-native-reanimated';
import { theme } from '@/src/shared/ui/theme';
import { Ionicons } from '@expo/vector-icons';

/**
 * A premium results card displayed in the feed after a quiz is completed.
 */
export function ScorecardBubble({ correct, total }: { correct: number; total: number }) {
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12 });
    opacity.value = withTiming(1, { duration: 400 });
  }, [opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const percentage = Math.max(0, Math.min(100, Math.round((correct / total) * 100)));
  const isPerfect = correct === total && total > 0;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.header}>
        <Ionicons name={isPerfect ? "trophy" : "medal"} size={18} color={theme.colors.orange} />
        <Text style={styles.headerText}>MISSION ABGESCHLOSSEN</Text>
      </View>
      
      <View style={styles.main}>
        <View style={styles.scoreGroup}>
          <Text style={styles.score}>{correct}</Text>
          <Text style={styles.scoreDivider}>/</Text>
          <Text style={styles.scoreTotal}>{total}</Text>
        </View>
        <Text style={styles.scoreLabel}>RICHTIGE ANTWORTEN</Text>
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${percentage}%` }]} />
        </View>
        <View style={styles.progressLabels}>
           <Text style={styles.progressPct}>{percentage}% Erfolgsrate</Text>
        </View>
      </View>

      {isPerfect && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PERFEKT!</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    minWidth: 240,
    marginVertical: 4,
    position: 'relative',
    overflow: 'visible',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  headerText: {
    fontSize: 10,
    fontFamily: 'NunitoSans_800ExtraBold',
    color: theme.colors.orange,
    letterSpacing: 1.2,
  },
  main: {
    alignItems: 'center',
    marginBottom: 20,
  },
  scoreGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  score: {
    fontSize: 48,
    fontFamily: 'NunitoSans_800ExtraBold',
    color: '#111827',
    lineHeight: 56,
  },
  scoreDivider: {
    fontSize: 28,
    fontFamily: 'NunitoSans_400Regular',
    color: '#d1d5db',
  },
  scoreTotal: {
    fontSize: 28,
    fontFamily: 'NunitoSans_700Bold',
    color: '#9ca3af',
  },
  scoreLabel: {
    fontSize: 10,
    fontFamily: 'NunitoSans_700Bold',
    color: '#9ca3af',
    marginTop: -4,
    letterSpacing: 0.5,
  },
  progressSection: {
    gap: 8,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.orange,
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  progressPct: {
    fontSize: 11,
    fontFamily: 'NunitoSans_600SemiBold',
    color: '#6b7280',
  },
  badge: {
    position: 'absolute',
    top: -12,
    right: -10,
    backgroundColor: '#fbbf24',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    transform: [{ rotate: '12deg' }],
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'NunitoSans_800ExtraBold',
    color: '#92400e',
  },
});
