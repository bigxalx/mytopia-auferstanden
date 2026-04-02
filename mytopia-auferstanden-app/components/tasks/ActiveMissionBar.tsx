import React from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { router } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/shared/ui/theme';

import { type MissionListItem, MISSION_KIND_METADATA } from '@/src/features/tasks/data/missionRepository';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';

/**
 * Hook to check if the ActiveMissionBar is currently visible.
 * Used by other components to adjust their UI accordingly.
 */
export function useActiveMissionBarVisible() {
  const { activeMission, isLoading } = useActiveMission();
  return !isLoading && activeMission !== null;
}

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
  placement
}: {
  mission: MissionListItem,
  placement: 'regular' | 'inline'
}) {
  const isInline = placement === 'inline';
  const kindMeta = MISSION_KIND_METADATA[mission.kind as keyof typeof MISSION_KIND_METADATA];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/(modals)/tasks/' + mission._id)}
      style={({ pressed }) => [
        styles.container,
        // isInline && styles.inlineContainer,
        pressed && styles.containerPressed,
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
          <Text style={styles.missionMeta} numberOfLines={1}>
            {kindMeta?.label || 'Mission'} · {mission.points} Punkte
          </Text>
        )} */}
      </View>
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

  const kindMeta = MISSION_KIND_METADATA[activeMission.kind as keyof typeof MISSION_KIND_METADATA];
  const fallbackBottomOffset = insets.bottom + (Platform.OS === 'android' ? 78 : 56);

  return (
    <View style={[styles.manualFallbackWrapper, { bottom: fallbackBottomOffset }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/(modals)/tasks/' + activeMission._id)}
        style={({ pressed }) => [
          styles.container,
          styles.fallbackContainer,
          pressed && styles.containerPressed,
        ]}
      >
        <View style={styles.fallbackBackground} />
        <View style={styles.textBlock}>
          <Text style={[styles.missionTitle, styles.fallbackText]} numberOfLines={1}>
            {activeMission.title}
          </Text>
          <Text style={[styles.missionMeta, styles.fallbackText]} numberOfLines={1}>
            {kindMeta?.label || 'Mission'} · {activeMission.points} Punkte
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({

  manualFallbackWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 99,
  },
  container: {
    justifyContent: 'center',
    // minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(249, 116, 22, 0.75)',
  },
  inlineContainer: {
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fallbackContainer: {
    minHeight: 60,
    borderRadius: 18,
    overflow: 'hidden',
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
  fallbackBackground: {
    ...StyleSheet.absoluteFillObject,
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
