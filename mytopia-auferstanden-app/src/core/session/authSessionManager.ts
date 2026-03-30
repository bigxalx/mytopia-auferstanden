/**
 * Module-level Firebase Auth session manager.
 *
 * ## Why module-level?
 *
 * Firebase's `onAuthStateChanged` fires immediately on subscription with the
 * cached user. React's new architecture (`newArchEnabled`) and the React
 * Compiler (`reactCompiler`) can mount/unmount/remount components multiple
 * times during the initial render pass. If the subscription lives inside a
 * `useEffect`, each remount creates a new subscription → immediate fire →
 * new hydration cycle. Multiple concurrent Firestore reads to the same
 * document deadlock the Android Firestore SDK.
 *
 * By subscribing at module level (outside React), the subscription is created
 * exactly once regardless of how many times React remounts components.
 *
 * ## Guards
 *
 * - `hydrationInFlight` — prevents concurrent hydration if Firebase fires
 *   auth events faster than hydration completes.
 * - `hydratedUid` — once a user is fully hydrated, subsequent auth events
 *   for the same uid are no-ops. Resets on sign-out.
 * - Timeout — safety net if Firestore hangs (known Android SDK issue).
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { subscribeAuthState, type FirebaseAuthTypes } from '@/src/core/firebase/authClient';
import { syncSessionProfile } from '@/src/core/firebase/legacySummaryClient';
import { normalizeAppMode, type AppMode } from '@/src/core/session/appMode';
import * as authUtils from '@react-native-firebase/auth';

const { getIdTokenResult } = authUtils;

const TAG = `[session:${Platform.OS}]`;
const MODE_STORAGE_KEY_PREFIX = 'mytopia:narrativeMode:v1';
const HYDRATION_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionUser = {
  displayName: string;
  email: string;
  id: string;
  legacySummary?: {
    citizenship?: Record<string, unknown>;
    properties?: unknown[];
    rankSnapshot: number;
    totalPoints: number;
  };
  pointsCurrent?: number;
};

export type AuthSessionState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | {
      status: 'authenticated';
      canUseDevMode: boolean;
      importedLegacySummary: boolean;
      profile: SessionUser;
      selectedMode: AppMode;
    };

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let currentState: AuthSessionState = { status: 'loading' };
let hydrationInFlight = false;
let hydratedUid: string | null = null;
const listeners = new Set<(state: AuthSessionState) => void>();

function setState(next: AuthSessionState) {
  currentState = next;
  listeners.forEach((fn) => fn(next));
}

// ---------------------------------------------------------------------------
// Single Firebase subscription (runs once when this module is first imported)
// ---------------------------------------------------------------------------

subscribeAuthState((firebaseUser) => {
  if (firebaseUser && firebaseUser.emailVerified) {
    if (hydratedUid === firebaseUser.uid) {
      return;
    }

    if (hydrationInFlight) {
      return;
    }

    hydrationInFlight = true;

    void (async () => {
      try {
        const result = await Promise.race([
          hydrateSession(firebaseUser),
          timeoutAfter(HYDRATION_TIMEOUT_MS),
        ]);

        if (result === 'timeout') {
          console.warn(`${TAG} Hydration timed out — using basic profile`);
          hydratedUid = firebaseUser.uid;
          setState({
            status: 'authenticated',
            canUseDevMode: false,
            importedLegacySummary: false,
            profile: mapSessionUser(firebaseUser),
            selectedMode: 'production',
          });
        } else {
          hydratedUid = firebaseUser.uid;
          setState(result);
        }
      } catch (error) {
        console.warn(`${TAG} Hydration failed — using basic profile`, error);
        hydratedUid = firebaseUser.uid;
        setState({
          status: 'authenticated',
          canUseDevMode: false,
          importedLegacySummary: false,
          profile: mapSessionUser(firebaseUser),
          selectedMode: 'production',
        });
      } finally {
        hydrationInFlight = false;
      }
    })();
  } else {
    hydratedUid = null;
    setState({ status: 'unauthenticated' });
  }
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Subscribe to auth session state changes.
 *
 * The listener fires immediately with the current state, then again on every
 * change. Returns an unsubscribe function.
 */
export function onAuthSessionChange(listener: (state: AuthSessionState) => void): () => void {
  listeners.add(listener);
  listener(currentState);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

async function hydrateSession(
  firebaseUser: FirebaseAuthTypes.User
): Promise<AuthSessionState & { status: 'authenticated' }> {
  const canUseDevMode = await hasDevClaim(firebaseUser);

  const persistedMode = await readPersistedMode(firebaseUser.uid);
  const selectedMode = canUseDevMode ? normalizeAppMode(persistedMode) : 'production';

  if (!canUseDevMode && persistedMode === 'dev') {
    await persistSelectedMode(firebaseUser.uid, 'production');
  }

  const synced = await syncSessionProfile(firebaseUser);

  return {
    status: 'authenticated',
    canUseDevMode,
    importedLegacySummary: synced.importedLegacySummary,
    profile: synced.profile,
    selectedMode,
  };
}

async function hasDevClaim(user: FirebaseAuthTypes.User): Promise<boolean> {
  try {
    const idTokenResult = await getIdTokenResult(user);
    return idTokenResult.claims.dev === true;
  } catch {
    return false;
  }
}

function mapSessionUser(user: { uid: string; email: string | null; displayName: string | null }): SessionUser {
  const fallbackName = user.email ? user.email.split('@')[0] : 'Mytopia Survivor';
  return {
    displayName: user.displayName?.trim() || fallbackName,
    email: user.email ?? '',
    id: user.uid,
  };
}

// ---------------------------------------------------------------------------
// AsyncStorage helpers
// ---------------------------------------------------------------------------

function storageKeyForMode(uid: string) {
  return `${MODE_STORAGE_KEY_PREFIX}:${uid}`;
}

async function readPersistedMode(uid: string): Promise<AppMode> {
  try {
    const raw = await AsyncStorage.getItem(storageKeyForMode(uid));
    return normalizeAppMode(raw);
  } catch {
    return 'production';
  }
}

export async function persistSelectedMode(uid: string, mode: AppMode) {
  try {
    await AsyncStorage.setItem(storageKeyForMode(uid), mode);
  } catch {
    // Silently ignore — mode will default to production on next read.
  }
}

function timeoutAfter(ms: number): Promise<'timeout'> {
  return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));
}
