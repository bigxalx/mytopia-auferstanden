import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View } from 'react-native';

import {
  getForegroundLocationPermissionStatus,
  requestForegroundLocationPermission,
} from '@/src/core/location/locationPermissionClient';
import { useSession } from '@/src/core/session/SessionContext';
import type { AppMode } from '@/src/core/session/appMode';
import { TerrorAlertOverlay } from '@/src/features/live/components/TerrorAlertOverlay';
import {
  fetchLiveAvailability,
  fetchActiveLiveSession,
  joinLiveSession,
  leaveLiveSession,
  subscribeLiveEvent,
  subscribeLiveSession,
  type LiveEventDto,
  type LiveAvailabilityDto,
  type LiveSessionDto,
} from '@/src/features/live/data/liveSessionClient';

type LiveConnectionStatus = 'connecting' | 'connected' | 'offline';
type LiveQrJoinResult =
  | { state: 'joined'; session: LiveSessionDto }
  | { nextWindow: LiveAvailabilityDto['nextWindow']; state: 'upcoming' }
  | { state: 'unavailable' };
type LivePromptJoinResult =
  | { state: 'joined'; session: LiveSessionDto }
  | { state: 'needs-location-permission' }
  | { state: 'outside-venue' }
  | { message: string; state: 'error' }
  | { state: 'unavailable' };

type LiveSessionContextValue = {
  activeEvent: LiveEventDto | null;
  availableSession: LiveSessionDto | null;
  connectionStatus: LiveConnectionStatus;
  disconnectLiveSession: () => Promise<void>;
  errorMessage: string | null;
  isGpsBypassEnabled: boolean;
  isJoined: boolean;
  joinAvailableSession: () => Promise<LivePromptJoinResult>;
  joinFromQr: (params: { mode?: AppMode; sessionId: string; token: string }) => Promise<LiveQrJoinResult>;
  session: LiveSessionDto | null;
};

const LiveSessionContext = createContext<LiveSessionContextValue | undefined>(undefined);

const LIVE_SESSION_MODE: AppMode = 'production';
const STORAGE_KEY_BASE = 'mytopia_live_session';
const LIVE_AVAILABILITY_REFRESH_MS = 15_000;
const STALE_SNAPSHOT_GRACE_MS = 15_000;
const LIVE_PROMPT_LOCATION_MARGIN_METERS = 35;

export function LiveSessionProvider({ children }: PropsWithChildren) {
  const { isHydrated, selectedMode, shouldShowWelcomeBack, user } = useSession();
  const [activeEvent, setActiveEvent] = useState<LiveEventDto | null>(null);
  const [availableSession, setAvailableSession] = useState<LiveSessionDto | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<LiveConnectionStatus>('offline');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [joinedSessionId, setJoinedSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<LiveSessionDto | null>(null);
  const lastJoinAtMsRef = useRef<number | null>(null);
  const latestSessionRef = useRef<LiveSessionDto | null>(null);

  const storageKey = user ? buildStorageKey(user.id, LIVE_SESSION_MODE) : null;
  const isGpsBypassEnabled = selectedMode === 'dev';

  useEffect(() => {
    latestSessionRef.current = session;
  }, [session]);

  const clearJoinedSession = useCallback((reason = 'unspecified') => {
    logLiveContextDebug('clear joined session', {
      reason,
      liveMode: LIVE_SESSION_MODE,
      sessionId: joinedSessionId,
    });
    if (storageKey) {
      void AsyncStorage.removeItem(storageKey).catch(() => undefined);
    }
    lastJoinAtMsRef.current = null;
    latestSessionRef.current = null;
    setActiveEvent(null);
    setAvailableSession(null);
    setErrorMessage(null);
    setJoinedSessionId(null);
    setSession(null);
    setConnectionStatus('offline');
  }, [joinedSessionId, storageKey]);

  useEffect(() => {
    setActiveEvent(null);
    setAvailableSession(null);
    setErrorMessage(null);
    setSession(null);
    setJoinedSessionId(null);
    lastJoinAtMsRef.current = null;
    latestSessionRef.current = null;
    logLiveContextDebug('hydrate session state reset', {
      isHydrated,
      liveMode: LIVE_SESSION_MODE,
      user: Boolean(user),
    });

    if (!storageKey || !isHydrated || !user || shouldShowWelcomeBack) {
      return;
    }

    AsyncStorage.getItem(storageKey)
      .then((storedSessionId) => {
        if (storedSessionId) {
          logLiveContextDebug('restored stored live session', { liveMode: LIVE_SESSION_MODE, storedSessionId });
          setJoinedSessionId(storedSessionId);
          setConnectionStatus('connecting');
        }
      })
      .catch(() => undefined);
  }, [isHydrated, shouldShowWelcomeBack, storageKey, user]);

  const refreshAvailableSession = useCallback(async () => {
    if (!isHydrated || !user || shouldShowWelcomeBack || joinedSessionId) {
      setAvailableSession(null);
      return;
    }

    const activeSession = await fetchActiveLiveSession(LIVE_SESSION_MODE);
    if (!activeSession || !isActiveLiveSession(activeSession)) {
      setAvailableSession(null);
      return;
    }

    const shouldShowPrompt = isGpsBypassEnabled || await shouldShowAvailableSessionPrompt(activeSession);
    setAvailableSession(shouldShowPrompt ? activeSession : null);
  }, [isGpsBypassEnabled, isHydrated, joinedSessionId, shouldShowWelcomeBack, user]);

  useEffect(() => {
    if (!isHydrated || !user || shouldShowWelcomeBack || joinedSessionId) {
      setAvailableSession(null);
      return;
    }

    let cancelled = false;
    const refresh = () => {
      void refreshAvailableSession().catch((error) => {
        if (!cancelled) {
          logLiveContextDebug('available session refresh failed', { message: describeError(error) });
        }
      });
    };

    refresh();
    const interval = setInterval(refresh, LIVE_AVAILABILITY_REFRESH_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
      }
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.remove();
    };
  }, [isHydrated, joinedSessionId, refreshAvailableSession, shouldShowWelcomeBack, user]);

  useEffect(() => {
    if (!joinedSessionId || !user || shouldShowWelcomeBack) {
      return;
    }

    setConnectionStatus('connecting');
    logLiveContextDebug('subscribe live session', { sessionId: joinedSessionId });
    return subscribeLiveSession({
      listener: (nextSession) => {
        if (!nextSession || !isActiveLiveSession(nextSession)) {
          const latestSession = latestSessionRef.current;
          if (shouldIgnoreInactiveSnapshot({
            joinedSessionId,
            lastJoinAtMs: lastJoinAtMsRef.current,
            latestSession,
            nextSession,
          })) {
            logLiveContextDebug('ignored stale inactive session snapshot', {
              latestEndsAt: latestSession?.endsAt,
              latestStatus: latestSession?.status,
              latestUpdatedAt: latestSession?.updatedAt,
              nextEndsAt: nextSession?.endsAt,
              nextStatus: nextSession?.status,
              nextUpdatedAt: nextSession?.updatedAt,
              sessionId: joinedSessionId,
            });
            return;
          }
          logLiveContextDebug('session snapshot inactive or missing', {
            exists: Boolean(nextSession),
            endsAt: nextSession?.endsAt,
            sessionId: joinedSessionId,
            status: nextSession?.status,
            updatedAt: nextSession?.updatedAt,
          });
          clearJoinedSession('session snapshot inactive or missing');
          return;
        }
        logLiveContextDebug('session snapshot active', {
          currentEventId: nextSession.currentEventId,
          endsAt: nextSession.endsAt,
          sessionId: joinedSessionId,
          status: nextSession.status,
          updatedAt: nextSession.updatedAt,
        });
        latestSessionRef.current = nextSession;
        setSession(nextSession);
        setConnectionStatus('connected');
        if (!nextSession?.currentEventId) {
          setActiveEvent(null);
        }
      },
      onError: (error) => {
        logLiveContextDebug('session subscription error', { message: describeError(error) });
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
        logLiveContextDebug('event snapshot', {
          eventId: session.currentEventId,
          status: event?.status,
          type: event?.type,
        });
        setActiveEvent(event?.status === 'active' && event.type === 'terror_alert' ? event : null);
      },
      onError: (error) => {
        logLiveContextDebug('event subscription error', { message: describeError(error) });
        setConnectionStatus('offline');
        setErrorMessage(describeError(error));
      },
      sessionId: joinedSessionId,
    });
  }, [joinedSessionId, session?.currentEventId]);

  const joinFromQr = useCallback(async ({
    mode,
    sessionId,
    token,
  }: {
    mode?: AppMode;
    sessionId: string;
    token: string;
  }) => {
    const targetMode = LIVE_SESSION_MODE;
    logLiveContextDebug('qr join start', {
      liveMode: LIVE_SESSION_MODE,
      requestedMode: mode,
      sessionId,
      targetMode,
      tokenLength: token.length,
    });
    setConnectionStatus('connecting');
    setErrorMessage(null);
    const availability = await fetchLiveAvailability({
      mode: targetMode,
      sessionId,
      token,
    });
    logLiveContextDebug('availability response', {
      hasCurrentWindow: Boolean(availability.currentWindow),
      hasNextWindow: Boolean(availability.nextWindow),
      hasSession: Boolean(availability.session),
      state: availability.state,
    });

    if (availability.state !== 'active') {
      clearJoinedSession(`availability ${availability.state}`);
      if (availability.state === 'upcoming') {
        return { nextWindow: availability.nextWindow ?? null, state: 'upcoming' as const };
      }
      return { state: 'unavailable' as const };
    }

    const nextSession = await joinLiveSession({
      mode: targetMode,
      sessionId,
      token,
    });
    logLiveContextDebug('qr join response', {
      endsAt: nextSession.endsAt,
      sessionId: nextSession.sessionId,
      status: nextSession.status,
    });
    const nextStorageKey = user ? buildStorageKey(user.id, targetMode) : null;
    if (nextStorageKey) {
      await AsyncStorage.setItem(nextStorageKey, nextSession.sessionId);
    }
    lastJoinAtMsRef.current = Date.now();
    latestSessionRef.current = nextSession;
    setJoinedSessionId(nextSession.sessionId);
    setSession(nextSession);
    return { session: nextSession, state: 'joined' as const };
  }, [clearJoinedSession, user]);

  const joinAvailableSession = useCallback(async (): Promise<LivePromptJoinResult> => {
    if (!availableSession || !user) {
      await refreshAvailableSession();
      return { state: 'unavailable' };
    }

    setConnectionStatus('connecting');
    setErrorMessage(null);

    try {
      const position = isGpsBypassEnabled ? null : await getLiveJoinPosition();
      if (!isGpsBypassEnabled && !position) {
        setConnectionStatus('offline');
        return { state: 'needs-location-permission' };
      }
      const location = resolveJoinLocation(availableSession, position, isGpsBypassEnabled);
      if (!location) {
        setConnectionStatus('offline');
        return { state: 'outside-venue' };
      }
      const nextSession = await joinLiveSession({
        joinMethod: 'auto-gps-time',
        location,
        mode: LIVE_SESSION_MODE,
        sessionId: availableSession.sessionId,
      });
      const nextStorageKey = buildStorageKey(user.id, LIVE_SESSION_MODE);
      await AsyncStorage.setItem(nextStorageKey, nextSession.sessionId);
      lastJoinAtMsRef.current = Date.now();
      latestSessionRef.current = nextSession;
      setAvailableSession(null);
      setJoinedSessionId(nextSession.sessionId);
      setSession(nextSession);
      return { session: nextSession, state: 'joined' };
    } catch (error) {
      setConnectionStatus('offline');
      const message = describeError(error);
      if (
        message.includes('Live auto check-in is not available here')
        || message.includes('(403)')
      ) {
        return { state: 'outside-venue' };
      }
      if (
        message.includes('No active live window')
        || message.includes('Live session is not active')
        || message.includes('Live session has ended')
        || message.includes('(404)')
      ) {
        await refreshAvailableSession();
        return { state: 'unavailable' };
      }
      return { message, state: 'error' };
    }
  }, [availableSession, isGpsBypassEnabled, refreshAvailableSession, user]);

  const disconnectLiveSession = useCallback(async () => {
    const sessionId = joinedSessionId;
    if (sessionId) {
      await leaveLiveSession(sessionId);
    }
    clearJoinedSession('user disconnected');
  }, [clearJoinedSession, joinedSessionId]);

  const value = useMemo<LiveSessionContextValue>(() => ({
    activeEvent,
    availableSession,
    connectionStatus,
    disconnectLiveSession,
    errorMessage,
    isGpsBypassEnabled,
    isJoined: Boolean(joinedSessionId),
    joinAvailableSession,
    joinFromQr,
    session,
  }), [
    activeEvent,
    availableSession,
    connectionStatus,
    disconnectLiveSession,
    errorMessage,
    isGpsBypassEnabled,
    joinedSessionId,
    joinAvailableSession,
    joinFromQr,
    session,
  ]);

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

async function shouldShowAvailableSessionPrompt(session: LiveSessionDto) {
  if (!hasVenueTarget(session)) {
    return true;
  }

  const permission = await getForegroundLocationPermissionStatus();
  if (permission !== 'granted') {
    return true;
  }

  const position = await getLivePromptPosition();
  if (!position) {
    return true;
  }

  const distanceMeters = getDistanceMeters(
    position.coords.latitude,
    position.coords.longitude,
    session.venueLatitude,
    session.venueLongitude
  );
  const accuracyMeters = typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
    ? position.coords.accuracy
    : 0;
  const locationToleranceMeters = Math.min(
    Math.max(accuracyMeters, LIVE_PROMPT_LOCATION_MARGIN_METERS),
    120
  );

  return distanceMeters <= session.venueRadiusMeters + locationToleranceMeters;
}

async function getLivePromptPosition() {
  try {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
  } catch {
    try {
      return await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
        requiredAccuracy: 250,
      });
    } catch {
      return null;
    }
  }
}

async function getLiveJoinPosition() {
  const permission = await requestForegroundLocationPermission();
  if (permission !== 'granted') {
    return null;
  }

  try {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
  } catch {
    return null;
  }
}

function resolveJoinLocation(
  session: LiveSessionDto,
  position: Location.LocationObject | null,
  bypassGps: boolean
) {
  if (bypassGps) {
    if (!hasVenueTarget(session)) {
      return null;
    }
    return {
      latitude: session.venueLatitude,
      longitude: session.venueLongitude,
    };
  }

  if (!position) {
    return null;
  }

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

function hasVenueTarget(
  session: LiveSessionDto
): session is LiveSessionDto & { venueLatitude: number; venueLongitude: number; venueRadiusMeters: number } {
  return (
    typeof session.venueLatitude === 'number' &&
    Number.isFinite(session.venueLatitude) &&
    typeof session.venueLongitude === 'number' &&
    Number.isFinite(session.venueLongitude) &&
    typeof session.venueRadiusMeters === 'number' &&
    Number.isFinite(session.venueRadiusMeters) &&
    session.venueRadiusMeters > 0
  );
}

function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const radius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function logLiveContextDebug(message: string, details?: Record<string, unknown>) {
  if (__DEV__) {
    console.info(`[live/context] ${message}`, details ?? {});
  }
}

function buildStorageKey(uid: string, mode: AppMode) {
  return `${STORAGE_KEY_BASE}:${uid}:${mode}`;
}

function shouldIgnoreInactiveSnapshot({
  joinedSessionId,
  lastJoinAtMs,
  latestSession,
  nextSession,
}: {
  joinedSessionId: string;
  lastJoinAtMs: number | null;
  latestSession: LiveSessionDto | null;
  nextSession: LiveSessionDto | null;
}) {
  if (!latestSession || latestSession.sessionId !== joinedSessionId || !isActiveLiveSession(latestSession)) {
    return false;
  }

  const withinJoinGrace = typeof lastJoinAtMs === 'number'
    && Date.now() - lastJoinAtMs < STALE_SNAPSHOT_GRACE_MS;

  if (!nextSession) {
    return withinJoinGrace;
  }

  if (nextSession.sessionId !== joinedSessionId || isActiveLiveSession(nextSession)) {
    return false;
  }

  const latestFreshness = liveSessionFreshnessMs(latestSession);
  const nextFreshness = liveSessionFreshnessMs(nextSession);
  if (typeof latestFreshness !== 'number' || typeof nextFreshness !== 'number') {
    return withinJoinGrace;
  }

  return nextFreshness < latestFreshness;
}

function liveSessionFreshnessMs(session: LiveSessionDto) {
  return toMillis(session.updatedAt) ?? toMillis(session.endsAt) ?? toMillis(session.startsAt);
}

function toMillis(value: string | undefined | null) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function describeError(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Live-Verbindung konnte nicht hergestellt werden.';
}
