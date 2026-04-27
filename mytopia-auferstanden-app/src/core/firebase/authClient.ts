/** Lazy-loader for Firebase Auth */
import * as auth from '@react-native-firebase/auth';

const {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword: firebaseSignInWithEmailAndPassword,
  createUserWithEmailAndPassword: firebaseCreateUserWithEmailAndPassword,
  sendPasswordResetEmail: firebaseSendPasswordResetEmail,
  sendEmailVerification: firebaseSendEmailVerification,
  signOut: firebaseSignOut,
} = auth || {
  getAuth: () => ({ currentUser: null }),
  onAuthStateChanged: () => () => {},
  signInWithEmailAndPassword: async () => {},
  createUserWithEmailAndPassword: async () => {},
  sendPasswordResetEmail: async () => {},
  sendEmailVerification: async () => {},
  signOut: async () => {},
};

export declare namespace FirebaseAuthTypes {
  type User = any;
}

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
    message: 'Für diese E-Mail-Adresse existiert bereits ein Konto.',
  },
  'auth/invalid-credential': {
    code: 'wrong-password',
    message: 'E-Mail oder Passwort ist nicht korrekt.',
  },
  'auth/invalid-login-credentials': {
    code: 'wrong-password',
    message: 'E-Mail oder Passwort ist nicht korrekt.',
  },
  'auth/invalid-email': {
    code: 'invalid-email',
    message: 'Bitte gib eine gültige E-Mail-Adresse ein.',
  },
  'auth/network-request-failed': {
    code: 'network-request-failed',
    message: 'Netzwerkfehler. Bitte prüfe deine Verbindung und versuche es erneut.',
  },
  'auth/too-many-requests': {
    code: 'too-many-requests',
    message: 'Zu viele Versuche. Bitte probiere es später erneut.',
  },
  'auth/user-disabled': {
    code: 'unknown',
    message: 'Dieses Konto wurde deaktiviert. Bitte nimm Kontakt mit uns auf.',
  },
  'auth/user-not-found': {
    code: 'user-not-found',
    message: 'Für diese E-Mail-Adresse wurde kein Konto gefunden.',
  },
  'auth/weak-password': {
    code: 'weak-password',
    message: 'Das Passwort muss mindestens 6 Zeichen lang sein.',
  },
  'auth/wrong-password': {
    code: 'wrong-password',
    message: 'E-Mail oder Passwort ist nicht korrekt.',
  },
};

const UNKNOWN_ERROR: AuthErrorDescriptor = {
  code: 'unknown',
  message: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
};

export function subscribeAuthState(listener: (user: FirebaseAuthTypes.User | null) => void) {
  try {
    return onAuthStateChanged(getAuth(), listener);
  } catch (error) {
    console.error('[firebase] Failed to subscribe to auth state.', error);
    listener(null);
    return () => undefined;
  }
}

export function getCurrentFirebaseUser() {
  return getAuth().currentUser;
}

export async function signInWithEmailPassword(email: string, password: string) {
  return firebaseSignInWithEmailAndPassword(getAuth(), email, password);
}

export async function signUpWithEmailPassword(email: string, password: string) {
  return firebaseCreateUserWithEmailAndPassword(getAuth(), email, password);
}

export async function sendPasswordResetEmail(email: string) {
  return firebaseSendPasswordResetEmail(getAuth(), email);
}

export async function sendEmailVerification(user: FirebaseAuthTypes.User) {
  return firebaseSendEmailVerification(user);
}

export async function signOutFromFirebase() {
  return firebaseSignOut(getAuth());
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
    message: 'Bitte bestätige deine E-Mail-Adresse, bevor du dich anmeldest. Wir haben dir eine Bestätigungs-E-Mail gesendet.',
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
      message: 'Firebase ist in diesem installierten Build nicht konfiguriert. Bitte installiere einen aktuellen Build.',
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

function isNoDefaultFirebaseAppError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes("No Firebase App '[DEFAULT]'") || (error as { code?: string }).code === 'auth/no-default-app';
}
