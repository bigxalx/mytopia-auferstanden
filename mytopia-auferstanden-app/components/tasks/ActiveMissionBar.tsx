import React from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { router } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { theme } from '@/src/shared/ui/theme';

import { type MissionListItem } from '@/src/features/tasks/data/missionRepository';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';

/**
 * Internal content component for the Mission Bar.
 * Handles both 'regular' and 'inline' placements for native bottom accessory.
 * 
 * This component is rendered TWICE simultaneously by NativeTabs.BottomAccessory:
 * - Once for 'regular' placement (full UI above tab bar)
 * - Once for 'inline' placement (compact UI inline with tab bar)
 * 
 * State is managed externally via ActiveMissionContext to ensure both instances
 * stay in sync.
 */
function MissionBarContent({
  mission,
  placement,
  transparent = true
}: {
  mission: MissionListItem,
  placement: 'regular' | 'inline',
  transparent?: boolean
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({
        pathname: '/(modals)/tasks/[taskId]',
        params: { taskId: mission._id },
      })}
      onPressIn={!transparent ? () => {
        scale.value = withSpring(0.985, { stiffness: 700, damping: 38, mass: 0.45 });
      } : undefined}
      onPressOut={!transparent ? () => {
        scale.value = withSpring(1, { stiffness: 700, damping: 38, mass: 0.45 });
      } : undefined}
      style={styles.pressable}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.container,
            !transparent && styles.fallbackContainer,
            !transparent && animatedStyle,
            // isInline && styles.inlineContainer,
            pressed && (transparent ? styles.containerPressed : styles.fallbackContainerPressed),
          ]}
        >
          <View style={styles.textBlock}>
            <Text style={[styles.missionTitle,
              // isInline && styles.missionTitleInline
            ]} numberOfLines={1}>
              {mission.title}
            </Text>
            <Text style={styles.missionMeta}>
              Aktuelle Mission
            </Text>
            {/* {!isInline && (
              <Text style={styles.missionMeta}>
                {kindMeta?.label || 'Mission'} · {mission.points} Punkte
              </Text>
            )} */}
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

/**
 * Native bottom accessory component for iOS 18+.
 * Consumes shared state from ActiveMissionContext.
 */
export function NativeActiveMissionBar() {
  const { activeMission, isLoading } = useActiveMission();
  const placement = NativeTabs.BottomAccessory.usePlacement();

  if (isLoading || !activeMission) return null;

  return <MissionBarContent mission={activeMission} placement={placement} />;
}

/**
 * Fallback bottom bar component for non-iOS or when native accessory is disabled.
 * Renders as a floating orange bar above the tab bar.
 */
export function FallbackActiveMissionBar() {
  const { activeMission, isLoading } = useActiveMission();
  const insets = useSafeAreaInsets();

  if (isLoading || !activeMission) return null;

  const fallbackBottomOffset = insets.bottom + (Platform.OS === 'android' ? 78 : 56);

  return (
    <View style={[styles.manualFallbackWrapper, { bottom: fallbackBottomOffset }]} pointerEvents="box-none">
      <MissionBarContent mission={activeMission} placement="regular" transparent={false} />
    </View>
  );
}

const styles = StyleSheet.create({

  manualFallbackWrapper: {
    position: 'absolute',
    left: 8,
    right: 8,
    zIndex: 99,
  },
  container: {
    justifyContent: 'center',
    // minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(249, 116, 22, 0.75)',
  },
  pressable: {
    width: '100%',
  },
  inlineContainer: {
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fallbackContainer: {
    minHeight: 60,
    borderRadius: 24,
    backgroundColor: theme.colors.orange,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
    alignItems: 'center',
  },
  containerPressed: {
    opacity: 0.88,
  },
  fallbackContainerPressed: {
    backgroundColor: '#fb923c',
  },
  fallbackBackground: {
    backgroundColor: theme.colors.orange,
  },
  textBlock: {
    alignItems: 'center',
  },
  missionTitle: {
    color: "black",
    fontSize: 15,
    fontFamily: theme.typography.title.fontFamily,
    fontWeight: '700',
  },
  missionTitleInline: {
    fontSize: 13,
  },
  missionMeta: {
    color: "#A33100",
    fontSize: 12,
    fontFamily: theme.typography.h1.fontFamily,
  },
  fallbackText: {
    color: 'rgba(255, 255, 255, 0.95)',
    textAlign: 'center',
  },
});
