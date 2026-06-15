import { getIdToken } from '@react-native-firebase/auth';
import * as firestore from '@react-native-firebase/firestore';

import { env, hasConfiguredFeedApi } from '@/src/config/env';
import { getCurrentFirebaseUser } from '@/src/core/firebase/authClient';
import {
  V2_COLLECTION,
  type V2LiveEventDoc,
  type V2LiveSessionDoc,
  type V2LiveShowWindowDoc,
} from '@/src/core/firestore/schema';
import type { AppMode } from '@/src/core/session/appMode';

const REQUEST_TIMEOUT_MS = 15000;

const {
  doc,
  getFirestore,
  onSnapshot,
} = firestore || {
  doc: () => null,
  getFirestore: () => null,
  onSnapshot: () => () => {},
};

export type LiveSessionDto = V2LiveSessionDoc & {
  recentParticipantCount?: number;
};

export type LiveEventDto = V2LiveEventDoc & {
  eventId: string;
};

export type LiveAvailabilityDto = {
  currentWindow?: V2LiveShowWindowDoc | null;
  nextWindow?: V2LiveShowWindowDoc | null;
  session?: LiveSessionDto | null;
  state: 'active' | 'upcoming' | 'unavailable';
};

export async function fetchActiveLiveSession(mode: AppMode): Promise<LiveSessionDto | null> {
  const payload = await liveApiRequest<{ session?: LiveSessionDto | null }>({
    method: 'GET',
    path: `live/sessions/active${mode === 'dev' ? '?mode=dev' : ''}`,
  });
  return payload.session ?? null;
}

export async function fetchLiveAvailability({
  mode,
  sessionId,
  token,
}: {
  mode: AppMode;
  sessionId: string;
  token: string;
}): Promise<LiveAvailabilityDto> {
  const params = new URLSearchParams({
    mode,
    sessionId,
    token,
  });
  logLiveClientDebug('fetch availability', { mode, sessionId, tokenLength: token.length });
  const payload = await liveApiRequest<LiveAvailabilityDto>({
    method: 'GET',
    path: `live/availability?${params.toString()}`,
  });
  logLiveClientDebug('availability fetched', {
    hasSession: Boolean(payload.session),
    state: payload.state,
  });
  return payload;
}

export async function joinLiveSession({
  joinMethod = 'qr',
  location,
  mode,
  sessionId,
  token,
}: {
  joinMethod?: 'qr' | 'auto-gps-time';
  location?: { latitude: number; longitude: number };
  mode: AppMode;
  sessionId: string;
  token?: string | null;
}): Promise<LiveSessionDto> {
  logLiveClientDebug('join request', { joinMethod, mode, sessionId, tokenLength: token?.length ?? 0 });
  const payload = await liveApiRequest<{ session?: LiveSessionDto }>({
    body: {
      joinMethod,
      ...(location ? { location } : {}),
      mode,
      sessionId,
      ...(token ? { token } : {}),
    },
    method: 'POST',
    path: 'live/join',
  });
  if (!payload.session) {
    throw new Error('Live session join response did not include a session.');
  }
  logLiveClientDebug('join response', {
    endsAt: payload.session.endsAt,
    sessionId: payload.session.sessionId,
    status: payload.session.status,
  });
  return payload.session;
}

export async function leaveLiveSession(sessionId: string) {
  logLiveClientDebug('leave request', { sessionId });
  await liveApiRequest({
    body: { sessionId },
    method: 'POST',
    path: 'live/leave',
  });
}

export function subscribeLiveSession({
  listener,
  onError,
  sessionId,
}: {
  listener: (session: LiveSessionDto | null) => void;
  onError: (error: unknown) => void;
  sessionId: string;
}) {
  try {
    const db = getFirestore();
    const sessionRef = doc(db, V2_COLLECTION.liveSessions, sessionId);
    logLiveClientDebug('subscribe session snapshot', { sessionId });
    return onSnapshot(
      sessionRef,
      (snapshot: any) => {
        if (!snapshot.exists()) {
          logLiveClientDebug('session snapshot missing', { sessionId });
          listener(null);
          return;
        }
        const normalized = normalizeSessionSnapshot(sessionId, snapshot.data());
        logLiveClientDebug('session snapshot received', {
          currentEventId: normalized.currentEventId,
          endsAt: normalized.endsAt,
          fromCache: Boolean(snapshot.metadata?.fromCache),
          hasPendingWrites: Boolean(snapshot.metadata?.hasPendingWrites),
          sessionId,
          status: normalized.status,
          updatedAt: normalized.updatedAt,
        });
        listener(normalized);
      },
      (error) => {
        logLiveClientDebug('session snapshot error', { message: error instanceof Error ? error.message : String(error), sessionId });
        onError(error);
      }
    );
  } catch (error) {
    logLiveClientDebug('subscribe session threw', { message: error instanceof Error ? error.message : String(error), sessionId });
    onError(error);
    return () => undefined;
  }
}

export function subscribeLiveEvent({
  eventId,
  listener,
  onError,
  sessionId,
}: {
  eventId: string;
  listener: (event: LiveEventDto | null) => void;
  onError: (error: unknown) => void;
  sessionId: string;
}) {
  try {
    const db = getFirestore();
    const eventRef = doc(db, `${V2_COLLECTION.liveSessions}/${sessionId}/events`, eventId);
    return onSnapshot(
      eventRef,
      (snapshot: any) => {
        if (!snapshot.exists()) {
          listener(null);
          return;
        }
        listener(normalizeEventSnapshot(eventId, snapshot.data()));
      },
      onError
    );
  } catch (error) {
    onError(error);
    return () => undefined;
  }
}

async function liveApiRequest<T = { ok?: boolean }>({
  body,
  method,
  path,
}: {
  body?: unknown;
  method: 'GET' | 'POST';
  path: string;
}): Promise<T> {
  if (!hasConfiguredFeedApi()) {
    throw new Error('EXPO_PUBLIC_FEED_API_BASE_URL is not configured.');
  }

  const firebaseUser = getCurrentFirebaseUser();
  if (!firebaseUser) {
    throw new Error('No authenticated Firebase user available for live request.');
  }

  const idToken = await getIdToken(firebaseUser);
  const url = new URL(path, normalizeBaseUrl(env.feedApiBaseUrl));
  const response = await fetchWithTimeout(url.toString(), {
    ...(body ? { body: JSON.stringify(body) } : {}),
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    method,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Live API request failed (${response.status}): ${text}`);
  }

  return await response.json() as T;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: abortController.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function logLiveClientDebug(message: string, details?: Record<string, unknown>) {
  if (__DEV__) {
    console.info(`[live/client] ${message}`, details ?? {});
  }
}

function normalizeBaseUrl(url: string) {
  return url.endsWith('/') ? url : `${url}/`;
}

function normalizeSessionSnapshot(sessionId: string, data: Record<string, unknown>): LiveSessionDto {
  return {
    currentEventId: typeof data.currentEventId === 'string' ? data.currentEventId : null,
    endsAt: toIsoString(data.endsAt) ?? undefined,
    mode: data.mode === 'dev' ? 'dev' : 'production',
    sessionSource: data.sessionSource === 'schedule' ? 'schedule' : 'manual',
    sessionId,
    showWindowId: typeof data.showWindowId === 'string' ? data.showWindowId : null,
    startsAt: toIsoString(data.startsAt) ?? undefined,
    status: normalizeSessionStatus(data.status),
    title: typeof data.title === 'string' ? data.title : 'Mytopia Live',
    updatedAt: toIsoString(data.updatedAt) ?? undefined,
    venueLatitude: typeof data.venueLatitude === 'number' ? data.venueLatitude : null,
    venueLongitude: typeof data.venueLongitude === 'number' ? data.venueLongitude : null,
    venueName: typeof data.venueName === 'string' ? data.venueName : null,
    venueRadiusMeters: typeof data.venueRadiusMeters === 'number' ? data.venueRadiusMeters : null,
  };
}

function normalizeEventSnapshot(eventId: string, data: Record<string, unknown>): LiveEventDto | null {
  if (data.type !== 'terror_alert') {
    return null;
  }

  const payload = typeof data.payload === 'object' && data.payload !== null ? data.payload as Record<string, unknown> : {};
  return {
    createdAt: toIsoString(data.createdAt) ?? new Date().toISOString(),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : 'unknown',
    cueId: typeof data.cueId === 'string' ? data.cueId : null,
    eventId,
    mode: data.mode === 'dev' ? 'dev' : 'production',
    payload: {
      message: typeof payload.message === 'string' ? payload.message : undefined,
      severity: typeof payload.severity === 'string' ? payload.severity : undefined,
      title: typeof payload.title === 'string' ? payload.title : undefined,
    },
    source: data.source === 'adaptor' ? 'adaptor' : 'admin',
    status: data.status === 'cleared' ? 'cleared' : 'active',
    type: 'terror_alert',
    updatedAt: toIsoString(data.updatedAt) ?? new Date().toISOString(),
  };
}

function normalizeSessionStatus(value: unknown) {
  if (value === 'draft' || value === 'paused' || value === 'closed') {
    return value;
  }
  return 'active';
}

function toIsoString(value: unknown) {
  if (!value) return null;
  if (typeof value === 'string') return value;

  if (typeof value === 'object' && value !== null) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === 'function') {
      try {
        const date = (toDate as (this: unknown) => Date).call(value);
        return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
      } catch {
        return null;
      }
    }
  }

  return null;
}
