import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { getCurrentFirebaseUser } from '@/src/core/firebase/authClient';
import { 
  fetchMissions, 
  getCachedMissions, 
  type MissionListItem, 
  submitGpsCompletion, 
  submitPhotoMission, 
  submitQuizCompletion, 
  submitTextMission,
  fetchSettings
} from '@/src/features/tasks/data/missionRepository';
import { type NarrativeBundleDto, type NarrativeAttachmentDto, type NarrativeMessageDto } from '@/src/features/feed/data/narrativeFeedClient';
import { AppMode, useAppMode } from '@/src/core/session/appMode';
import { useSession } from '@/src/core/session/SessionContext';
import { resolveMessageDelayMs } from '@/src/features/feed/utils/playback';
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
  highlightedMissionId: string | null;
  highlightMission: (missionId: string) => void;
  registerScrollHandler: (handler: ((missionId: string) => void) | null) => void;
  registerOptimisticHandler: (handler: ((update: (prev: NarrativeBundleDto[]) => NarrativeBundleDto[]) => void) | null) => void;
  insertQuizAnswerBubble: (missionId: string, missionTitle: string, answerText: string) => void;

  // Quiz Conversation Flow
  quizSession: QuizSession | null;
  setQuizSession: (session: QuizSession | null) => void;
  clearQuizMessages: () => void;
  startChatQuiz: (missionId: string, actor: NarrativeMessageDto['actor'], data?: any) => Promise<void>;
  submitQuizStep: (optionIndex: number) => Promise<void>;
};

type QuizSession = {
  missionId: string;
  currentIndex: number;
  actor: NarrativeMessageDto['actor'];
  answers: number[];
  isFinished: boolean;
  totalQuestions: number;
  questions: any[]; // Store questions directly to avoid list lookup issues
  missionTitle: string;
  showPicker: boolean; // Timing control for UI
};

const ActiveMissionContext = createContext<ActiveMissionContextValue | null>(null);

export function ActiveMissionProvider({ children }: { children: React.ReactNode }) {
  const { selectedMode, user } = useSession();
  const [missions, setMissions] = useState<MissionListItem[]>(() => getCachedMissions(selectedMode) ?? []);
  const [isLoading, setIsLoading] = useState(() => !getCachedMissions(selectedMode));
  const [focusedMissionId, setFocusedMissionId] = useState<string | null>(null);
  const [highlightedMissionId, setHighlightedMissionId] = useState<string | null>(null);
  const scrollHandlerRef = React.useRef<((missionId: string) => void) | null>(null);
  const optimisticHandlerRef = React.useRef<((update: (prev: NarrativeBundleDto[]) => NarrativeBundleDto[]) => void) | null>(null);

  const completedMissions = useCompletedMissions(user?.id);
  const submissionStates = useMissionSubmissionStates(user?.id);

  // Conversation Flow State
  const [quizSession, setQuizSession] = useState<QuizSession | null>(null);
  const [siteSettings, setSiteSettings] = useState<any>(null);

  // Fetch Site Settings on mount or when user changes
  useEffect(() => {
    fetchSettings(selectedMode)
      .then(setSiteSettings)
      .catch(err => console.error('[ActiveMission] Failed to fetch settings:', err));
  }, [selectedMode, user?.id]);

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

    upsertOptimisticBundle(virtualBundle);
  };
  
  const clearQuizMessages = () => {
    const handler = optimisticHandlerRef.current;
    if (handler) {
      handler((prev) => prev.filter(b => 
        !b._id.startsWith('npc-msg-') && 
        !b._id.startsWith('user-msg-')
      ));
    }
  };

  const insertUserMessage = (actor: NarrativeMessageDto['actor'], text: string, releaseOffsetMs: number = 0) => {
    const id = `user-msg-${Date.now()}`;
    const releaseAt = new Date(Date.now() + releaseOffsetMs).toISOString();
    
    const virtualBundle: NarrativeBundleDto = {
      _id: id,
      messages: [{
        _key: id,
        text,
        actor,
        isUser: true,
        messageId: id,
      }],
      releaseAt,
      title: 'Besucher',
      isUser: true,
    };

    upsertOptimisticBundle(virtualBundle);
  };

  const insertNpcMessage = (actor: NarrativeMessageDto['actor'], text: string, attachment?: NarrativeAttachmentDto, releaseOffsetMs: number = 0) => {
    const id = `npc-msg-${Date.now() + releaseOffsetMs}`; // Slight offset for ID uniqueness
    const releaseAt = new Date(Date.now() + releaseOffsetMs).toISOString();

    const virtualBundle: NarrativeBundleDto = {
      _id: id,
      messages: [{
        _key: id,
        text,
        actor,
        attachment,
        messageId: id,
      }],
      releaseAt,
      title: 'Notfallkanal',
    };

    upsertOptimisticBundle(virtualBundle);

    // Calculate how long this message takes to "play"
    return resolveMessageDelayMs({ 
      text, 
      attachment, 
      actor, 
      messageId: id 
    });
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

  const insertQuizAnswerBubble = (missionId: string, missionTitle: string, answerText: string) => {
    insertUserMessage({ name: user?.displayName || 'Ich' }, answerText);
  };

  const startChatQuiz = async (
    missionId: string, 
    actor: NarrativeMessageDto['actor'],
    data?: { title?: string; questions?: any[]; description?: string; imageUrl?: string }
  ) => {
    if (quizSession?.missionId === missionId) return;
    clearQuizMessages();
    const cached = missions.find(m => m._id === missionId);
    const mission = { ...cached, ...data };

    if (!mission || !mission.questions) return;

    scrollToMessage('bottom');
    await new Promise(resolve => setTimeout(resolve, 400));

    setQuizSession({
      missionId,
      currentIndex: 0,
      actor,
      answers: [],
      isFinished: false,
      totalQuestions: mission.questions.length,
      questions: mission.questions,
      missionTitle: mission.title || 'Mission',
      showPicker: false,
    });

    // 1. Mission Intro (Image + Description)
    const introText = mission.description || `Bist du bereit für die Mission: ${mission.title}?`;
    const introDelay = insertNpcMessage(
      actor, 
      introText, 
      mission.imageUrl ? {
        _type: 'imageAttachment',
        url: mission.imageUrl,
        caption: mission.title,
      } : undefined, 
      0
    );

    // 2. First Question (Staggered)
    setTimeout(() => {
      const qText = mission.questions![0].questionText;
      const qDelay = insertNpcMessage(actor, qText, undefined, 0);

      setTimeout(() => {
        setQuizSession(prev => prev ? { ...prev, showPicker: true } : null);
        scrollToMessage('bottom');
      }, qDelay + 200);
    }, introDelay + 250);
  };

  const submitQuizStep = async (optionIndex: number) => {
    const session = quizSession;
    if (!session) return;
    
    const choice = quizSession?.questions[session.currentIndex].options[optionIndex];
    if (!choice) return;
    const isCorrect = choice.isCorrect;
    const isLastQuestion = session.currentIndex === session.totalQuestions - 1;
    const newAnswers = [...session.answers, optionIndex];

    setQuizSession(prev => prev ? { ...prev, answers: newAnswers, showPicker: false } : null);

    // 1. User Message
    insertUserMessage(session.actor, choice.text, 0);

    // 2. Feedback (Short Delay)
    setTimeout(() => {
      const mission = missions.find(m => m._id === session.missionId);
      const question = mission?.questions?.[session.currentIndex];
      
      const feedback = isCorrect 
        ? (question?.feedbackCorrect || mission?.feedbackCorrect || siteSettings?.defaultQuizFeedbackCorrect || 'Richtig!')
        : (question?.feedbackIncorrect || mission?.feedbackIncorrect || siteSettings?.defaultQuizFeedbackIncorrect || 'Leider nicht richtig.');
      
      const fDelay = insertNpcMessage(session.actor, feedback, undefined, 0);

      if (isLastQuestion) {
        setTimeout(() => {
          completeMission(session.missionId, newAnswers);
          setQuizSession(null);
        }, fDelay + 500);
      } else {
        setTimeout(() => {
          const nextIdx = session.currentIndex + 1;
          const qDelay = insertNpcMessage(session.actor, session.questions[nextIdx].questionText, undefined, 0);

          setTimeout(() => {
            setQuizSession(prev => prev ? { ...prev, currentIndex: nextIdx, showPicker: true } : null);
            scrollToMessage('bottom');
          }, qDelay + 200);
        }, fDelay + 300);
      }
    }, 400);
  };


  const finalizeQuiz = async (mission: MissionListItem, answers: number[]) => {
    try {
      const apiResult = await submitQuizCompletion(mission._id, answers, selectedMode);
      
      // Inject Scorecard Bubble
      const id = `scorecard-${Date.now()}`;
      const bundle: NarrativeBundleDto = {
        _id: id,
        messages: [
          {
            actor: quizSession?.actor ?? { name: 'System' },
            messageId: `${id}-msg`,
            attachment: {
               _type: 'scorecardAttachment',
               correct: apiResult.correctCount ?? apiResult.correct ?? 0,
               total: apiResult.totalCount ?? apiResult.total ?? mission.questions?.length ?? 0,
            },
          }
        ],
        releaseAt: new Date().toISOString(),
        title: 'Scorecard',
      };
      upsertOptimisticBundle(bundle);

      if (apiResult.earned > 0) {
        insertSystemMessage(`+${apiResult.earned} Punkte erhalten`, 0, 'prominent');
      }
      
      setQuizSession(null);
    } catch (err) {
      console.warn('[ActiveMission] Finalize quiz failed:', err);
      insertSystemMessage('⚠️ Fehler beim Senden des Quiz-Ergebnisses.');
      setQuizSession(null);
    }
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
            missionId: missionId,
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
        apiResult = await submitQuizCompletion(missionId, Array.isArray(result) ? result : result.answers, selectedMode);
      }

      // 4.5. Update status to pending (or approved/rejected if API returned it)
      const finalStatus = apiResult?.scored ? 'approved' : 'pending';
      const submissionAttachment = virtualBundle.messages[0].attachment;
      if (!submissionAttachment || submissionAttachment._type !== 'submissionAttachment') {
        throw new Error('Expected optimistic submission attachment.');
      }

      const updatedBundle = {
        ...virtualBundle,
        messages: [
          {
            ...virtualBundle.messages[0],
            attachment: {
              ...submissionAttachment,
              status: finalStatus as any,
              payload: { ...submissionAttachment.payload, ...apiResult },
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
      const submissionAttachment = virtualBundle.messages[0].attachment;
      if (!submissionAttachment || submissionAttachment._type !== 'submissionAttachment') {
        throw new Error('Expected optimistic submission attachment.');
      }

      const errorBundle = {
        ...virtualBundle,
        messages: [
          {
            ...virtualBundle.messages[0],
            attachment: {
              ...submissionAttachment,
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

  const highlightMission = (missionId: string) => {
    setHighlightedMissionId(missionId);
    setTimeout(() => {
      setHighlightedMissionId(null);
    }, 3000); // Highlight for 3 seconds
  };

  const scrollToMessage = (missionId: string) => {
    scrollHandlerRef.current?.(missionId);
    highlightMission(missionId);
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
      highlightedMissionId,
      highlightMission,
      registerScrollHandler,
      registerOptimisticHandler,
      insertQuizAnswerBubble,
      quizSession,
      startChatQuiz,
      submitQuizStep,
      setQuizSession,
      clearQuizMessages,
    }),
    [
      activeMission, 
      availableMissions, 
      focusedMissionId, 
      isLoading, 
      highlightedMissionId, 
      quizSession, 
      startChatQuiz, 
      submitQuizStep,
      completeMission,
      insertQuizAnswerBubble,
      scrollToMessage,
      setFocus,
      startMission,
      highlightMission,
      registerScrollHandler,
      registerOptimisticHandler
    ]
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
