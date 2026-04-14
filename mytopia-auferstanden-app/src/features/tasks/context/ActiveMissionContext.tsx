import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
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
import { useSession } from '@/src/core/session/SessionContext';
import { resolveMessageDelayMs } from '@/src/features/feed/utils/playback';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';
import { getMissionLifecycleStatus, isMissionExpired } from '@/src/features/tasks/data/missionStatus';
import { upsertChannelBundle } from '@/src/features/channels/data/channelStore';

import { FEATURES } from '@/src/config/features';

const FOCUS_STORAGE_KEY = 'mytopia_focused_mission_id';

/**
 * Shared state for ActiveMissionBar to support dual-instance rendering
 * (regular + inline placements in native bottom accessory).
 */

type ActiveMissionContextValue = {
  activeChannel: ActiveChannelState;
  activeMission: MissionListItem | null; // The currently focused mission (or first available if none focused)
  availableMissions: MissionListItem[];   // All missions currently in 'available' state
  focusedMissionId: string | null;
  isLoading: boolean;
  setFocus: (missionId: string | null) => Promise<void>;
  startMission: (
    missionId: string,
    actor?: NarrativeMessageDto['actor'],
    data?: { description?: string; imageUrl?: string; title?: string }
  ) => Promise<void>;
  completeMission: (missionId: string, result: any) => Promise<void>;
  scrollToMessage: (missionId: string) => void;
  highlightedMissionId: string | null;
  highlightMission: (missionId: string) => void;
  registerScrollHandler: (handler: ((missionId: string) => void) | null) => void;
  registerOptimisticHandler: (handler: ((update: (prev: NarrativeBundleDto[]) => NarrativeBundleDto[]) => void) | null) => void;
  setActiveChannel: (channel: ActiveChannelState) => void;
  insertQuizAnswerBubble: (missionId: string, missionTitle: string, answerText: string) => void;

  // Quiz Conversation Flow
  quizSession: QuizSession | null;
  persistedSessions: Record<string, QuizSession>;
  setQuizSession: (session: QuizSession | null) => void;
  pauseQuiz: () => void;
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
  bundles: NarrativeBundleDto[]; // Persisted optimistic bundles for rehydration
};

type ActiveChannelState = {
  actorAvatarUrl?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  channelId: string;
  channelType: 'hub' | 'actor';
};

const QUIZ_PROGRESS_KEY = 'mytopia_quiz_progress_v1';

const ActiveMissionContext = createContext<ActiveMissionContextValue | null>(null);

export function ActiveMissionProvider({ children }: { children: React.ReactNode }) {
  const { selectedMode, user } = useSession();
  const [missions, setMissions] = useState<MissionListItem[]>(() => getCachedMissions(selectedMode) ?? []);
  const [isLoading, setIsLoading] = useState(() => !getCachedMissions(selectedMode));
  const [focusedMissionId, setFocusedMissionId] = useState<string | null>(null);
  const [highlightedMissionId, setHighlightedMissionId] = useState<string | null>(null);
  const [activeChannel, setActiveChannelState] = useState<ActiveChannelState>({
    channelId: 'hub',
    channelType: 'hub',
  });
  const scrollHandlerRef = React.useRef<((missionId: string) => void) | null>(null);
  const optimisticHandlerRef = React.useRef<((update: (prev: NarrativeBundleDto[]) => NarrativeBundleDto[]) => void) | null>(null);
  const activeChannelRef = useRef<ActiveChannelState>({
    channelId: 'hub',
    channelType: 'hub',
  });

  const completedMissions = useCompletedMissions(user?.id);
  const submissionStates = useMissionSubmissionStates(user?.id);

  // Conversation Flow State
  const [quizSession, setQuizSession] = useState<QuizSession | null>(null);
  const [persistedSessions, setPersistedSessions] = useState<Record<string, QuizSession>>({});
  const initialLoadRef = useRef(false);
  const [siteSettings, setSiteSettings] = useState<any>(null);
  const pauseQuizRef = useRef<() => void>(() => {});
  const scrollToMessageRef = useRef<(missionId: string) => void>(() => {});
  const completeMissionRef = useRef<(missionId: string, result: any) => Promise<void>>(async () => {});

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
    const loadProgress = async () => {
      try {
        const saved = await AsyncStorage.getItem(QUIZ_PROGRESS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          setPersistedSessions(parsed);
        }
      } catch (err) {
        console.warn('[ActiveMission] Failed to load quiz progress:', err);
      } finally {
        initialLoadRef.current = true;
      }
    };
    loadProgress();
  }, []);

  useEffect(() => {
    if (!initialLoadRef.current) return;
    const saveProgress = async () => {
      try {
        await AsyncStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify(persistedSessions));
      } catch (err) {
        console.warn('[ActiveMission] Failed to save quiz progress:', err);
      }
    };
    saveProgress();
  }, [persistedSessions]);

  const updatePersistedSession = useCallback((session: QuizSession | null) => {
    if (!session) return;
    setPersistedSessions(prev => ({
      ...prev,
      [session.missionId]: session,
    }));
  }, []);

  const removePersistedSession = useCallback((missionId: string) => {
    setPersistedSessions(prev => {
      const { [missionId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

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

  const registerOptimisticHandler = useCallback((
    handler: ((update: (prev: NarrativeBundleDto[]) => NarrativeBundleDto[]) => void) | null
  ) => {
    optimisticHandlerRef.current = handler;
  }, []);

  const setActiveChannel = useCallback((channel: ActiveChannelState) => {
    activeChannelRef.current = channel;
    setActiveChannelState(channel);
  }, []);

  const persistBundleToActorChannel = useCallback(async (bundle: NarrativeBundleDto) => {
    const channel = activeChannelRef.current;
    if (!user?.id || channel.channelType !== 'actor') {
      return;
    }

    try {
      await upsertChannelBundle({
        bundle,
        channelActor: channel.actorId
          ? {
              ...(channel.actorAvatarUrl ? { actorAvatarUrl: channel.actorAvatarUrl } : {}),
              actorId: channel.actorId,
              actorName: channel.actorName ?? bundle.messages[0]?.actor.name ?? 'Kanal',
              ...(channel.actorRole ? { actorRole: channel.actorRole } : {}),
            }
          : undefined,
        channelId: channel.channelId,
        channelType: 'actor',
        incrementUnread: false,
        mode: selectedMode,
        uid: user.id,
      });
    } catch (error) {
      console.warn('[ActiveMission] Failed to persist channel bundle', error);
    }
  }, [selectedMode, user?.id]);

  const lastScheduledReleaseAtMsRef = useRef<number>(0);

  /**
   * Helper to calculate the exact delay from 'now' until the current 
   * NPC typing queue is fully empty, plus an optional buffer.
   * This ensures uniform timing between message completion and UI reveal.
   */
  const getRemainingQueueDelay = useCallback((bufferMs: number = 300) => {
    const now = Date.now();
    const remaining = lastScheduledReleaseAtMsRef.current - now;
    return Math.max(0, remaining) + bufferMs;
  }, []);

  const upsertOptimisticBundle = useCallback((bundle: NarrativeBundleDto) => {
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
  }, []);

  /**
   * Internal helper to create and upsert an optimistic bundle.
   * Handles ID generation, automatic release time calculation (staggering),
   * and persistence to active quiz sessions.
   */
  const insertMessageBundle = useCallback((params: {
    actor: NarrativeMessageDto['actor'];
    text?: string;
    attachment?: NarrativeAttachmentDto;
    isUser?: boolean;
    isSystem?: boolean;
    releaseOffsetMs?: number;
    title?: string;
  }) => {
    const { actor, text, attachment, isUser, isSystem, releaseOffsetMs = 0, title } = params;
    
    const now = Date.now();
    // For staggering: if we have a future message scheduled, we append to its end.
    // Otherwise, we start from now.
    const shouldBypassQueue = Boolean(isUser);
    const baseTime = shouldBypassQueue
      ? now + releaseOffsetMs
      : Math.max(now, lastScheduledReleaseAtMsRef.current) + releaseOffsetMs;
    
    // ID generation
    const prefix = isSystem ? 'sys' : (isUser ? 'user' : 'npc');
    const bundleId = `${prefix}-opt-${baseTime}-${Math.floor(Math.random() * 1000)}`;
    const messageId = `${bundleId}-m1`;
    
    const releaseAt = new Date(baseTime).toISOString();
    
    const bundle: NarrativeBundleDto = {
      _id: bundleId,
      messages: [{
        ...(text ? { text } : {}),
        actor,
        ...(attachment ? { attachment } : {}),
        ...(typeof isUser === 'boolean' ? { isUser } : {}),
        messageId,
      }],
      releaseAt,
      title: title || (isUser ? 'Besucher' : 'Notfallkanal'),
      ...(typeof isUser === 'boolean' ? { isUser } : {}),
    };

    // Calculate playback duration to update the queue tracker
    const delay = resolveMessageDelayMs(bundle.messages[0], isUser);
    
    // System messages don't block the NPC typing queue by default
    if (!isSystem && !isUser) {
      lastScheduledReleaseAtMsRef.current = baseTime + delay;
    }

    // Push to feed UI
    upsertOptimisticBundle(bundle);
    void persistBundleToActorChannel(bundle);

    // Persistence for Active Quiz (so history survives restarts/focus changes)
    setQuizSession(prev => {
      if (prev) {
        const updated = { ...prev, bundles: [bundle, ...prev.bundles] };
        updatePersistedSession(updated);
        return updated;
      }
      return prev;
    });

    return delay;
  }, [persistBundleToActorChannel, updatePersistedSession, upsertOptimisticBundle]);

  const insertSystemMessage = useCallback((text: string, releaseOffsetMs: number = 0, kind: 'neutral' | 'prominent' = 'neutral') => {
    const actor = { name: 'System' };
    insertMessageBundle({
      actor,
      text,
      attachment: kind ? { _type: 'systemAttachment', kind } : undefined,
      isSystem: true,
      releaseOffsetMs,
    });
  }, [insertMessageBundle]);

  const insertUserMessage = useCallback((actor: NarrativeMessageDto['actor'], text: string, releaseOffsetMs: number = 0) => {
    insertMessageBundle({
      actor,
      text,
      isUser: true,
      releaseOffsetMs,
    });
  }, [insertMessageBundle]);

  const insertNpcMessage = useCallback((actor: NarrativeMessageDto['actor'], text: string, attachment?: NarrativeAttachmentDto, releaseOffsetMs: number = 0) => {
    return insertMessageBundle({
      actor,
      text,
      attachment,
      isUser: false,
      releaseOffsetMs,
    });
  }, [insertMessageBundle]);

  const pauseQuiz = useCallback(() => {
    if (quizSession && !quizSession.isFinished) {
      insertSystemMessage('Quiz pausiert. Du kannst es jederzeit fortsetzen.', 0, 'neutral');
      setQuizSession(null);
    }
  }, [quizSession, insertSystemMessage]);

  useEffect(() => {
    pauseQuizRef.current = pauseQuiz;
  }, [pauseQuiz]);

  const insertQuizAnswerBubble = useCallback((missionId: string, missionTitle: string, answerText: string) => {
    insertUserMessage({ name: user?.displayName || 'Ich' }, answerText);
  }, [insertUserMessage, user?.displayName]);

  const startChatQuiz = useCallback(async (
    missionId: string, 
    actor: NarrativeMessageDto['actor'],
    data?: { title?: string; questions?: any[]; description?: string; imageUrl?: string }
  ) => {
    if (quizSession?.missionId === missionId) return;
    
    const cached = missions.find(m => m._id === missionId);
    const mission = {
      ...data,
      ...cached,
      title: cached?.title ?? data?.title ?? 'Mission',
      description: cached?.description ?? data?.description,
      imageUrl: cached?.imageUrl ?? data?.imageUrl,
      questions: cached?.questions ?? data?.questions,
    };
    if (!mission || !mission.questions) return;

    // Check if we already have a session for this mission
    const saved = persistedSessions[missionId];
    if (saved) {
      // Check for expiry
      if (isMissionExpired(mission)) {
        insertSystemMessage('Diese Mission ist abgelaufen und kann nicht fortgesetzt werden.', 0, 'neutral');
        removePersistedSession(missionId);
        return;
      }

      // Resume Existing Session
      // We initially keep the picker hidden to show the status message and question re-reveal
      setQuizSession({ ...saved, showPicker: false });
      
      // Re-rehydrate history to the feed (only if they aren't already there)
      const handler = optimisticHandlerRef.current;
      if (handler) {
        handler(prev => {
          const ids = new Set(prev.map(b => b._id));
          const toAdd = saved.bundles.filter(b => !ids.has(b._id));
          return [...toAdd, ...prev];
        });
      }

      scrollToMessageRef.current('bottom');
      
      // Resume sequence starts immediately
      insertSystemMessage('Mission fortgesetzt', 0, 'neutral');
      
      // Re-reveal first un-answered question so the user has context
      const currentQ = saved.questions[saved.currentIndex].questionText;
      insertNpcMessage(actor, currentQ);

      // Show picker after the question finishes typing
      setTimeout(() => {
        setQuizSession(prev => {
          if (!prev) return null;
          const updated = { ...prev, showPicker: true };
          updatePersistedSession(updated);
          return updated;
        });
        scrollToMessageRef.current('bottom');
      }, getRemainingQueueDelay(300));

      return;
    }

    // Initialize New Session
    scrollToMessageRef.current('bottom');
    // 0. Status message: Mission started
    const startDelay = getRemainingQueueDelay(100);
    await new Promise(resolve => setTimeout(resolve, startDelay));
    insertSystemMessage('Mission gestartet', 0, 'neutral');

    const newSession: QuizSession = {
      missionId,
      currentIndex: 0,
      actor,
      answers: [],
      isFinished: false,
      totalQuestions: mission.questions.length,
      questions: mission.questions,
      missionTitle: mission.title || 'Mission',
      showPicker: false,
      bundles: [],
    };
    
    setQuizSession(newSession);
    updatePersistedSession(newSession);

    // 1. Mission Intro (Image + Description)
    // Ensure we have a default text if description is missing
    const introText = mission.description
      ? `${mission.title}\n\n${mission.description}`
      : mission.title;
    insertNpcMessage(
      actor, 
      introText, 
      mission.imageUrl ? {
        _type: 'imageAttachment',
        url: mission.imageUrl,
        caption: mission.title,
      } : undefined
    );

    // 2. First Question (Already staggered because of lastScheduledReleaseAtMsRef)
    const qText = mission.questions![0].questionText;
    insertNpcMessage(actor, qText);

    // We only show the picker AFTER the intro AND question have played
    setTimeout(() => {
      setQuizSession(prev => {
        if (!prev) return null;
        const updated = { ...prev, showPicker: true };
        updatePersistedSession(updated);
        return updated;
      });
      scrollToMessageRef.current('bottom');
    }, getRemainingQueueDelay(300)); 
  }, [quizSession, missions, persistedSessions, insertSystemMessage, removePersistedSession, updatePersistedSession, insertNpcMessage, getRemainingQueueDelay]);

  const submitQuizStep = useCallback(async (optionIndex: number) => {
    const session = quizSession;
    if (!session) return;
    
    const choice = quizSession?.questions[session.currentIndex].options[optionIndex];
    if (!choice) return;
    const isCorrect = choice.isCorrect;
    const isLastQuestion = session.currentIndex === session.totalQuestions - 1;
    const newAnswers = [...session.answers, optionIndex];

    setQuizSession(prev => prev ? { ...prev, answers: newAnswers, showPicker: false } : null);

    // 1. User Message
    insertUserMessage(session.actor, choice.text);

    // 2. Feedback (Automatic Staggering)
    const mission = missions.find(m => m._id === session.missionId);
    const question = mission?.questions?.[session.currentIndex];
    
    const feedback = isCorrect 
      ? (question?.feedbackCorrect || mission?.feedbackCorrect || siteSettings?.defaultQuizFeedbackCorrect || 'Richtig!')
      : (question?.feedbackIncorrect || mission?.feedbackIncorrect || siteSettings?.defaultQuizFeedbackIncorrect || 'Leider nicht richtig.');
    
    insertNpcMessage(session.actor, feedback, undefined, 200);

    if (isLastQuestion) {
      // Delay finishing state until feedback has played
      setTimeout(() => {
        void completeMissionRef.current(session.missionId, newAnswers);
        removePersistedSession(session.missionId);
        setQuizSession(null);
      }, getRemainingQueueDelay(500));
    } else {
      const nextIdx = session.currentIndex + 1;
      insertNpcMessage(session.actor, session.questions[nextIdx].questionText);

      // Show picker after question finishes "typing"
      setTimeout(() => {
        setQuizSession(prev => {
          if (!prev) return null;
          const updated = { ...prev, showPicker: true, currentIndex: nextIdx };
          updatePersistedSession(updated);
          return updated;
        });
        scrollToMessageRef.current('bottom');
      }, getRemainingQueueDelay(300));
    }
  }, [quizSession, insertUserMessage, missions, siteSettings, insertNpcMessage, removePersistedSession, updatePersistedSession, getRemainingQueueDelay]);



  const completeMission = useCallback(async (missionId: string, result: any) => {
    const mission = missions.find((m) => m._id === missionId);
    if (!mission) return;

    // Backend typically expects clean IDs. If a draft ID is passed, it will correctly 404 
    // per user rules (drafts should not be visible/activatable).
    const cleanMissionId = missionId;
    const channel = activeChannelRef.current;
    const channelMeta =
      channel.channelType === 'actor' && channel.actorId
        ? {
            ...(channel.actorAvatarUrl ? { actorAvatarUrl: channel.actorAvatarUrl } : {}),
            actorId: channel.actorId,
            actorName: channel.actorName ?? 'Kanal',
            channelId: channel.channelId,
            channelType: channel.channelType,
          }
        : undefined;

    const idempotencyId = `submit-${cleanMissionId}-${Date.now()}`;
    
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
            missionId: cleanMissionId,
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
    void persistBundleToActorChannel(virtualBundle);
    
    // 3. Clear focus without re-triggering mission pause side effects
    setFocusedMissionId(null);
    if (user) {
      await AsyncStorage.removeItem(`${FOCUS_STORAGE_KEY}:${user.id}`);
    }

    // 4. Submit to API using the clean ID
    try {
      let apiResult: any;
      if (mission.kind === 'text') {
        apiResult = await submitTextMission(cleanMissionId, result.text, selectedMode, channelMeta);
      } else if (mission.kind === 'photo') {
        apiResult = await submitPhotoMission(cleanMissionId, result.photoPath, selectedMode, channelMeta);
      } else if (mission.kind === 'gps') {
        apiResult = await submitGpsCompletion(cleanMissionId, selectedMode, channelMeta);
      } else if (mission.kind === 'quiz') {
        apiResult = await submitQuizCompletion(
          cleanMissionId,
          Array.isArray(result) ? result : result.answers,
          selectedMode,
          channelMeta
        );
      }

      const isImmediateMissionCompletion =
        apiResult?.action === 'scored' ||
        apiResult?.action === 'already_completed';
      const finalStatus = isImmediateMissionCompletion ? 'approved' : 'pending';
      const submissionAttachment = virtualBundle.messages[0].attachment;
      if (!submissionAttachment || submissionAttachment._type !== 'submissionAttachment') {
        throw new Error('Expected optimistic submission attachment.');
      }

      const moderatorNote =
        typeof apiResult?.moderatorNote === 'string' && apiResult.moderatorNote.trim().length > 0
          ? apiResult.moderatorNote.trim()
          : undefined;

      const updatedBundle = {
        ...virtualBundle,
        messages: [
          {
            ...virtualBundle.messages[0],
            attachment: {
              ...submissionAttachment,
              status: finalStatus as any,
              moderatorNote,
              payload: { ...submissionAttachment.payload, ...apiResult },
            },
          },
        ],
      };
      upsertOptimisticBundle(updatedBundle);
      void persistBundleToActorChannel(updatedBundle);

      const showCard =
        isImmediateMissionCompletion ||
        typeof apiResult?.earned === 'number' ||
        mission.kind === 'quiz' ||
        mission.kind === 'gps';
      
      if (showCard) {
        insertMessageBundle({
          actor: { name: 'System' },
          attachment: {
            _type: 'missionResultAttachment',
            missionId: cleanMissionId,
            missionTitle: mission.title,
            kind: mission.kind,
            payload: apiResult,
            earnedPoints: apiResult?.earned,
          },
          isSystem: true,
          releaseOffsetMs: moderatorNote ? 1800 : 500,
        });
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
      void persistBundleToActorChannel(errorBundle);
    }
  }, [missions, selectedMode, upsertOptimisticBundle, user, insertMessageBundle, persistBundleToActorChannel]);

  const registerScrollHandler = useCallback((handler: ((missionId: string) => void) | null) => {
    scrollHandlerRef.current = handler;
  }, []);

  const highlightMission = useCallback((missionId: string) => {
    setHighlightedMissionId(missionId);
    setTimeout(() => {
      setHighlightedMissionId(null);
    }, 3000); // Highlight for 3 seconds
  }, []);

  const scrollToMessage = useCallback((missionId: string) => {
    scrollHandlerRef.current?.(missionId);
    highlightMission(missionId);
  }, [highlightMission]);

  useEffect(() => {
    scrollToMessageRef.current = scrollToMessage;
  }, [scrollToMessage]);

  useEffect(() => {
    completeMissionRef.current = completeMission;
  }, [completeMission]);

  const setFocus = useCallback(async (missionId: string | null) => {
    if (focusedMissionId && missionId !== focusedMissionId) {
      pauseQuizRef.current();
    }

    setFocusedMissionId(missionId);
    if (user) {
      const key = `${FOCUS_STORAGE_KEY}:${user.id}`;
      if (missionId) {
        await AsyncStorage.setItem(key, missionId);
      } else {
        await AsyncStorage.removeItem(key);
      }
    }
  }, [focusedMissionId, user]);

  const startMission = useCallback(async (
    missionId: string,
    actor?: NarrativeMessageDto['actor'],
    data?: { description?: string; imageUrl?: string; title?: string }
  ) => {
    await setFocus(missionId);

    if (actor && activeChannelRef.current.channelType === 'actor') {
      insertSystemMessage('Mission gestartet', 0, 'neutral');

      const mission = missions.find((item) => item._id === missionId);
      const title = mission?.title ?? data?.title ?? 'Mission';
      const description = mission?.description ?? data?.description;
      const imageUrl = mission?.imageUrl ?? data?.imageUrl;
      const introText = description ? `${title}\n\n${description}` : title;

      insertNpcMessage(
        actor,
        introText,
        imageUrl
          ? {
              _type: 'imageAttachment',
              caption: title,
              url: imageUrl,
            }
          : undefined,
        120
      );
    }

    scrollToMessageRef.current('bottom');
  }, [insertNpcMessage, insertSystemMessage, missions, setFocus]);

  const value = useMemo(
    () => ({ 
      activeMission, 
      activeChannel,
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
      setActiveChannel,
      insertQuizAnswerBubble,
      quizSession,
      persistedSessions,
      pauseQuiz,
      startChatQuiz,
      submitQuizStep,
      setQuizSession,
    }),
    [
      activeMission, 
      activeChannel,
      availableMissions, 
      focusedMissionId, 
      isLoading, 
      highlightedMissionId, 
      quizSession, 
      persistedSessions,
      pauseQuiz,
      startChatQuiz, 
      submitQuizStep,
      completeMission,
      insertQuizAnswerBubble,
      scrollToMessage,
      setFocus,
      startMission,
      highlightMission,
      registerScrollHandler,
      registerOptimisticHandler,
      setActiveChannel,
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
