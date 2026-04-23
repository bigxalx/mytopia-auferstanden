import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { ProfileMissionOverviewItem } from '@/src/features/tasks/data/useProfileMissionData';
import { theme } from '@/src/shared/ui/theme';

type ProgressCardProps = {
  missions: ProfileMissionOverviewItem[];
  streakCount: number;
  streakThreshold: number;
};

const CARD_PADDING = 20;
const CONTENT_HORIZONTAL_PADDING = 20;
const TOP_CARD_GAP = 12;
const CARD_CONTENT_GAP = 6;
const TITLE_HEIGHT = 23;
const MAX_RING_SIZE = 78;
const MIN_RING_SIZE = 44;
const MAX_INDICATOR_SIZE = 22;
const MIN_INDICATOR_SIZE = 16;
const MAX_INDICATOR_COUNT = 6;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ProgressCard({ missions, streakCount, streakThreshold }: ProgressCardProps) {
  const { width } = useWindowDimensions();
  const safeThreshold = Math.max(1, streakThreshold);
  const isActive = streakCount >= safeThreshold;
  const completedSteps = Math.min(streakCount, safeThreshold);
  const progress = Math.min(1, streakCount / safeThreshold);
  const resolvedMissions = missions
    .filter((item) => item.status === 'completed' || item.status === 'rejected' || item.status === 'expired')
    .slice(-safeThreshold);
  const indicatorMissions = resolvedMissions.slice(-MAX_INDICATOR_COUNT);
  const indicatorCount = indicatorMissions.length;
  const cardSize = (width - CONTENT_HORIZONTAL_PADDING * 2 - TOP_CARD_GAP) / 2;
  const innerSize = Math.max(0, cardSize - CARD_PADDING * 2);
  const indicatorGap = indicatorCount > 4 ? 4 : 6;
  const indicatorSize = indicatorCount > 0
    ? clamp(
      Math.floor((innerSize - indicatorGap * Math.max(0, indicatorCount - 1)) / indicatorCount),
      MIN_INDICATOR_SIZE,
      MAX_INDICATOR_SIZE
    )
    : 0;
  const ringSize = clamp(
    Math.floor(innerSize - TITLE_HEIGHT - indicatorSize - CARD_CONTENT_GAP * 3),
    MIN_RING_SIZE,
    MAX_RING_SIZE
  );
  const ringStroke = clamp(Math.round(ringSize * 0.12), 5, 9);
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = ringCircumference * (1 - progress);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Streak</Text>
      <View style={[styles.ringWrap, { height: ringSize, width: ringSize }]}>
        <Svg height={ringSize} width={ringSize}>
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            fill="none"
            r={ringRadius}
            stroke={isActive ? theme.colors.orangeAlpha : theme.colors.cardBorder}
            strokeWidth={ringStroke}
          />
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            fill="none"
            r={ringRadius}
            stroke={isActive ? theme.colors.orange : theme.colors.successText}
            strokeDasharray={`${ringCircumference} ${ringCircumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            strokeWidth={ringStroke}
            transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
          />
        </Svg>
        <View style={styles.ringContent}>
          {isActive ? (
            <MaterialIcons color={theme.colors.orange} name="local-fire-department" size={Math.max(14, ringSize * 0.22)} />
          ) : null}
          <Text style={[styles.ringText, isActive ? styles.ringTextActive : null]}>
            {completedSteps}/{safeThreshold}
          </Text>
        </View>
      </View>
      {indicatorCount > 0 ? (
        <View style={[styles.indicatorRow, { gap: indicatorGap }]}>
          {indicatorMissions.map((item) => {
            const indicatorStyle = {
              height: indicatorSize,
              width: indicatorSize,
            };

            const isDone = item.status === 'completed';
            return (
              <Link asChild href={`/(modals)/tasks/${item.mission._id}`} key={item.mission._id}>
                <Pressable
                  accessibilityLabel={`${item.mission.title}, ${isDone ? 'erfolgreich' : 'fehlgeschlagen'}`}
                  style={({ pressed }) => [
                    styles.indicator,
                    indicatorStyle,
                    pressed ? styles.dotPressed : null,
                  ]}
                >
                  <MaterialIcons
                    color={isDone ? theme.colors.successText : theme.colors.destructiveText}
                    name={isDone ? 'check' : 'close'}
                    size={Math.max(14, indicatorSize - 4)}
                  />
                </Pressable>
              </Link>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: theme.colors.beige,
    borderRadius: 20,
    aspectRatio: 1,
    flex: 1,
    gap: CARD_CONTENT_GAP,
    justifyContent: 'space-between',
    padding: CARD_PADDING,
  },
  cardTitle: {
    ...theme.typography.h1,
    color: theme.colors.cardTextHeading,
    fontSize: 18,
    marginBottom: 0,
    textTransform: 'uppercase',
    width: '100%',
  },
  indicator: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotPressed: {
    opacity: 0.7,
  },
  indicatorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  ringContent: {
    alignItems: 'center',
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    gap: 1,
  },
  ringText: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'Nunito_700Bold',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  ringTextActive: {
    color: theme.colors.orange,
  },
  ringWrap: {
    flexShrink: 1,
  },
});
