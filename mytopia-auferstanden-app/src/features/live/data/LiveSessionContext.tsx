import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View } from 'react-native';

import { getForegroundLocationPermissionStatus } from '@/src/core/location/locationPermissionClient';
import { useSession } from '@/src/core/session/SessionContext';
import type { AppMode } from '@/src/core/session/appMode';
import { TerrorAlertOverlay } from '@/src/features/live/components/TerrorAlertOverlay';
import {
  fetchActiveLiveSession,
  joinLiveSession,
  sendLiveHeartbeat,
  subscribeLiveEvent,
  subscribeLiveSession,
  type LiveEventDto,
  type LiveSessionDto,
} from '@/src/features/live/data/liveSessionClient';

type LiveConnectionStatus = 'connecting' | 'connected' | 'offline';

type LiveSessionContextValue = {
  activeEvent: LiveEventDto | null;
  connectionStatus: LiveConnectionStatus;
  errorMessage: string | null;
  isJoined: boolean;
  joinFromQr: (params: { mode?: AppMode; sessionId: string; token: string }) => Promise<void>;
  session: LiveSessionDto | null;
};

const LiveSessionContext = createContext<LiveSessionContextValue | undefined>(undefined);

const STORAGE_KEY_BASE = 'mytopia_live_session';
const HEARTBEAT_INTERVAL_MS = 15_000;

export function LiveSessionProvider({ children }: PropsWithChildren) {
  const { isHydrated, selectedMode, shouldShowWelcomeBack, user } = useSession();
  const [activeEvent, setActiveEvent] = useState<LiveEventDto | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<LiveConnectionStatus>('offline');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [joinedSessionId, setJoinedSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<LiveSessionDto | null>(null);
  const autoAttemptKeyRef = useRef<string | null>(null);

  const storageKey = user ? buildStorageKey(user.id, selectedMode) : null;

  const clearJoinedSession = useCallback(() => {
    if (storageKey) {
      void AsyncStorage.removeItem(storageKey).catch(() => undefined);
    }
    setActiveEvent(null);
    setErrorMessage(null);
    setJoinedSessionId(null);
    setSession(null);
    setConnectionStatus('offline');
  }, [storageKey]);

  useEffect(() => {
    setActiveEvent(null);
    setErrorMessage(null);
    setSession(null);
    setJoinedSessionId(null);

    if (!storageKey || !isHydrated || !user || shouldShowWelcomeBack) {
      return;
    }

    AsyncStorage.getItem(storageKey)
      .then((storedSessionId) => {
        if (storedSessionId) {
          setJoinedSessionId(storedSessionId);
          setConnectionStatus('connecting');
        }
      })
      .catch(() => undefined);
  }, [isHydrated, shouldShowWelcomeBack, storageKey, user]);

  useEffect(() => {
    if (!storageKey || !isHydrated || !user || shouldShowWelcomeBack || joinedSessionId) {
      return;
    }

    const attemptKey = `${user.id}:${selectedMode}`;
    if (autoAttemptKeyRef.current === attemptKey) {
      return;
    }
    autoAttemptKeyRef.current = attemptKey;

    let cancelled = false;
    void tryAutoCheckIn(selectedMode)
      .then(async (autoSession) => {
        if (cancelled || !autoSession) return;
        await AsyncStorage.setItem(storageKey, autoSession.sessionId);
        setJoinedSessionId(autoSession.sessionId);
        setSession(autoSession);
        setConnectionStatus('connecting');
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isHydrated, joinedSessionId, selectedMode, shouldShowWelcomeBack, storageKey, user]);

  useEffect(() => {
    if (!joinedSessionId || !user || shouldShowWelcomeBack) {
      return;
    }

    setConnectionStatus('connecting');
    return subscribeLiveSession({
      listener: (nextSession) => {
        if (!nextSession || !isActiveLiveSession(nextSession)) {
          clearJoinedSession();
          return;
        }
        setSession(nextSession);
        setConnectionStatus('connected');
        if (!nextSession?.currentEventId) {
          setActiveEvent(null);
        }
      },
      onError: (error) => {
        setConnectionStatus('offline');
        setErrorMessage(describeError(error));
      },
      sessionId: joinedSessionId,
    });
  }, [clearJoinedSession, joinedSessionId, shouldShowWelcomeBack, user]);

  useEffect(() => {
    if (!joinedSessionId || !session?.currentEventId) {
      setActiveEvent(null);
      return;
    }

    return subscribeLiveEvent({
      eventId: session.currentEventId,
      listener: (event) => {
        setActiveEvent(event?.status === 'active' && event.type === 'terror_alert' ? event : null);
      },
      onError: (error) => {
        setConnectionStatus('offline');
        setErrorMessage(describeError(error));
      },
      sessionId: joinedSessionId,
    });
  }, [joinedSessionId, session?.currentEventId]);

  useEffect(() => {
    if (!joinedSessionId || connectionStatus !== 'connected') {
      return;
    }

    const sendHeartbeat = () => {
      void sendLiveHeartbeat(joinedSessionId).catch((error) => {
        if (isTerminalLiveSessionError(error)) {
          clearJoinedSession();
          return;
        }
        setConnectionStatus('offline');
        setErrorMessage(describeError(error));
      });
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sendHeartbeat();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [clearJoinedSession, connectionStatus, joinedSessionId]);

  const joinFromQr = useCallback(async ({
    mode,
    sessionId,
    token,
  }: {
    mode?: AppMode;
    sessionId: string;
    token: string;
  }) => {
    const targetMode = mode ?? selectedMode;
    setConnectionStatus('connecting');
    setErrorMessage(null);
    const nextSession = await joinLiveSession({
      mode: targetMode,
      sessionId,
      token,
    });
    const nextStorageKey = user ? buildStorageKey(user.id, targetMode) : null;
    if (nextStorageKey) {
      await AsyncStorage.setItem(nextStorageKey, nextSession.sessionId);
    }
    setJoinedSessionId(nextSession.sessionId);
    setSession(nextSession);
  }, [selectedMode, user]);

  const value = useMemo<LiveSessionContextValue>(() => ({
    activeEvent,
    connectionStatus,
    errorMessage,
    isJoined: Boolean(joinedSessionId),
    joinFromQr,
    session,
  }), [activeEvent, connectionStatus, errorMessage, joinedSessionId, joinFromQr, session]);

  return (
    <LiveSessionContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {activeEvent ? <TerrorAlertOverlay event={activeEvent} /> : null}
      </View>
    </LiveSessionContext.Provider>
  );
}

export function useLiveSession() {
  const context = useContext(LiveSessionContext);
  if (!context) {
    throw new Error('useLiveSession must be used inside LiveSessionProvider');
  }
  return context;
}

async function tryAutoCheckIn(mode: AppMode) {
  const activeSession = await fetchActiveLiveSession(mode);
  if (!activeSession) {
    return null;
  }

  const permission = await getForegroundLocationPermissionStatus();
  if (permission !== 'granted') {
    return null;
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return joinLiveSession({
    joinMethod: 'auto-gps-time',
    location: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    },
    mode,
    sessionId: activeSession.sessionId,
  });
}

function buildStorageKey(uid: string, mode: AppMode) {
  return `${STORAGE_KEY_BASE}:${uid}:${mode}`;
}

function isActiveLiveSession(session: LiveSessionDto) {
  if (session.status !== 'active') {
    return false;
  }
  if (!session.endsAt) {
    return true;
  }
  const endsAt = new Date(session.endsAt).getTime();
  return Number.isNaN(endsAt) || endsAt >= Date.now();
}

function isTerminalLiveSessionError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes('(403)') || error.message.includes('(404)');
}

function describeError(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Live-Verbindung konnte nicht hergestellt werden.';
}
