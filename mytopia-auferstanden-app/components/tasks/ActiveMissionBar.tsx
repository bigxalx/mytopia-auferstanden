import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { router } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/shared/ui/theme';

import { fetchMissions, type MissionListItem, MISSION_KIND_METADATA } from '@/src/features/tasks/data/missionRepository';
import { useSession } from '@/src/core/session/SessionContext';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';

/**
 * Hook to check if the ActiveMissionBar is currently visible.
 * Used by other components to adjust their UI accordingly.
 */
export function useActiveMissionBarVisible() {
  const { selectedMode, user } = useSession();
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const completedMissions = useCompletedMissions(user?.id);
  const submissionStates = useMissionSubmissionStates(user?.id);

  useEffect(() => {
    let active = true;
    async function load() {
      if (active) setIsLoading(true);
      try {
        const result = await fetchMissions({ mode: selectedMode });
        if (active) setMissions(result);
      } catch (err) {
        console.warn('Failed to load missions for useActiveMissionBarVisible:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [selectedMode]);

  const openMissions = useMemo(() => {
    return missions.filter((mission) => {
      const isCompleted = completedMissions.includes(mission._id);
      const submissionState = submissionStates[mission._id];
      const isPending = !isCompleted && submissionState?.status === 'pending';
      const isRejected = !isCompleted && submissionState?.status === 'rejected';

      return !isCompleted && !isPending && !isRejected;
    });
  }, [completedMissions, missions, submissionStates]);

  return !isLoading && openMissions.length > 0;
}

/**
 * Internal content component for the Mission Bar.
 * This is rendered inside either the Native BottomAccessory slots or the manual fallback.
 */
export type MissionBarPlacement = 'regular' | 'inline' | 'fallback';

function MissionBarContent({ 
  mission, 
  placement 
}: { 
  mission: MissionListItem,
  placement: MissionBarPlacement
}) {
  const isInline = placement === 'inline';
  const isFallback = placement === 'fallback';
  const kindMeta = MISSION_KIND_METADATA[mission.kind as keyof typeof MISSION_KIND_METADATA];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/(modals)/tasks/' + mission._id)}
      style={({ pressed }) => [
        styles.container,
        isInline && styles.inlineContainer,
        isFallback && styles.fallbackContainer,
        pressed && styles.containerPressed,
      ]}
    >
      {isFallback && <View style={styles.fallbackBackground} />}
      <View style={styles.textBlock}>
        <Text style={styles.missionTitle} numberOfLines={1}>
          {mission.title}
        </Text>
        <Text style={[styles.missionMeta, isInline && styles.missionMetaInline]} numberOfLines={1}>
          {kindMeta?.label || 'Mission'} · {mission.points} Punkte
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Safety wrapper for the usePlacement hook.
 * NativeTabs.BottomAccessory.usePlacement() throws an error if called outside the context,
 * which happens when we render the standalone fallback.
 */
function useSafePlacement() {
  try {
    return NativeTabs.BottomAccessory.usePlacement();
  } catch {
    return undefined;
  }
}

/**
 * The main component that coordinates between Native Accessory Slots and a manual Fallback.
 */
export function ActiveMissionBar({ standaloneFallback }: { standaloneFallback?: boolean }) {
  const { selectedMode, user } = useSession();
  const insets = useSafeAreaInsets();
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stableKey, setStableKey] = useState(() => Date.now());
  const completedMissions = useCompletedMissions(user?.id);
  const submissionStates = useMissionSubmissionStates(user?.id);

  const nativePlacement = useSafePlacement();
  const placement: MissionBarPlacement | undefined = nativePlacement || (standaloneFallback ? 'fallback' : undefined);

  useEffect(() => {
    let active = true;
    async function load() {
      if (active) {
        setIsLoading(true);
      }
      try {
        const result = await fetchMissions({ mode: selectedMode });
        if (active) {
          setMissions(result);
          setStableKey(Date.now());
        }
      } catch (err) {
        console.warn('Failed to load missions for ActiveMissionBar:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [selectedMode]);

  const openMissions = useMemo(() => {
    return missions.filter((mission) => {
      const isCompleted = completedMissions.includes(mission._id);
      const submissionState = submissionStates[mission._id];
      const isPending = !isCompleted && submissionState?.status === 'pending';
      const isRejected = !isCompleted && submissionState?.status === 'rejected';

      return !isCompleted && !isPending && !isRejected;
    });
  }, [completedMissions, missions, submissionStates]);

  if (!placement || isLoading || openMissions.length === 0) return null;
  const mission = openMissions[0];
  const fallbackBottomOffset = insets.bottom + (Platform.OS === 'android' ? 78 : 56);

  if (placement === 'fallback') {
    return (
      <View key={stableKey} style={[styles.manualFallbackWrapper, { bottom: fallbackBottomOffset }]} pointerEvents="box-none">
        <MissionBarContent mission={mission} placement="fallback" />
      </View>
    );
  }

  return <MissionBarContent key={stableKey} mission={mission} placement={placement} />;
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
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 8,
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
  inlineContainer: {
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  containerPressed: {
    opacity: 0.88,
  },
  fallbackBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.orange,
  },
  textBlock: {
    gap: 1,
    alignItems: 'center',
  },
  missionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontFamily: theme.typography.title.fontFamily,
    fontWeight: '700',
    textAlign: 'center',
  },
  missionMeta: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontFamily: theme.typography.h1.fontFamily,
    textAlign: 'center',
  },
  missionMetaInline: {
    fontSize: 11,
  },
});
