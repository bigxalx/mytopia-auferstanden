import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AuthActionResult,
  createAuthErrorResult,
  createEmailNotVerifiedResult,
  createSuccessResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailPassword,
  signOutFromFirebase,
  signUpWithEmailPassword,
  subscribeAuthState,
} from '@/src/core/firebase/authClient';
import { getIdTokenResult, FirebaseAuthTypes } from '@react-native-firebase/auth';
import { ensureNarrativeTopicSubscription } from '@/src/core/firebase/messagingClient';
import { syncSessionProfile } from '@/src/core/firebase/legacySummaryClient';
import { normalizeAppMode, type AppMode } from '@/src/core/session/appMode';

const MODE_STORAGE_KEY_PREFIX = 'mytopia:narrativeMode:v1';
const HYDRATION_TIMEOUT_MS = 10_000;

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
};

type SessionContextValue = {
  canUseDevMode: boolean;
  dismissWelcomeBack: () => void;
  isHydrated: boolean;
  selectedMode: AppMode;
  sendPasswordReset: (email: string) => Promise<AuthActionResult>;
  setSelectedMode: (mode: AppMode) => void;
  shouldShowWelcomeBack: boolean;
  signInWithEmail: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<AuthActionResult>;
  user: SessionUser | null;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: PropsWithChildren) {
  const [canUseDevMode, setCanUseDevMode] = useState(false);
  const [selectedMode, setSelectedModeState] = useState<AppMode>('production');
  const [isHydrated, setIsHydrated] = useState(false);
  const [modeStorageUid, setModeStorageUid] = useState<string | null>(null);
  const [shouldShowWelcomeBack, setShouldShowWelcomeBack] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let hasHydrated = false;
    let isActive = true;
    let authEventVersion = 0;

    const unsubscribe = subscribeAuthState((firebaseUser) => {
      const version = authEventVersion + 1;
      authEventVersion = version;

      void (async () => {
        if (firebaseUser && firebaseUser.emailVerified) {
          const hydrationResult = await Promise.race([
            hydrateAuthenticatedSession(firebaseUser),
            timeoutAfter(HYDRATION_TIMEOUT_MS),
          ]);

          if (!isActive || authEventVersion !== version) {
            return;
          }

          if (hydrationResult === 'timeout') {
            console.warn(
              `[session] Hydration timed out after ${HYDRATION_TIMEOUT_MS}ms. Falling back to basic profile.`
            );
            setCanUseDevMode(false);
            setModeStorageUid(firebaseUser.uid);
            setSelectedModeState('production');
            setUser(mapSessionUser(firebaseUser));
            setShouldShowWelcomeBack(false);
          } else {
            setCanUseDevMode(hydrationResult.canUseDevMode);
            setModeStorageUid(firebaseUser.uid);
            setSelectedModeState(hydrationResult.selectedMode);
            setUser(hydrationResult.profile);
            setShouldShowWelcomeBack(hydrationResult.importedLegacySummary);
          }
        } else {
          if (!isActive || authEventVersion !== version) {
            return;
          }

          setCanUseDevMode(false);
          setModeStorageUid(null);
          setSelectedModeState('production');
          setShouldShowWelcomeBack(false);
          setUser(null);
        }

        if (!hasHydrated) {
          setIsHydrated(true);
          hasHydrated = true;
        }
      })();
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    void ensureNarrativeTopicSubscription(selectedMode);
  }, [selectedMode, user]);

  const value = useMemo<SessionContextValue>(
    () => ({
      canUseDevMode,
      dismissWelcomeBack: () => setShouldShowWelcomeBack(false),
      isHydrated,
      selectedMode,
      sendPasswordReset: async (email: string) => {
        try {
          await sendPasswordResetEmail(email);
          return createSuccessResult('Password reset email sent. Check your inbox.');
        } catch (error) {
          return createAuthErrorResult(error);
        }
      },
      setSelectedMode: (mode: AppMode) => {
        if (!modeStorageUid) {
          setSelectedModeState('production');
          return;
        }

        const nextMode = mode === 'dev' && canUseDevMode ? 'dev' : 'production';
        setSelectedModeState(nextMode);
        void persistSelectedMode(modeStorageUid, nextMode);
      },
      signInWithEmail: async (email: string, password: string) => {
        try {
          const credential = await signInWithEmailPassword(email, password);
          if (!credential.user.emailVerified) {
            try {
              await sendEmailVerification(credential.user);
            } catch (verificationError) {
              return createAuthErrorResult(verificationError);
            } finally {
              await signOutFromFirebase();
            }

            return createEmailNotVerifiedResult();
          }

          return createSuccessResult();
        } catch (error) {
          return createAuthErrorResult(error);
        }
      },
      signOut: async () => {
        try {
          await signOutFromFirebase();
        } catch (error) {
          console.error('Failed to sign out from Firebase.', error);
        } finally {
          setCanUseDevMode(false);
          setModeStorageUid(null);
          setSelectedModeState('production');
          setShouldShowWelcomeBack(false);
          setUser(null);
        }
      },
      signUpWithEmail: async (email: string, password: string) => {
        try {
          const credential = await signUpWithEmailPassword(email, password);
          await sendEmailVerification(credential.user);
          await signOutFromFirebase();
          return createSuccessResult(
            'Account created. Please verify your email before signing in.'
          );
        } catch (error) {
          return createAuthErrorResult(error);
        }
      },
      shouldShowWelcomeBack,
      user,
    }),
    [canUseDevMode, isHydrated, modeStorageUid, selectedMode, shouldShowWelcomeBack, user]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider');
  }

  return context;
}

function mapSessionUser(user: { uid: string; email: string | null; displayName: string | null }): SessionUser {
  const fallbackName = user.email ? user.email.split('@')[0] : 'Mytopia Survivor';

  return {
    displayName: user.displayName?.trim() || fallbackName,
    email: user.email ?? '',
    id: user.uid,
  };
}

async function resolveModeState(user: FirebaseAuthTypes.User) {
  const canUseDevMode = await hasDevClaim(user);
  const persistedMode = await readPersistedMode(user.uid);
  const selectedMode = canUseDevMode ? normalizeAppMode(persistedMode) : 'production';

  if (!canUseDevMode && persistedMode === 'dev') {
    await persistSelectedMode(user.uid, 'production');
  }

  return {
    canUseDevMode,
    selectedMode,
  };
}

async function hasDevClaim(user: FirebaseAuthTypes.User) {
  try {
    const idTokenResult = await getIdTokenResult(user, true);
    return idTokenResult.claims.dev === true;
  } catch (error) {
    console.warn('[session] Unable to read Firebase custom claims; defaulting to production mode.', error);
    return false;
  }
}

function storageKeyForMode(uid: string) {
  return `${MODE_STORAGE_KEY_PREFIX}:${uid}`;
}

async function readPersistedMode(uid: string): Promise<AppMode> {
  try {
    const raw = await AsyncStorage.getItem(storageKeyForMode(uid));
    return normalizeAppMode(raw);
  } catch (error) {
    console.warn('[session] Failed to read persisted app mode.', error);
    return 'production';
  }
}

async function persistSelectedMode(uid: string, mode: AppMode) {
  try {
    await AsyncStorage.setItem(storageKeyForMode(uid), mode);
  } catch (error) {
    console.warn('[session] Failed to persist app mode selection.', error);
  }
}

type HydrationResult = {
  canUseDevMode: boolean;
  importedLegacySummary: boolean;
  profile: SessionUser;
  selectedMode: AppMode;
};

async function hydrateAuthenticatedSession(
  firebaseUser: FirebaseAuthTypes.User
): Promise<HydrationResult> {
  const modeState = await resolveModeState(firebaseUser);

  try {
    const synced = await syncSessionProfile(firebaseUser);
    return {
      canUseDevMode: modeState.canUseDevMode,
      importedLegacySummary: synced.importedLegacySummary,
      profile: synced.profile,
      selectedMode: modeState.selectedMode,
    };
  } catch (error) {
    console.error('Failed to hydrate session from Firestore profile.', error);
    return {
      canUseDevMode: modeState.canUseDevMode,
      importedLegacySummary: false,
      profile: mapSessionUser(firebaseUser),
      selectedMode: modeState.selectedMode,
    };
  }
}

function timeoutAfter(ms: number): Promise<'timeout'> {
  return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));
}
