import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMissions, type MissionListItem } from '@/src/features/tasks/data/missionRepository';
import { useSession } from '@/src/core/session/SessionContext';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';

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
