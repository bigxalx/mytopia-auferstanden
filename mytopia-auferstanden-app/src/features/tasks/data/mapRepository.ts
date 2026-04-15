import { getIdToken } from '@react-native-firebase/auth';

import { env, hasConfiguredFeedApi } from '@/src/config/env';
import { getCurrentFirebaseUser } from '@/src/core/firebase/authClient';
import type { AppMode } from '@/src/core/session/appMode';

const REQUEST_TIMEOUT_MS = 15000;
const MAP_POINTS_CACHE_TTL_MS = 5 * 60 * 1000;

type BaseMapPoint = {
  description?: string;
  id: string;
  imageUrl?: string;
  latitude: number;
  longitude: number;
  title: string;
};

export type MissionMapPoint = BaseMapPoint & {
  points: number;
  radiusMeters: number;
  type: 'mission';
};

export type CheckpointMapPoint = BaseMapPoint & {
  type: 'checkpoint';
};

export type MapPoint = MissionMapPoint | CheckpointMapPoint;

type MapPointCacheEntry = {
  fetchedAt: number;
  points: MapPoint[];
};

const mapPointCache = new Map<AppMode, MapPointCacheEntry>();
const inFlightMapPointRequests = new Map<AppMode, Promise<MapPoint[]>>();

export async function fetchMapPoints({
  mode = 'production',
  forceRefresh = false,
}: {
  forceRefresh?: boolean;
  mode?: AppMode;
} = {}): Promise<MapPoint[]> {
  if (!hasConfiguredFeedApi()) {
    throw new Error('EXPO_PUBLIC_FEED_API_BASE_URL is not configured.');
  }

  const cached = mapPointCache.get(mode);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < MAP_POINTS_CACHE_TTL_MS) {
    return cached.points;
  }

  const existingRequest = inFlightMapPointRequests.get(mode);
  if (!forceRefresh && existingRequest) {
    return existingRequest;
  }

  const request = loadMapPointsFromApi(mode);
  inFlightMapPointRequests.set(mode, request);

  try {
    return await request;
  } finally {
    if (inFlightMapPointRequests.get(mode) === request) {
      inFlightMapPointRequests.delete(mode);
    }
  }
}

async function loadMapPointsFromApi(mode: AppMode): Promise<MapPoint[]> {
  const idToken = await ensureIdToken();
  const baseUrl = normalizeBaseUrl(env.feedApiBaseUrl);

  const urlObj = new URL('map-points', baseUrl);
  if (mode === 'dev') {
    urlObj.searchParams.set('mode', 'dev');
  }

  const response = await fetchWithTimeout(urlObj.toString(), {
    headers: { Authorization: `Bearer ${idToken}` },
    method: 'GET',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Map points fetch failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as { points?: unknown[] };
  const points = Array.isArray(payload.points) ? (payload.points as MapPoint[]) : [];

  mapPointCache.set(mode, {
    fetchedAt: Date.now(),
    points,
  });

  return points;
}

async function ensureIdToken() {
  const firebaseUser = getCurrentFirebaseUser();
  if (!firebaseUser) {
    throw new Error('No authenticated Firebase user.');
  }

  return getIdToken(firebaseUser);
}

function normalizeBaseUrl(url: string) {
  return url.endsWith('/') ? url : `${url}/`;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: abortController.signal });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { name?: unknown }).name === 'AbortError'
    ) {
      throw new Error(`Request to ${url} timed out after ${REQUEST_TIMEOUT_MS}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
