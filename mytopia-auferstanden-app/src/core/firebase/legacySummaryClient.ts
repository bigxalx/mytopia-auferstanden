import { 
  getFirestore, 
  collection as firestoreCollection, 
  doc, 
  getDoc, 
  setDoc,
  type FirebaseFirestoreTypes
} from '@react-native-firebase/firestore';

import { env } from '@/src/config/env';
import { LegacySummary, V2_COLLECTION, V2UserDoc } from '@/src/core/firestore/schema';

export type SessionProfile = {
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

export type SyncSessionProfileResult = {
  importedLegacySummary: boolean;
  profile: SessionProfile;
};

type FirebaseIdentity = {
  displayName: string | null;
  email: string | null;
  uid: string;
};

const LEGACY_RANKING_REGION = 'europe-west1';
const LEGACY_USERS_COLLECTION = 'users';
const V2_USERS_COLLECTION = V2_COLLECTION.users;

export async function syncSessionProfile(firebaseUser: FirebaseIdentity): Promise<SyncSessionProfileResult> {
  const db = getFirestore();
  const userRef = doc(db, V2_USERS_COLLECTION, firebaseUser.uid);
  const profileDoc = await upsertProfileDoc(userRef, firebaseUser);
  const importedLegacySummary = await importLegacySummaryIfMissing(
    userRef,
    firebaseUser.uid,
    profileDoc.legacySummary
  );

  const resolvedProfileDoc: V2UserDoc = importedLegacySummary.summary
    ? {
        ...profileDoc,
        legacySummary: importedLegacySummary.summary,
      }
    : profileDoc;

  return {
    importedLegacySummary: importedLegacySummary.importedNow,
    profile: mapSessionProfile(resolvedProfileDoc),
  };
}

/**
 * Reads the user's profile doc. Only writes if the document doesn't exist yet
 * (first sign-in) or if the displayName has changed. This avoids unnecessary
 * Firestore writes that caused contention on the Android SDK.
 */
async function upsertProfileDoc(
  userRef: FirebaseFirestoreTypes.DocumentReference,
  firebaseUser: FirebaseIdentity
): Promise<V2UserDoc> {
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    const existing = (snapshot.data() as Partial<V2UserDoc> | undefined) ?? {};
    const currentDisplayName = resolveDisplayName(existing.displayName, firebaseUser);
    const needsUpdate = existing.displayName !== currentDisplayName;

    if (needsUpdate) {
      const now = new Date().toISOString();
      await setDoc(
        userRef,
        { displayName: currentDisplayName, updatedAt: now },
        { merge: true }
      );
    }

    const normalizedLegacySummary = normalizeLegacySummary(existing.legacySummary);
    return {
      createdAt: typeof existing.createdAt === 'string' ? existing.createdAt : new Date().toISOString(),
      displayName: needsUpdate ? resolveDisplayName(undefined, firebaseUser) : resolveDisplayName(existing.displayName, firebaseUser),
      email: resolveEmail(existing.email, firebaseUser),
      uid: firebaseUser.uid,
      updatedAt: typeof existing.updatedAt === 'string' ? existing.updatedAt : new Date().toISOString(),
      ...(typeof existing.photoURL === 'string' ? { photoURL: existing.photoURL } : {}),
      ...(normalizedLegacySummary ? { legacySummary: normalizedLegacySummary } : {}),
      ...(typeof existing.pointsCurrent === 'number' && Number.isFinite(existing.pointsCurrent)
        ? { pointsCurrent: existing.pointsCurrent }
        : {}),
    };
  }

  // Document doesn't exist — create it.
  const now = new Date().toISOString();
  const createPayload: V2UserDoc = {
    createdAt: now,
    displayName: resolveDisplayName(undefined, firebaseUser),
    email: resolveEmail(undefined, firebaseUser),
    uid: firebaseUser.uid,
    updatedAt: now,
  };

  try {
    await setDoc(userRef, createPayload);
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      throw error;
    }
    // Race condition: another client created the doc first. Read and return it.
    const racedSnapshot = await getDoc(userRef);
    if (!racedSnapshot.exists()) {
      throw error;
    }
    const racedData = (racedSnapshot.data() as Partial<V2UserDoc> | undefined) ?? {};
    const normalizedLegacySummary = normalizeLegacySummary(racedData.legacySummary);
    return {
      createdAt: typeof racedData.createdAt === 'string' ? racedData.createdAt : now,
      displayName: resolveDisplayName(racedData.displayName, firebaseUser),
      email: resolveEmail(racedData.email, firebaseUser),
      uid: firebaseUser.uid,
      updatedAt: typeof racedData.updatedAt === 'string' ? racedData.updatedAt : now,
      ...(typeof racedData.photoURL === 'string' ? { photoURL: racedData.photoURL } : {}),
      ...(normalizedLegacySummary ? { legacySummary: normalizedLegacySummary } : {}),
      ...(typeof racedData.pointsCurrent === 'number' && Number.isFinite(racedData.pointsCurrent)
        ? { pointsCurrent: racedData.pointsCurrent }
        : {}),
    };
  }

  return createPayload;
}

async function importLegacySummaryIfMissing(
  userRef: FirebaseFirestoreTypes.DocumentReference,
  uid: string,
  existingLegacySummary: LegacySummary | undefined
) {
  if (existingLegacySummary) {
    return { importedNow: false, summary: existingLegacySummary };
  }

  const imported = await fetchLegacySummary(uid);
  if (!imported) {
    return { importedNow: false, summary: null };
  }

  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) {
    return { importedNow: false, summary: null };
  }

  const existing = snapshot.data() as Partial<V2UserDoc> | undefined;
  const normalizedExistingLegacy = normalizeLegacySummary(existing?.legacySummary);
  if (normalizedExistingLegacy) {
    return { importedNow: false, summary: normalizedExistingLegacy };
  }

  await setDoc(
    userRef,
    {
      legacySummary: imported,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return { importedNow: true, summary: imported };
}

function mapSessionProfile(data: V2UserDoc): SessionProfile {
  return {
    displayName: data.displayName,
    email: data.email,
    id: data.uid,
    ...(data.legacySummary
      ? {
          legacySummary: {
            ...(data.legacySummary.citizenship ? { citizenship: data.legacySummary.citizenship } : {}),
            ...(data.legacySummary.properties ? { properties: data.legacySummary.properties } : {}),
            rankSnapshot: data.legacySummary.rankSnapshot,
            totalPoints: data.legacySummary.totalPoints,
          },
        }
      : {}),
  };
}

function resolveDisplayName(currentDisplayName: unknown, firebaseUser: FirebaseIdentity) {
  if (typeof currentDisplayName === 'string' && currentDisplayName.trim().length > 0) {
    return currentDisplayName.trim();
  }

  if (typeof firebaseUser.displayName === 'string' && firebaseUser.displayName.trim().length > 0) {
    return firebaseUser.displayName.trim();
  }

  const fallbackEmail = resolveEmail(undefined, firebaseUser);
  if (fallbackEmail.length > 0) {
    return fallbackEmail.split('@')[0];
  }

  return 'Mytopia Survivor';
}

function resolveEmail(currentEmail: unknown, firebaseUser: FirebaseIdentity) {
  if (typeof currentEmail === 'string') {
    return currentEmail;
  }
  if (typeof firebaseUser.email === 'string') {
    return firebaseUser.email;
  }
  return '';
}

async function fetchLegacySummary(uid: string): Promise<LegacySummary | null> {
  const db = getFirestore();
  try {
    const legacyUserDoc = await getDoc(doc(db, LEGACY_USERS_COLLECTION, uid));
    if (!legacyUserDoc.exists()) {
      return null;
    }

    const legacyData = (legacyUserDoc.data() as Record<string, unknown> | undefined) ?? {};
    const legacyCitizenship = asRecord(legacyData.citizenship);
    const mytopia = legacyCitizenship ? asRecord(legacyCitizenship.mytopia) : null;

    const totalPoints = coerceInteger(mytopia?.score);
    if (totalPoints === null) {
      return null;
    }

    const rankFromFunction = await fetchLegacyRankSnapshot(uid);
    const rankFromDoc = coerceInteger(mytopia?.ranking);
    const rankSnapshot = rankFromFunction ?? rankFromDoc;
    if (rankSnapshot === null || rankSnapshot <= 0) {
      return null;
    }

    const properties = Array.isArray(legacyData.properties) ? legacyData.properties : [];

    return {
      importedAt: new Date().toISOString(),
      citizenship: legacyCitizenship ?? {},
      properties,
      rankSnapshot,
      totalPoints,
    };
  } catch (error) {
    console.warn('[legacy-summary] Failed to import legacy summary.', error);
    return null;
  }
}

async function fetchLegacyRankSnapshot(uid: string): Promise<number | null> {
  if (!env.firebaseProjectId) {
    return null;
  }

  const url = `https://${LEGACY_RANKING_REGION}-${env.firebaseProjectId}.cloudfunctions.net/getRanking?uid=${encodeURIComponent(uid)}`;

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 10_000);

  try {
    const response = await fetch(url, { signal: abortController.signal });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { mytopia?: number };
    return coerceInteger(payload?.mytopia);
  } catch (error) {
    console.warn('[legacy-summary] Failed to fetch legacy ranking snapshot.', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function coerceInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return null;
}

function normalizeLegacySummary(value: unknown): LegacySummary | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const importedAt = (value as { importedAt?: unknown }).importedAt;
  const rankSnapshot = coerceInteger((value as { rankSnapshot?: unknown }).rankSnapshot);
  const totalPoints = coerceInteger((value as { totalPoints?: unknown }).totalPoints);
  const citizenship = asRecord((value as { citizenship?: unknown }).citizenship);
  const properties = Array.isArray((value as { properties?: unknown }).properties)
    ? ((value as { properties?: unknown[] }).properties as unknown[])
    : undefined;

  if (typeof importedAt !== 'string' || rankSnapshot === null || totalPoints === null || rankSnapshot <= 0) {
    return null;
  }

  return {
    ...(citizenship ? { citizenship } : {}),
    importedAt,
    ...(properties ? { properties } : {}),
    rankSnapshot,
    totalPoints,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isPermissionDeniedError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return code === 'permission-denied' || code === 'firestore/permission-denied';
}

