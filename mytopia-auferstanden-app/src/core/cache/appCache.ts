import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';

import type { AppMode } from '@/src/core/session/appMode';
import { clearActorThreadSnapshots } from '@/src/features/thread/data/actorThreadSnapshotStore';
import { clearHubThreadSnapshot } from '@/src/features/thread/data/hubThreadSnapshotStore';
import { resetMapPointCache } from '@/src/features/tasks/data/mapRepository';
import { resetMissionCache } from '@/src/features/tasks/data/missionRepository';

const MODE_STORAGE_KEY_PREFIX = 'mytopia:narrativeMode:v1';
const FOCUS_STORAGE_KEY_PREFIX = 'mytopia_focused_mission_id';
const LEGACY_QUIZ_PROGRESS_KEY = 'mytopia_quiz_progress_v1';
const QUIZ_PROGRESS_KEY_PREFIX = 'mytopia_quiz_progress_v2';
const MISSION_SESSION_KEY_PREFIX = 'mytopia_mission_sessions_v1';
const HUB_FEED_CACHE_PREFIX = 'mytopia_feed_cache';
const LAST_SEEN_TOKEN_KEY_BASE = 'mytopia_last_seen_narrative_token';
const LAST_SEEN_TIME_KEY_BASE = 'mytopia_last_seen_narrative_time';

const KNOWN_MODES: AppMode[] = ['production', 'dev'];

export function buildModeStorageKey(uid: string) {
  return `${MODE_STORAGE_KEY_PREFIX}:${uid}`;
}

export function buildMissionFocusKey(uid: string, mode: AppMode) {
  return `${FOCUS_STORAGE_KEY_PREFIX}:${uid}:${mode}`;
}

export function buildQuizProgressKey(uid: string, mode: AppMode) {
  return `${QUIZ_PROGRESS_KEY_PREFIX}:${uid}:${mode}`;
}

export function buildMissionSessionKey(uid: string, mode: AppMode) {
  return `${MISSION_SESSION_KEY_PREFIX}:${uid}:${mode}`;
}

export function clearInMemoryAppCache() {
  clearActorThreadSnapshots();
  clearHubThreadSnapshot();
  resetMissionCache();
  resetMapPointCache();
}

async function clearFirestoreOfflineCache() {
  const db = firestore();

  try {
    await db.terminate();
  } catch (error) {
    console.warn('[cache] Failed to terminate Firestore before clearing persistence.', error);
  }

  try {
    await db.clearPersistence();
  } catch (error) {
    console.warn('[cache] Failed to clear Firestore persistence.', error);
  }
}

export async function clearUserAppCache(
  uid: string,
  options?: { clearModePreference?: boolean }
) {
  const keys = [
    LEGACY_QUIZ_PROGRESS_KEY,
    `${FOCUS_STORAGE_KEY_PREFIX}:${uid}`,
    ...KNOWN_MODES.flatMap((mode) => [
      buildMissionFocusKey(uid, mode),
      buildQuizProgressKey(uid, mode),
      buildMissionSessionKey(uid, mode),
      `${HUB_FEED_CACHE_PREFIX}:${uid}:${mode}`,
      `${LAST_SEEN_TOKEN_KEY_BASE}:${uid}:${mode}`,
      `${LAST_SEEN_TIME_KEY_BASE}:${uid}:${mode}`,
    ]),
  ];

  if (options?.clearModePreference !== false) {
    keys.push(buildModeStorageKey(uid));
  }

  await AsyncStorage.multiRemove(keys);
  clearInMemoryAppCache();
  await clearFirestoreOfflineCache();
}
