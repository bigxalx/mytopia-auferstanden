import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

export type AuthFlowErrorCode =
  | 'email-not-verified'
  | 'invalid-email'
  | 'user-not-found'
  | 'wrong-password'
  | 'email-already-in-use'
  | 'weak-password'
  | 'network-request-failed'
  | 'too-many-requests'
  | 'unknown';

export type AuthActionResult = { ok: true; message?: string } | { ok: false; code: AuthFlowErrorCode; message: string };

type AuthErrorDescriptor = {
  code: AuthFlowErrorCode;
  message: string;
};

const ERROR_MAP: Record<string, AuthErrorDescriptor> = {
  'auth/email-already-in-use': {
    code: 'email-already-in-use',
    message: 'An account with this email already exists.',
  },
  'auth/invalid-credential': {
    code: 'wrong-password',
    message: 'Email or password is incorrect.',
  },
  'auth/invalid-email': {
    code: 'invalid-email',
    message: 'Please enter a valid email address.',
  },
  'auth/network-request-failed': {
    code: 'network-request-failed',
    message: 'Network error. Check your connection and try again.',
  },
  'auth/too-many-requests': {
    code: 'too-many-requests',
    message: 'Too many attempts. Try again later.',
  },
  'auth/user-not-found': {
    code: 'user-not-found',
    message: 'No account found for this email address.',
  },
  'auth/weak-password': {
    code: 'weak-password',
    message: 'Password must be at least 6 characters.',
  },
  'auth/wrong-password': {
    code: 'wrong-password',
    message: 'Email or password is incorrect.',
  },
};

const UNKNOWN_ERROR: AuthErrorDescriptor = {
  code: 'unknown',
  message: 'Something went wrong. Please try again.',
};

export function subscribeAuthState(listener: (user: FirebaseAuthTypes.User | null) => void) {
  try {
    return getAuthInstance().onAuthStateChanged(listener);
  } catch (error) {
    console.error('[firebase] Failed to subscribe to auth state.', error);
    listener(null);
    return () => undefined;
  }
}

export function getCurrentFirebaseUser() {
  return getAuthInstance().currentUser;
}

export async function signInWithEmailPassword(email: string, password: string) {
  return getAuthInstance().signInWithEmailAndPassword(email, password);
}

export async function signUpWithEmailPassword(email: string, password: string) {
  return getAuthInstance().createUserWithEmailAndPassword(email, password);
}

export async function sendPasswordResetEmail(email: string) {
  return getAuthInstance().sendPasswordResetEmail(email);
}

export async function sendEmailVerification(user: FirebaseAuthTypes.User) {
  return user.sendEmailVerification();
}

export async function signOutFromFirebase() {
  return getAuthInstance().signOut();
}

export function createSuccessResult(message?: string): AuthActionResult {
  if (message) {
    return { ok: true, message };
  }
  return { ok: true };
}

export function createEmailNotVerifiedResult(): AuthActionResult {
  return {
    ok: false,
    code: 'email-not-verified',
    message: 'Please verify your email before signing in. A verification email has been sent.',
  };
}

export function createAuthErrorResult(error: unknown): AuthActionResult {
  const descriptor = describeAuthError(error);
  return {
    ok: false,
    code: descriptor.code,
    message: descriptor.message,
  };
}

function describeAuthError(error: unknown): AuthErrorDescriptor {
  if (isNoDefaultFirebaseAppError(error)) {
    return {
      code: 'unknown',
      message: 'Firebase is not configured in this installed build. Rebuild and reinstall with `bun android` or `bun ios`.',
    };
  }

  if (typeof error !== 'object' || error === null) {
    return UNKNOWN_ERROR;
  }

  const maybeCode = (error as { code?: unknown }).code;
  if (typeof maybeCode !== 'string') {
    return UNKNOWN_ERROR;
  }

  return ERROR_MAP[maybeCode] ?? UNKNOWN_ERROR;
}

function getAuthInstance() {
  try {
    return auth();
  } catch (error) {
    throw normalizeNoDefaultFirebaseAppError(error);
  }
}

function normalizeNoDefaultFirebaseAppError(error: unknown) {
  if (!isNoDefaultFirebaseAppError(error)) {
    return error;
  }

  return Object.assign(new Error("Firebase app '[DEFAULT]' is not initialized in this native build."), {
    code: 'auth/no-default-app',
  });
}

function isNoDefaultFirebaseAppError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes("No Firebase App '[DEFAULT]'");
}
