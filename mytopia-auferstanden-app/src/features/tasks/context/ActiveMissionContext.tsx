import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { getCurrentFirebaseUser } from '@/src/core/firebase/authClient';
import { type AppMode } from '@/src/core/session/appMode';
import * as authUtils from '@react-native-firebase/auth';
import { 
  fetchMissions, 
  getCachedMissions, 
  type MissionListItem, 
  submitGpsCompletion, 
  submitPhotoMission, 
  submitQuizCompletion, 
  submitTextMission 
} from '@/src/features/tasks/data/missionRepository';
import { type NarrativeBundleDto } from '@/src/features/feed/data/narrativeFeedClient';
import { useSession } from '@/src/core/session/SessionContext';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';
import { getMissionLifecycleStatus } from '@/src/features/tasks/data/missionStatus';

import { FEATURES } from '@/src/config/features';

const FOCUS_STORAGE_KEY = 'mytopia_focused_mission_id';

/**
 * Shared state for ActiveMissionBar to support dual-instance rendering
 * (regular + inline placements in native bottom accessory).
 */

type ActiveMissionContextValue = {
  activeMission: MissionListItem | null; // The currently focused mission (or first available if none focused)
  availableMissions: MissionListItem[];   // All missions currently in 'available' state
  focusedMissionId: string | null;
  isLoading: boolean;
  setFocus: (missionId: string | null) => Promise<void>;
  startMission: (missionId: string) => Promise<void>;
  completeMission: (missionId: string, result: any) => Promise<void>;
  scrollToMessage: (missionId: string) => void;
  registerScrollHandler: (handler: ((missionId: string) => void) | null) => void;
  registerOptimisticHandler: (handler: ((update: (prev: NarrativeBundleDto[]) => NarrativeBundleDto[]) => void) | null) => void;
  insertQuizAnswerBubble: (questionText: string, answerText: string) => void;
};

const ActiveMissionContext = createContext<ActiveMissionContextValue | null>(null);

export function ActiveMissionProvider({ children }: { children: React.ReactNode }) {
  const { selectedMode, user } = useSession();
  const [missions, setMissions] = useState<MissionListItem[]>(() => getCachedMissions(selectedMode) ?? []);
  const [isLoading, setIsLoading] = useState(() => !getCachedMissions(selectedMode));
  const [focusedMissionId, setFocusedMissionId] = useState<string | null>(null);
  const scrollHandlerRef = React.useRef<((missionId: string) => void) | null>(null);
  const optimisticHandlerRef = React.useRef<((update: (prev: NarrativeBundleDto[]) => NarrativeBundleDto[]) => void) | null>(null);

  const completedMissions = useCompletedMissions(user?.id);
  const submissionStates = useMissionSubmissionStates(user?.id);

  // Load focused mission ID from storage
  useEffect(() => {
    if (!user) {
      setFocusedMissionId(null);
      return;
    }

    AsyncStorage.getItem(`${FOCUS_STORAGE_KEY}:${user.id}`)
      .then((val) => {
        if (val) setFocusedMissionId(val);
      })
      .catch((err) => console.warn('Failed to load focusedMissionId:', err));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setMissions([]);
      setIsLoading(false);
      return;
    }

    let active = true;
    const cached = getCachedMissions(selectedMode);

    if (cached) {
      setMissions(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    async function load() {
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
  }, [selectedMode, user]);

  const availableMissions = useMemo(() => {
    return missions.filter(
      (mission) => getMissionLifecycleStatus(mission, completedMissions, submissionStates) === 'available'
    );
  }, [completedMissions, missions, submissionStates]);

  const activeMission = useMemo(() => {
    if (focusedMissionId) {
      const found = availableMissions.find(m => m._id === focusedMissionId);
      if (found) return found;
    }
    return availableMissions[0] || null;
  }, [availableMissions, focusedMissionId]);

  const setFocus = async (missionId: string | null) => {
    setFocusedMissionId(missionId);
    if (user) {
      const key = `${FOCUS_STORAGE_KEY}:${user.id}`;
      if (missionId) {
        await AsyncStorage.setItem(key, missionId);
      } else {
        await AsyncStorage.removeItem(key);
      }
    }
  };

  const startMission = async (missionId: string) => {
    await setFocus(missionId);
    scrollToMessage(missionId);
  };

  const registerOptimisticHandler = (
    handler: ((update: (prev: NarrativeBundleDto[]) => NarrativeBundleDto[]) => void) | null
  ) => {
    optimisticHandlerRef.current = handler;
  };

  const insertSystemMessage = (text: string) => {
    const systemId = `system-${Date.now()}`;
    const virtualBundle: NarrativeBundleDto = {
      _id: systemId,
      messages: [
        {
          actor: { name: 'System' },
          messageId: `${systemId}-msg`,
          text,
        },
      ],
      releaseAt: new Date().toISOString(),
      title: 'Notfallkanal',
    };

    // We use a custom flag or convention for system messages in the DTO if needed,
    // but for now we'll just insert a bubble that MessageBubble will render.
    upsertOptimisticBundle(virtualBundle);
  };

  const upsertOptimisticBundle = (bundle: NarrativeBundleDto) => {
    const handler = optimisticHandlerRef.current;
    if (handler) {
      handler((prev) => {
        const index = prev.findIndex((b) => b._id === bundle._id);
        if (index > -1) {
          const next = [...prev];
          next[index] = bundle;
          return next;
        }
        return [bundle, ...prev];
      });
    }
  };

  const insertQuizAnswerBubble = (missionTitle: string, answerText: string) => {
    const id = `quiz-ans-${Date.now()}`;
    const bundle: NarrativeBundleDto = {
      _id: id,
      isUser: true,
      messages: [
        {
          actor: { name: user?.displayName || 'Ich' },
          messageId: `${id}-msg`,
          isUser: true,
          attachment: {
            _type: 'submissionAttachment',
            kind: 'quiz',
            missionTitle: missionTitle,
            payload: { answerText },
            status: 'approved',
            submissionId: id,
          },
        },
      ],
      releaseAt: new Date().toISOString(),
      title: 'Quiz Antwort',
    };
    upsertOptimisticBundle(bundle);
  };

  const completeMission = async (missionId: string, result: any) => {
    const mission = missions.find((m) => m._id === missionId);
    if (!mission) return;

    const idempotencyId = `submit-${missionId}-${Date.now()}`;
    
    // 1. Create virtual bundle for user submission
    const virtualBundle: NarrativeBundleDto = {
      _id: idempotencyId,
      isUser: true,
      messages: [
        {
          actor: { name: user?.displayName || 'Ich' },
          attachment: {
            _type: 'submissionAttachment',
            kind: mission.kind as any,
            missionTitle: mission.title,
            payload: result,
            status: 'sending',
            submissionId: idempotencyId,
          },
          messageId: `${idempotencyId}-msg`,
          isUser: true,
        },
      ],
      releaseAt: new Date().toISOString(),
      title: 'Meine Einsendung',
    };

    // 2. Insert optimistically
    upsertOptimisticBundle(virtualBundle);
    
    // 3. Clear focus
    await setFocus(null);

    // 4. Submit to API
    try {
      let apiResult: any;
      if (mission.kind === 'text') {
        apiResult = await submitTextMission(missionId, result.text, selectedMode);
      } else if (mission.kind === 'photo') {
        apiResult = await submitPhotoMission(missionId, result.photoPath, selectedMode);
      } else if (mission.kind === 'gps') {
        apiResult = await submitGpsCompletion(missionId, selectedMode);
      } else if (mission.kind === 'quiz') {
        apiResult = await submitQuizCompletion(missionId, result.answers, selectedMode);
      }

      // 4.5. Update status to pending (or approved/rejected if API returned it)
      const finalStatus = apiResult?.scored ? 'approved' : 'pending';
      const updatedBundle = {
        ...virtualBundle,
        messages: [
          {
            ...virtualBundle.messages[0],
            attachment: {
              ...virtualBundle.messages[0].attachment!,
              status: finalStatus as any,
              payload: { ...virtualBundle.messages[0].attachment!.payload, ...apiResult },
            },
          },
        ],
      };
      upsertOptimisticBundle(updatedBundle);

      // 5. If success, show points as system message
      if (apiResult && typeof apiResult.earned === 'number' && apiResult.earned > 0) {
        insertSystemMessage(`🎯 +${apiResult.earned} Punkte erhalten`);
      } else if (apiResult?.scored) {
        insertSystemMessage(`✅ Mission abgeschlossen`);
      }

    } catch (err) {
      console.error('[ActiveMission] Submission failed:', err);
      // Update optimistic bundle to show error
      const errorBundle = {
        ...virtualBundle,
        messages: [
          {
            ...virtualBundle.messages[0],
            attachment: {
              ...virtualBundle.messages[0].attachment!,
              status: 'error' as any,
              payload: 'Übertragung fehlgeschlagen', // Replaces preview with error message text
            },
          },
        ],
      };
      upsertOptimisticBundle(errorBundle);
    }
  };

  const registerScrollHandler = (handler: ((missionId: string) => void) | null) => {
    scrollHandlerRef.current = handler;
  };

  const scrollToMessage = (missionId: string) => {
    scrollHandlerRef.current?.(missionId);
  };

  const value = useMemo(
    () => ({ 
      activeMission, 
      availableMissions,
      focusedMissionId,
      isLoading,
      setFocus,
      startMission,
      completeMission,
      scrollToMessage,
      registerScrollHandler,
      registerOptimisticHandler,
      insertQuizAnswerBubble
    }),
    [activeMission, availableMissions, focusedMissionId, isLoading]
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
  const isVisible = FEATURES.SHOW_ACTIVE_MISSION_BAR && !isLoading && activeMission !== null;
  const isNative = Platform.OS === 'ios' && getIOSMajorVersion() >= 26 && FEATURES.ENABLE_NATIVE_BOTTOM_ACCESSORY;
  
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
