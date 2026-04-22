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
import {
  buildMissionFocusKey,
  buildMissionSessionKey,
  buildQuizProgressKey,
} from '@/src/core/cache/appCache';
import {
  getFirebaseStorageAvailability,
  resolveRetryLocalPhotoUri,
  uploadMissionPhoto,
} from '@/src/features/tasks/data/photoMissionUpload';

import { FEATURES } from '@/src/config/features';

/**
 * Shared state for ActiveMissionBar to support dual-instance rendering
 * (regular + inline placements in native bottom accessory).
 */

type ActiveMissionContextValue = {
  activeChannel: ActiveChannelState;
  activeMission: MissionListItem | null; // The currently focused mission (or first available if none focused)
  availableMissions: MissionListItem[];   // All missions currently in 'available' state
  focusedMission: FocusedMissionState | null;
  focusedMissionChannel: FocusedMissionChannelState | null;
  focusedMissionId: string | null;
  isLoading: boolean;
  missionSessions: Record<string, MissionSessionState>;
  setFocus: (missionId: string | null, channel?: FocusedMissionChannelState | null) => Promise<void>;
  openMissionSession: (missionId: string) => Promise<boolean>;
  startMission: (
    missionId: string,
    actor?: NarrativeMessageDto['actor'],
    data?: {
      description?: string;
      gpsConfig?: MissionListItem['gpsConfig'];
      imageUrl?: string;
      kind?: MissionListItem['kind'];
      title?: string;
    }
  ) => Promise<void>;
  completeMission: (missionId: string, result: any) => Promise<void>;
  retryMissionSubmission: (params: {
    kind: MissionListItem['kind'];
    missionId?: string;
    missionTitle: string;
    payload: any;
    submissionId: string;
  }) => Promise<void>;
  scrollToMessage: (missionId: string) => void;
  highlightedMissionId: string | null;
  highlightMission: (missionId: string) => void;
  registerScrollHandler: (handler: ((missionId: string) => void) | null) => void;
  registerOptimisticHandler: (handler: ((update: (prev: NarrativeBundleDto[]) => NarrativeBundleDto[]) => void) | null) => void;
  resetMissionState: () => void;
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

type FocusedMissionState = {
  _id: string;
  description?: string;
  gpsConfig?: MissionListItem['gpsConfig'];
  imageUrl?: string;
  kind: MissionListItem['kind'];
  title: string;
};

type FocusedMissionChannelState = {
  channelId: string;
  channelType: 'hub' | 'actor';
};

type MissionSessionState = {
  actor?: NarrativeMessageDto['actor'];
  channel: FocusedMissionChannelState;
  data?: {
    description?: string;
    gpsConfig?: MissionListItem['gpsConfig'];
    imageUrl?: string;
    kind?: MissionListItem['kind'];
    questions?: any[];
    title?: string;
  };
  kind: MissionListItem['kind'];
  missionId: string;
  updatedAt: number;
};

const QUIZ_PICKER_REVEAL_BUFFER_MS = 120;
const QUIZ_COMPLETION_BUFFER_MS = 180;
const QUIZ_NEXT_QUESTION_OFFSET_MS = 140;
const QUIZ_RESULT_CARD_HOLD_MS = 2400;

const ActiveMissionContext = createContext<ActiveMissionContextValue | null>(null);

export function ActiveMissionProvider({ children }: { children: React.ReactNode }) {
  const { selectedMode, user } = useSession();
  const [missions, setMissions] = useState<MissionListItem[]>(() => getCachedMissions(selectedMode) ?? []);
  const [isLoading, setIsLoading] = useState(() => !getCachedMissions(selectedMode));
  const [focusedMissionId, setFocusedMissionId] = useState<string | null>(null);
  const [focusedMission, setFocusedMission] = useState<FocusedMissionState | null>(null);
  const [focusedMissionChannel, setFocusedMissionChannel] = useState<FocusedMissionChannelState | null>(null);
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
  const [missionSessions, setMissionSessions] = useState<Record<string, MissionSessionState>>({});
  const [persistedSessions, setPersistedSessions] = useState<Record<string, QuizSession>>({});
  const storageHydratedRef = useRef(false);
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

  // Load focused mission state from storage
  useEffect(() => {
    if (!user) {
      setFocusedMissionId(null);
      setFocusedMission(null);
      setFocusedMissionChannel(null);
      return;
    }

    const focusKey = buildMissionFocusKey(user.id, selectedMode);
    const legacyFocusKey = `mytopia_focused_mission_id:${user.id}`;

    AsyncStorage.getItem(focusKey)
      .then((val) => {
        if (val) {
          return val;
        }
        return AsyncStorage.getItem(legacyFocusKey);
      })
      .then((val) => {
        if (!val) {
          return;
        }

        const storedFocus = parseStoredFocusState(val);
        if (!storedFocus) {
          return;
        }

        setFocusedMissionId(storedFocus.missionId);
        setFocusedMissionChannel(storedFocus.channel);
      })
      .catch((err) => console.warn('Failed to load focusedMissionId:', err));
  }, [selectedMode, user]);

  useEffect(() => {
    if (!user) {
      storageHydratedRef.current = false;
      setQuizSession(null);
      setMissionSessions({});
      setPersistedSessions({});
      return;
    }

    storageHydratedRef.current = false;
    let isCancelled = false;

    const loadState = async () => {
      const quizKey = buildQuizProgressKey(user.id, selectedMode);
      const missionSessionKey = buildMissionSessionKey(user.id, selectedMode);

      try {
        const [savedQuiz, savedSessions] = await Promise.all([
          AsyncStorage.getItem(quizKey),
          AsyncStorage.getItem(missionSessionKey),
        ]);

        if (isCancelled) {
          return;
        }

        setPersistedSessions(
          savedQuiz ? (JSON.parse(savedQuiz) as Record<string, QuizSession>) : {}
        );
        setMissionSessions(
          savedSessions ? (JSON.parse(savedSessions) as Record<string, MissionSessionState>) : {}
        );
      } catch (err) {
        console.warn('[ActiveMission] Failed to load persisted mission state:', err);
        if (!isCancelled) {
          setPersistedSessions({});
          setMissionSessions({});
        }
      } finally {
        if (!isCancelled) {
          storageHydratedRef.current = true;
        }
      }
    };
    void loadState();

    return () => {
      isCancelled = true;
    };
  }, [selectedMode, user]);

  useEffect(() => {
    if (!storageHydratedRef.current || !user) return;

    const saveProgress = async () => {
      const quizKey = buildQuizProgressKey(user.id, selectedMode);
      const missionSessionKey = buildMissionSessionKey(user.id, selectedMode);

      try {
        await Promise.all([
          Object.keys(persistedSessions).length > 0
            ? AsyncStorage.setItem(quizKey, JSON.stringify(persistedSessions))
            : AsyncStorage.removeItem(quizKey),
          Object.keys(missionSessions).length > 0
            ? AsyncStorage.setItem(missionSessionKey, JSON.stringify(missionSessions))
            : AsyncStorage.removeItem(missionSessionKey),
        ]);
      } catch (err) {
        console.warn('[ActiveMission] Failed to save persisted mission state:', err);
      }
    };
    void saveProgress();
  }, [missionSessions, persistedSessions, selectedMode, user]);

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

  const upsertMissionSession = useCallback((session: MissionSessionState) => {
    setMissionSessions((prev) => ({
      ...prev,
      [session.missionId]: session,
    }));
  }, []);

  const removeMissionSession = useCallback((missionId: string) => {
    setMissionSessions((prev) => {
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

  useEffect(() => {
    setMissionSessions((current) => {
      let changed = false;
      const nextSessions = { ...current };

      for (const missionId of Object.keys(current)) {
        const mission = missions.find((item) => item._id === missionId);
        if (!mission) {
          continue;
        }

        const status = getMissionLifecycleStatus(mission, completedMissions, submissionStates);
        if (status === 'available' || status === 'rejected') {
          continue;
        }

        delete nextSessions[missionId];
        changed = true;
      }

      return changed ? nextSessions : current;
    });
  }, [completedMissions, missions, submissionStates]);

  useEffect(() => {
    if (!focusedMissionId) {
      setFocusedMission(null);
      return;
    }

    setFocusedMission((current) => {
      const resolved = missions.find((mission) => mission._id === focusedMissionId);
      if (!resolved) {
        return current;
      }

      return {
        _id: resolved._id,
        ...(resolved.description ? { description: resolved.description } : {}),
        ...(resolved.gpsConfig ? { gpsConfig: resolved.gpsConfig } : {}),
        ...(resolved.imageUrl ? { imageUrl: resolved.imageUrl } : {}),
        kind: resolved.kind,
        title: resolved.title,
      };
    });
  }, [focusedMissionId, missions]);

  const registerOptimisticHandler = useCallback((
    handler: ((update: (prev: NarrativeBundleDto[]) => NarrativeBundleDto[]) => void) | null
  ) => {
    optimisticHandlerRef.current = handler;
  }, []);

  const resetMissionState = useCallback(() => {
    setFocusedMissionId(null);
    setFocusedMission(null);
    setFocusedMissionChannel(null);
    setHighlightedMissionId(null);
    setQuizSession(null);
    setMissionSessions({});
    setPersistedSessions({});
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
    persist?: boolean;
    releaseOffsetMs?: number;
    storeInSession?: boolean;
    title?: string;
  }) => {
    const { actor, text, attachment, isUser, isSystem, persist = true, releaseOffsetMs = 0, storeInSession = true, title } = params;
    
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
    if (persist) {
      void persistBundleToActorChannel(bundle);
    }

    // Persistence for Active Quiz (so history survives restarts/focus changes)
    if (storeInSession) {
      setQuizSession(prev => {
        if (prev) {
          const updated = { ...prev, bundles: [bundle, ...prev.bundles] };
          updatePersistedSession(updated);
          return updated;
        }
        return prev;
      });
    }

    return { bundle, delay };
  }, [persistBundleToActorChannel, updatePersistedSession, upsertOptimisticBundle]);

  const insertSystemMessage = useCallback((
    text: string,
    releaseOffsetMs: number = 0,
    kind: 'neutral' | 'prominent' = 'neutral',
    action?: { actionLabel: string; actionType: 'resumeMission' },
    options?: { persist?: boolean; storeInSession?: boolean }
  ) => {
    const actor = { name: 'System' };
    return insertMessageBundle({
      actor,
      text,
      attachment: kind ? { _type: 'systemAttachment', kind, ...action } : undefined,
      isSystem: true,
      persist: options?.persist ?? false,
      releaseOffsetMs,
      storeInSession: options?.storeInSession ?? false,
    });
  }, [insertMessageBundle]);

  const insertUserMessage = useCallback((actor: NarrativeMessageDto['actor'], text: string, releaseOffsetMs: number = 0) => {
    return insertMessageBundle({
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
    }).delay;
  }, [insertMessageBundle]);

  const pauseQuiz = useCallback(() => {
    if (quizSession && !quizSession.isFinished) {
      setQuizSession(null);
    }
  }, [quizSession]);

  useEffect(() => {
    pauseQuizRef.current = pauseQuiz;
  }, [pauseQuiz]);

  const setFocus = useCallback(async (
    missionId: string | null,
    channel?: FocusedMissionChannelState | null
  ) => {
    const nextChannel = missionId === null
      ? null
      : channel === undefined
        ? focusedMissionChannel
        : channel;

    if (focusedMissionId && missionId !== null && missionId !== focusedMissionId) {
      pauseQuizRef.current();
    }

    setFocusedMissionId(missionId);
    if (missionId === null) {
      setFocusedMission(null);
      setFocusedMissionChannel(null);
    } else if (nextChannel !== undefined) {
      setFocusedMissionChannel(nextChannel);
    }
    if (user) {
      const key = buildMissionFocusKey(user.id, selectedMode);
      if (missionId) {
        await AsyncStorage.setItem(key, JSON.stringify({
          ...(nextChannel ? { channelId: nextChannel.channelId, channelType: nextChannel.channelType } : {}),
          missionId,
        }));
      } else {
        await AsyncStorage.removeItem(key);
      }
    }
  }, [focusedMissionChannel, focusedMissionId, selectedMode, user]);

  const resolveFocusedMissionChannel = useCallback((channel: ActiveChannelState): FocusedMissionChannelState => {
    return {
      channelId: channel.channelId,
      channelType: channel.channelType,
    };
  }, []);

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

    const focusChannel: FocusedMissionChannelState = {
      channelId: activeChannelRef.current.channelId,
      channelType: activeChannelRef.current.channelType,
    };

    upsertMissionSession({
      actor,
      channel: focusChannel,
      data: {
        description: mission.description,
        imageUrl: mission.imageUrl,
        questions: mission.questions,
        title: mission.title || 'Mission',
      },
      kind: 'quiz',
      missionId,
      updatedAt: Date.now(),
    });

    setFocusedMission({
      _id: missionId,
      ...(mission.description ? { description: mission.description } : {}),
      ...(mission.gpsConfig ? { gpsConfig: mission.gpsConfig } : {}),
      ...(mission.imageUrl ? { imageUrl: mission.imageUrl } : {}),
      kind: 'quiz',
      title: mission.title || 'Mission',
    });
    await setFocus(missionId, focusChannel);

    // Check if we already have a session for this mission
    const saved = persistedSessions[missionId];
    if (saved) {
      // Check for expiry
      if (isMissionExpired(mission)) {
        insertSystemMessage('Diese Mission ist abgelaufen und kann nicht fortgesetzt werden.', 0, 'neutral');
        removePersistedSession(missionId);
        removeMissionSession(missionId);
        await setFocus(null);
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
      }, getRemainingQueueDelay(QUIZ_PICKER_REVEAL_BUFFER_MS));

      return;
    }

    // Initialize New Session
    scrollToMessageRef.current('bottom');

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
    }, getRemainingQueueDelay(QUIZ_PICKER_REVEAL_BUFFER_MS)); 
  }, [quizSession, missions, persistedSessions, removeMissionSession, removePersistedSession, setFocus, updatePersistedSession, insertNpcMessage, getRemainingQueueDelay, insertSystemMessage, upsertMissionSession]);

  const submitQuizStep = useCallback(async (optionIndex: number) => {
    const session = quizSession;
    if (!session) return;
    
    const choice = quizSession?.questions[session.currentIndex].options[optionIndex];
    if (!choice) return;
    const isCorrect = choice.isCorrect;
    const isLastQuestion = session.currentIndex === session.totalQuestions - 1;
    const newAnswers = [...session.answers, optionIndex];

    setQuizSession(prev => {
      if (!prev) {
        return null;
      }

      const updated = { ...prev, answers: newAnswers, showPicker: false };
      updatePersistedSession(updated);
      return updated;
    });

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
      }, getRemainingQueueDelay(QUIZ_COMPLETION_BUFFER_MS));
    } else {
      const nextIdx = session.currentIndex + 1;
      insertNpcMessage(
        session.actor,
        session.questions[nextIdx].questionText,
        undefined,
        QUIZ_NEXT_QUESTION_OFFSET_MS
      );

      // Show picker after question finishes "typing"
      setTimeout(() => {
        setQuizSession(prev => {
          if (!prev) return null;
          const updated = { ...prev, showPicker: true, currentIndex: nextIdx };
          updatePersistedSession(updated);
          return updated;
        });
        scrollToMessageRef.current('bottom');
      }, getRemainingQueueDelay(QUIZ_PICKER_REVEAL_BUFFER_MS));
    }
  }, [quizSession, insertUserMessage, missions, siteSettings, insertNpcMessage, updatePersistedSession, getRemainingQueueDelay]);
  const resolveFocusedMissionState = useCallback((
    missionId: string,
    data?: {
      description?: string;
      gpsConfig?: MissionListItem['gpsConfig'];
      imageUrl?: string;
      kind?: MissionListItem['kind'];
      title?: string;
    },
    baseMission?: FocusedMissionState | null
  ): FocusedMissionState => {
    const resolved = missions.find((item) => item._id === missionId);
    const description = resolved?.description ?? baseMission?.description ?? data?.description;
    const gpsConfig = resolved?.gpsConfig ?? baseMission?.gpsConfig ?? data?.gpsConfig;
    const imageUrl = resolved?.imageUrl ?? baseMission?.imageUrl ?? data?.imageUrl;

    return {
      _id: missionId,
      ...(description ? { description } : {}),
      ...(gpsConfig ? { gpsConfig } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      kind: resolved?.kind ?? baseMission?.kind ?? data?.kind ?? 'text',
      title: resolved?.title ?? baseMission?.title ?? data?.title ?? 'Mission',
    };
  }, [missions]);

  const completeMission = useCallback(async (missionId: string, result: any) => {
    const mission = resolveMissionForCompletion({
      activeMission,
      focusedMission,
      missionId,
      missions,
      persistedSessions,
      quizSession,
      result,
    });
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
    
    const shouldInsertSubmissionBubble = mission.kind !== 'quiz';
    const optimisticPayload =
      mission.kind === 'photo'
        ? {
            ...(result?.localUri ? { photoUrl: result.localUri } : {}),
            ...(typeof result?.uploadProgress === 'number' ? { uploadProgress: result.uploadProgress } : {}),
          }
        : result;
    const virtualBundle: NarrativeBundleDto | null = shouldInsertSubmissionBubble
      ? {
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
                payload: optimisticPayload,
                status: 'sending',
                submissionId: idempotencyId,
              },
              messageId: `${idempotencyId}-msg`,
              isUser: true,
            },
          ],
          releaseAt: new Date().toISOString(),
          title: 'Meine Einsendung',
        }
      : null;

    if (virtualBundle) {
      upsertOptimisticBundle(virtualBundle);
      void persistBundleToActorChannel(virtualBundle);
    }
    
    const shouldHoldQuizResult = mission.kind === 'quiz';

    // Non-quiz missions can clear their focus immediately. Quiz missions keep
    // their layout context until the result card has finished presenting.
    if (!shouldHoldQuizResult) {
      setFocusedMissionId(null);
      setFocusedMission(null);
      setFocusedMissionChannel(null);
      if (user) {
        await AsyncStorage.removeItem(buildMissionFocusKey(user.id, selectedMode));
      }
    }

    // 3. Submit to API using the clean ID
    try {
      let apiResult: any;
      let resolvedPhotoPath: string | undefined;
      if (mission.kind === 'photo' && typeof result?.upload === 'function') {
        resolvedPhotoPath = await result.upload((progress: number) => {
          if (!virtualBundle) {
            return;
          }
          const submissionAttachment = virtualBundle.messages[0].attachment;
          if (!submissionAttachment || submissionAttachment._type !== 'submissionAttachment') {
            return;
          }

          const progressBundle = {
            ...virtualBundle,
            messages: [
              {
                ...virtualBundle.messages[0],
                attachment: {
                  ...submissionAttachment,
                  payload: {
                    ...submissionAttachment.payload,
                    uploadProgress: progress,
                  },
                },
              },
            ],
          };
          upsertOptimisticBundle(progressBundle);
          void persistBundleToActorChannel(progressBundle);
        });
      }
      if (mission.kind === 'text') {
        apiResult = await submitTextMission(cleanMissionId, result.text, selectedMode, channelMeta);
      } else if (mission.kind === 'photo') {
        apiResult = await submitPhotoMission(cleanMissionId, resolvedPhotoPath ?? result.photoPath, selectedMode, channelMeta);
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

      const moderatorNote =
        typeof apiResult?.moderatorNote === 'string' && apiResult.moderatorNote.trim().length > 0
          ? apiResult.moderatorNote.trim()
          : undefined;

      if (virtualBundle) {
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
                moderatorNote,
                payload: {
                  ...submissionAttachment.payload,
                  ...apiResult,
                  ...(resolvedPhotoPath ? { photoPath: resolvedPhotoPath } : {}),
                },
              },
            },
          ],
        };
        upsertOptimisticBundle(updatedBundle);
        void persistBundleToActorChannel(updatedBundle);
      }

      if (finalStatus === 'pending') {
        insertSystemMessage('Dein Beitrag wird geprüft', 120, 'neutral');
      }

      const showCard =
        isImmediateMissionCompletion ||
        typeof apiResult?.earned === 'number' ||
        mission.kind === 'quiz' ||
        mission.kind === 'gps';
      
      const resultRevealDelayMs = moderatorNote ? 1200 : 180;

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
          releaseOffsetMs: resultRevealDelayMs,
        });
      }

      removeMissionSession(cleanMissionId);
      scrollToMessageRef.current('bottom');

      if (shouldHoldQuizResult) {
        await new Promise((resolve) => setTimeout(resolve, (showCard ? resultRevealDelayMs : 0) + QUIZ_RESULT_CARD_HOLD_MS));
        removePersistedSession(cleanMissionId);
        setQuizSession((prev) => (prev?.missionId === cleanMissionId ? null : prev));
      }

      await setFocus(null);

    } catch (err) {
      console.error('[ActiveMission] Submission failed:', err);
      const errorMessage = describeMissionSubmissionError(err);
      const errorDetails = extractMissionSubmissionErrorDetails(err);
      if (!virtualBundle) {
        insertSystemMessage(errorMessage, 0, 'neutral');
        if (mission.kind === 'quiz') {
          removePersistedSession(cleanMissionId);
          removeMissionSession(cleanMissionId);
          setQuizSession((prev) => (prev?.missionId === cleanMissionId ? null : prev));
          await setFocus(null);
        }
        return;
      }

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
              payload: buildSubmissionErrorPayload(
                submissionAttachment.payload,
                errorDetails,
                errorMessage,
              ),
            },
          },
        ],
      };
      upsertOptimisticBundle(errorBundle);
      void persistBundleToActorChannel(errorBundle);

      if (mission.kind === 'quiz') {
        removePersistedSession(cleanMissionId);
        removeMissionSession(cleanMissionId);
        setQuizSession((prev) => (prev?.missionId === cleanMissionId ? null : prev));
        await setFocus(null);
      }
    }
  }, [activeMission, focusedMission, missions, persistedSessions, quizSession, selectedMode, upsertOptimisticBundle, user, insertMessageBundle, insertSystemMessage, persistBundleToActorChannel, removeMissionSession, removePersistedSession, setFocus]);

  const retryMissionSubmission = useCallback(async ({
    kind,
    missionId,
    missionTitle,
    payload,
    submissionId,
  }: {
    kind: MissionListItem['kind'];
    missionId?: string;
    missionTitle: string;
    payload: any;
    submissionId: string;
  }) => {
    if (kind !== 'photo' || !missionId || !user?.id) {
      return;
    }

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

    const basePayload = sanitizeSubmissionPayload(payload);
    const localPhotoUri = resolveRetryLocalPhotoUri(payload);
    const storageAvailability = getFirebaseStorageAvailability();

    const publishRetryBundle = (
      status: 'sending' | 'pending' | 'approved' | 'rejected' | 'error',
      nextPayload: any,
      moderatorNote?: string,
    ) => {
      const bundle = buildSubmissionBundle({
        kind,
        missionId,
        missionTitle,
        moderatorNote,
        payload: nextPayload,
        status,
        submissionId,
        userName: user.displayName || 'Ich',
      });
      upsertOptimisticBundle(bundle);
      void persistBundleToActorChannel(bundle);
      return bundle;
    };

    if (!storageAvailability.available) {
      publishRetryBundle(
        'error',
        buildSubmissionErrorPayload(
          basePayload,
          storageAvailability.message,
          'Fehler',
        ),
      );
      return;
    }

    if (!localPhotoUri) {
      publishRetryBundle(
        'error',
        buildSubmissionErrorPayload(
          basePayload,
          'Kein lokales Foto fuer die Wiederholung verfuegbar.',
          'Fehler',
        ),
      );
      return;
    }

    publishRetryBundle('sending', {
      ...basePayload,
      photoUrl: localPhotoUri,
      uploadProgress: 0,
    });

    try {
      const resolvedPhotoPath = await uploadMissionPhoto({
        localUri: localPhotoUri,
        missionId,
        onProgress: (progress) => {
          publishRetryBundle('sending', {
            ...basePayload,
            photoUrl: localPhotoUri,
            uploadProgress: progress,
          });
        },
        userId: user.id,
      });

      const apiResult: any = await submitPhotoMission(
        missionId,
        resolvedPhotoPath,
        selectedMode,
        channelMeta,
      );

      const isImmediateMissionCompletion =
        apiResult?.action === 'scored' ||
        apiResult?.action === 'already_completed';
      const finalStatus = isImmediateMissionCompletion ? 'approved' : 'pending';
      const moderatorNote =
        typeof apiResult?.moderatorNote === 'string' && apiResult.moderatorNote.trim().length > 0
          ? apiResult.moderatorNote.trim()
          : undefined;

      publishRetryBundle(
        finalStatus,
        {
          ...basePayload,
          ...apiResult,
          photoPath: resolvedPhotoPath,
          photoUrl: localPhotoUri,
        },
        moderatorNote,
      );

      if (finalStatus === 'pending') {
        insertSystemMessage('Dein Beitrag wird geprüft', 120, 'neutral');
      }

      const showCard =
        isImmediateMissionCompletion ||
        typeof apiResult?.earned === 'number';
      const resultRevealDelayMs = moderatorNote ? 1200 : 180;

      if (showCard) {
        insertMessageBundle({
          actor: { name: 'System' },
          attachment: {
            _type: 'missionResultAttachment',
            missionId,
            missionTitle,
            kind,
            payload: apiResult,
            earnedPoints: apiResult?.earned,
          },
          isSystem: true,
          releaseOffsetMs: resultRevealDelayMs,
        });
      }

      scrollToMessageRef.current('bottom');
    } catch (error) {
      console.error('[ActiveMission] Retry submission failed:', error);
      const errorMessage = describeMissionSubmissionError(error);
      const errorDetails = extractMissionSubmissionErrorDetails(error);

      publishRetryBundle(
        'error',
        buildSubmissionErrorPayload(
          {
            ...basePayload,
            photoUrl: localPhotoUri,
          },
          errorDetails,
          errorMessage,
        ),
      );
    }
  }, [insertMessageBundle, insertSystemMessage, persistBundleToActorChannel, selectedMode, upsertOptimisticBundle, user?.displayName, user?.id]);

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

  const openMissionSession = useCallback(async (missionId: string) => {
    const session = missionSessions[missionId];
    if (!session) {
      return false;
    }

    if (session.kind === 'quiz') {
      if (!session.actor) {
        return false;
      }

      await startChatQuiz(missionId, session.actor, session.data);
      return true;
    }

    setFocusedMission(resolveFocusedMissionState(missionId, session.data, focusedMission));
    await setFocus(missionId, session.channel);
    return true;
  }, [focusedMission, missionSessions, resolveFocusedMissionState, setFocus, startChatQuiz]);

  const startMission = useCallback(async (
    missionId: string,
    actor?: NarrativeMessageDto['actor'],
    data?: {
      description?: string;
      gpsConfig?: MissionListItem['gpsConfig'];
      imageUrl?: string;
      kind?: MissionListItem['kind'];
      title?: string;
    }
  ) => {
    const resolvedMission = resolveFocusedMissionState(missionId, data);
    const focusChannel = resolveFocusedMissionChannel(activeChannelRef.current);

    upsertMissionSession({
      ...(actor ? { actor } : {}),
      channel: focusChannel,
      data: {
        description: resolvedMission.description,
        ...(resolvedMission.gpsConfig ? { gpsConfig: resolvedMission.gpsConfig } : {}),
        ...(resolvedMission.imageUrl ? { imageUrl: resolvedMission.imageUrl } : {}),
        ...(data?.kind ? { kind: data.kind } : {}),
        title: resolvedMission.title,
      },
      kind: resolvedMission.kind,
      missionId,
      updatedAt: Date.now(),
    });

    setFocusedMission(resolvedMission);

    await setFocus(missionId, focusChannel);

    if (actor && activeChannelRef.current.channelType === 'actor') {
      const introText = resolvedMission.description
        ? `${resolvedMission.title}\n\n${resolvedMission.description}`
        : resolvedMission.title;

      insertNpcMessage(
        actor,
        introText,
        resolvedMission.imageUrl
          ? {
              _type: 'imageAttachment',
              caption: resolvedMission.title,
              url: resolvedMission.imageUrl,
            }
          : undefined,
        120
      );
    }

    scrollToMessageRef.current('bottom');
  }, [insertNpcMessage, resolveFocusedMissionChannel, resolveFocusedMissionState, setFocus, upsertMissionSession]);

  const value = useMemo(
    () => ({ 
      activeMission, 
      activeChannel,
      availableMissions,
      focusedMission,
      focusedMissionChannel,
      focusedMissionId,
      isLoading,
      missionSessions,
      openMissionSession,
      setFocus,
      startMission,
      completeMission,
      retryMissionSubmission,
      scrollToMessage,
      highlightedMissionId,
      highlightMission,
      registerScrollHandler,
      registerOptimisticHandler,
      resetMissionState,
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
      focusedMission,
      focusedMissionChannel,
      focusedMissionId, 
      isLoading, 
      missionSessions,
      highlightedMissionId, 
      openMissionSession,
      quizSession, 
      persistedSessions,
      pauseQuiz,
      startChatQuiz,
      submitQuizStep,
      retryMissionSubmission,
      completeMission,
      insertQuizAnswerBubble,
      scrollToMessage,
      setFocus,
      startMission,
      highlightMission,
      registerScrollHandler,
      registerOptimisticHandler,
      resetMissionState,
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

function parseStoredFocusState(value: string): { channel: FocusedMissionChannelState | null; missionId: string } | null {
  try {
    const parsed = JSON.parse(value) as {
      channelId?: unknown;
      channelType?: unknown;
      missionId?: unknown;
    };

    if (typeof parsed?.missionId !== 'string' || parsed.missionId.trim().length === 0) {
      return null;
    }

    return {
      channel:
        typeof parsed.channelId === 'string' &&
        parsed.channelId.trim().length > 0 &&
        (parsed.channelType === 'hub' || parsed.channelType === 'actor')
          ? {
              channelId: parsed.channelId,
              channelType: parsed.channelType,
            }
          : null,
      missionId: parsed.missionId,
    };
  } catch {
    return value.trim().length > 0
      ? {
          channel: null,
          missionId: value,
        }
      : null;
  }
}

function resolveMissionForCompletion({
  activeMission,
  focusedMission,
  missionId,
  missions,
  persistedSessions,
  quizSession,
  result,
}: {
  activeMission: MissionListItem | null;
  focusedMission: FocusedMissionState | null;
  missionId: string;
  missions: MissionListItem[];
  persistedSessions: Record<string, QuizSession>;
  quizSession: QuizSession | null;
  result: any;
}): Pick<MissionListItem, '_id' | 'kind' | 'title'> | null {
  const cachedMission = missions.find((mission) => mission._id === missionId);
  if (cachedMission) {
    return cachedMission;
  }

  if (activeMission?._id === missionId) {
    return {
      _id: activeMission._id,
      kind: activeMission.kind,
      title: activeMission.title,
    };
  }

  if (focusedMission?._id === missionId) {
    return {
      _id: focusedMission._id,
      kind: focusedMission.kind,
      title: focusedMission.title,
    };
  }

  const session = quizSession?.missionId === missionId ? quizSession : persistedSessions[missionId];
  if (session) {
    return {
      _id: missionId,
      kind: 'quiz',
      title: session.missionTitle,
    };
  }

  if (Array.isArray(result)) {
    return { _id: missionId, kind: 'quiz', title: 'Mission' };
  }
  if (result && typeof result === 'object' && typeof result.photoPath === 'string') {
    return { _id: missionId, kind: 'photo', title: 'Mission' };
  }
  if (result && typeof result === 'object' && typeof result.text === 'string') {
    return { _id: missionId, kind: 'text', title: 'Mission' };
  }
  if (result && typeof result === 'object' && result.action === 'checkin') {
    return { _id: missionId, kind: 'gps', title: 'Mission' };
  }

  return null;
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

function buildSubmissionBundle(params: {
  kind: MissionListItem['kind'];
  missionId?: string;
  missionTitle: string;
  moderatorNote?: string;
  payload: any;
  status: 'sending' | 'pending' | 'approved' | 'rejected' | 'error';
  submissionId: string;
  userName: string;
}): NarrativeBundleDto {
  return {
    _id: params.submissionId,
    isUser: true,
    messages: [
      {
        actor: { name: params.userName },
        attachment: {
          _type: 'submissionAttachment',
          kind: params.kind as any,
          missionTitle: params.missionTitle,
          ...(params.missionId ? { missionId: params.missionId } : {}),
          ...(params.moderatorNote ? { moderatorNote: params.moderatorNote } : {}),
          payload: params.payload,
          status: params.status,
          submissionId: params.submissionId,
        },
        messageId: `${params.submissionId}-msg`,
        isUser: true,
      },
    ],
    releaseAt: new Date().toISOString(),
    title: 'Meine Einsendung',
  };
}

function sanitizeSubmissionPayload(payload: unknown) {
  if (typeof payload === 'string') {
    return { photoPath: payload };
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const {
    errorDetails: _errorDetails,
    errorMessage: _errorMessage,
    uploadProgress: _uploadProgress,
    ...rest
  } = payload as Record<string, unknown>;

  return rest;
}

function buildSubmissionErrorPayload(
  payload: unknown,
  errorDetails: string,
  errorMessage: string,
) {
  return {
    ...sanitizeSubmissionPayload(payload),
    errorDetails,
    errorMessage,
  };
}

function describeMissionSubmissionError(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Uebertragung fehlgeschlagen.';
  }

  const rawMessage = error.message.trim();
  if (!rawMessage) {
    return 'Uebertragung fehlgeschlagen.';
  }

  if (/timed out/i.test(rawMessage)) {
    return 'Zeitueberschreitung beim Senden.';
  }

  if (/network|internet|offline/i.test(rawMessage)) {
    return 'Netzwerkfehler beim Senden.';
  }

  const failureMatch = rawMessage.match(/failed \(\d+\):\s*(.+)$/i);
  const candidate = failureMatch ? failureMatch[1].trim() : rawMessage;
  const parsedMessage = parseSubmissionErrorMessage(candidate);
  if (parsedMessage) {
    return parsedMessage;
  }

  return ensureErrorSentence(rawMessage) ?? 'Uebertragung fehlgeschlagen.';
}

function extractMissionSubmissionErrorDetails(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }

  try {
    const serialized = JSON.stringify(error);
    return typeof serialized === 'string' && serialized.length > 0
      ? serialized
      : 'Unbekannter Fehler.';
  } catch {
    return 'Unbekannter Fehler.';
  }
}

function parseSubmissionErrorMessage(value: string) {
  if (!value) {
    return null;
  }

  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value) as { error?: unknown; message?: unknown };
      if (typeof parsed.error === 'string') {
        return ensureErrorSentence(parsed.error);
      }
      if (typeof parsed.message === 'string') {
        return ensureErrorSentence(parsed.message);
      }
    } catch {
      return ensureErrorSentence(value);
    }
  }

  return ensureErrorSentence(value);
}

function ensureErrorSentence(value: string) {
  const cleaned = value.replace(/^Error:\s*/i, '').trim();
  if (!cleaned) {
    return null;
  }

  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}
