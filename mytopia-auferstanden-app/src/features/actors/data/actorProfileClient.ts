/** Lazy-loader for Firebase Auth utils */
import { env, hasConfiguredFeedApi } from '@/src/config/env';
import { getCurrentFirebaseUser } from '@/src/core/firebase/authClient';
import { type AppMode } from '@/src/core/session/appMode';
import * as authUtils from '@react-native-firebase/auth';

const { getIdToken } = authUtils;

const ACTOR_REQUEST_TIMEOUT_MS = 15000;

export type NarrativeActorProfileDto = {
  actorId: string;
  avatarUrl?: string;
  bio?: string;
  name: string;
  nameColor?: string;
  role?: string;
};

export async function fetchNarrativeActorProfile({
  actorId,
  mode = 'production',
}: {
  actorId: string;
  mode?: AppMode;
}): Promise<NarrativeActorProfileDto | null> {
  if (!hasConfiguredFeedApi()) {
    throw new Error('EXPO_PUBLIC_FEED_API_BASE_URL is not configured.');
  }

  const firebaseUser = getCurrentFirebaseUser();
  if (!firebaseUser) {
    throw new Error('No authenticated Firebase user available for actor profile request.');
  }

  const idToken = await getIdToken(firebaseUser);
  const requestUrl = createActorUrl({ actorId, baseUrl: env.feedApiBaseUrl, mode });
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, ACTOR_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      method: 'GET',
      signal: abortController.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        `Actor profile request timed out after ${ACTOR_REQUEST_TIMEOUT_MS}ms. Check EXPO_PUBLIC_FEED_API_BASE_URL, function deploy status, and network access.`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Actor profile request failed with ${response.status}: ${body}`);
  }

  const payload = (await response.json()) as {
    actor?: unknown;
  };

  return normalizeActorProfile(payload.actor);
}

function createActorUrl({
  actorId,
  baseUrl,
  mode,
}: {
  actorId: string;
  baseUrl: string;
  mode: AppMode;
}) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL('actors', normalizedBase);
  url.searchParams.set('actorId', actorId);

  if (mode === 'dev') {
    url.searchParams.set('mode', 'dev');
  }

  return url.toString();
}

function normalizeActorProfile(value: unknown): NarrativeActorProfileDto | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const actorId = asNonEmptyString(raw.actorId) ?? asNonEmptyString(raw._id);
  const name = asNonEmptyString(raw.name);

  if (!actorId || !name) {
    return null;
  }

  return {
    actorId,
    ...(typeof raw.avatarUrl === 'string' && raw.avatarUrl.length > 0 ? { avatarUrl: raw.avatarUrl } : {}),
    ...(typeof raw.bio === 'string' && raw.bio.trim().length > 0 ? { bio: raw.bio.trim() } : {}),
    name,
    ...(typeof raw.nameColor === 'string' && raw.nameColor.length > 0 ? { nameColor: raw.nameColor } : {}),
    ...(typeof raw.role === 'string' && raw.role.trim().length > 0 ? { role: raw.role.trim() } : {}),
  };
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isAbortError(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}
