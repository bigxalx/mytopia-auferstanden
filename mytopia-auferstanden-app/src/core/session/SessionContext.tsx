import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

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
} from '@/src/core/firebase/authClient';
import { ensureNarrativeTopicSubscription } from '@/src/core/firebase/messagingClient';
import { useFcmTokenSync } from '@/src/core/firebase/useFcmTokenSync';
import { clearUserAppCache } from '@/src/core/cache/appCache';
import { type AppMode } from '@/src/core/session/appMode';
import {
  onAuthSessionChange,
  persistSelectedMode,
  type AuthSessionState,
  type SessionUser,
} from '@/src/core/session/authSessionManager';

export type { SessionUser } from '@/src/core/session/authSessionManager';

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
  useFcmTokenSync(user?.id);

  useEffect(() => {
    return onAuthSessionChange((authState: AuthSessionState) => {
      if (authState.status === 'loading') {
        return;
      }

      if (authState.status === 'authenticated') {
        setCanUseDevMode(authState.canUseDevMode);
        setModeStorageUid(authState.profile.id);
        setSelectedModeState(authState.selectedMode);
        setUser(authState.profile);
        setShouldShowWelcomeBack(authState.importedLegacySummary);
      } else {
        setCanUseDevMode(false);
        setModeStorageUid(null);
        setSelectedModeState('production');
        setShouldShowWelcomeBack(false);
        setUser(null);
      }

      setIsHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    void ensureNarrativeTopicSubscription(selectedMode);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void ensureNarrativeTopicSubscription(selectedMode);
      }
    });

    return () => subscription.remove();
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
        const currentUserId = user?.id ?? null;
        try {
          await signOutFromFirebase();
          if (currentUserId) {
            await clearUserAppCache(currentUserId);
          }
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
