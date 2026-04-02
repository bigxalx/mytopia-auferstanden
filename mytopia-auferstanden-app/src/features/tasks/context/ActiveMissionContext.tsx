import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { fetchMissions, type MissionListItem } from '@/src/features/tasks/data/missionRepository';
import { useSession } from '@/src/core/session/SessionContext';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';

/**
 * Feature flag import - must match the value in app/(tabs)/_layout.tsx
 * TODO: Move to a shared config file if more feature flags are added
 */
const ENABLE_NATIVE_BOTTOM_ACCESSORY = true;

/**
 * Shared state for ActiveMissionBar to support dual-instance rendering
 * (regular + inline placements in native bottom accessory).
 * 
 * State MUST be lifted outside the bottom accessory component per Expo Router docs:
 * "You must store state outside the accessory component using props, context, or external state management.
 * Two instances of the bottom accessory component are rendered simultaneously (one for each placement)
 * and state is not shared between them."
 */

type ActiveMissionContextValue = {
  activeMission: MissionListItem | null;
  isLoading: boolean;
};

const ActiveMissionContext = createContext<ActiveMissionContextValue | null>(null);

export function ActiveMissionProvider({ children }: { children: React.ReactNode }) {
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
        console.warn('Failed to load missions for ActiveMissionContext:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [selectedMode]);

  const activeMission = useMemo(() => {
    const openMissions = missions.filter((mission) => {
      const isCompleted = completedMissions.includes(mission._id);
      const submissionState = submissionStates[mission._id];
      const isPending = !isCompleted && submissionState?.status === 'pending';
      const isRejected = !isCompleted && submissionState?.status === 'rejected';

      return !isCompleted && !isPending && !isRejected;
    });

    return openMissions[0] || null;
  }, [completedMissions, missions, submissionStates]);

  const value = useMemo(
    () => ({ activeMission, isLoading }),
    [activeMission, isLoading]
  );

  return (
    <ActiveMissionContext.Provider value={value}>
      {children}
    </ActiveMissionContext.Provider>
  );
}

export function useActiveMission() {
  const context = useContext(ActiveMissionContext);
  if (!context) {
    throw new Error('useActiveMission must be used within ActiveMissionProvider');
  }
  return context;
}

/**
 * Hook to check if the ActiveMissionBar is currently visible and what type it is.
 * Used by other components to adjust their UI accordingly.
 * 
 * Returns:
 * - isVisible: Whether the mission bar is currently shown
 * - isNative: Whether using native iOS bottom accessory (affects safe area automatically)
 *            or fallback floating bar (requires manual spacing adjustment)
 */
export function useActiveMissionBarVisible() {
  const { activeMission, isLoading } = useActiveMission();
  const isVisible = !isLoading && activeMission !== null;
  const isNative = Platform.OS === 'ios' && getIOSMajorVersion() >= 26 && ENABLE_NATIVE_BOTTOM_ACCESSORY;
  
  return { isVisible, isNative };
}

function getIOSMajorVersion() {
  if (Platform.OS !== 'ios') {
    return 0;
  }

  const version = Platform.Version;
  if (typeof version === 'number') {
    return version;
  }

  const parsed = Number.parseInt(String(version), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}
