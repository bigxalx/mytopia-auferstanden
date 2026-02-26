import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

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

export type SessionUser = {
  displayName: string;
  email: string;
  id: string;
  legacySummary?: {
    rankSnapshot: number;
    totalPoints: number;
  };
};

type SessionContextValue = {
  isHydrated: boolean;
  sendPasswordReset: (email: string) => Promise<AuthActionResult>;
  signInWithEmail: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<AuthActionResult>;
  user: SessionUser | null;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: PropsWithChildren) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let hasHydrated = false;
    const unsubscribe = subscribeAuthState((firebaseUser) => {
      if (firebaseUser && firebaseUser.emailVerified) {
        setUser(mapSessionUser(firebaseUser));
      } else {
        setUser(null);
      }

      if (!hasHydrated) {
        setIsHydrated(true);
        hasHydrated = true;
      }
    });

    return unsubscribe;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      isHydrated,
      sendPasswordReset: async (email: string) => {
        try {
          await sendPasswordResetEmail(email);
          return createSuccessResult('Password reset email sent. Check your inbox.');
        } catch (error) {
          return createAuthErrorResult(error);
        }
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
      user,
    }),
    [isHydrated, user]
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
