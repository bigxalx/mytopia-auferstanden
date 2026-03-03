import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

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
  const userRef = firestore().collection(V2_USERS_COLLECTION).doc(firebaseUser.uid);
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

async function upsertProfileDoc(
  userRef: FirebaseFirestoreTypes.DocumentReference<FirebaseFirestoreTypes.DocumentData>,
  firebaseUser: FirebaseIdentity
): Promise<V2UserDoc> {
  const now = new Date().toISOString();
  const createPayload: V2UserDoc = {
    createdAt: now,
    displayName: resolveDisplayName(undefined, firebaseUser),
    email: resolveEmail(undefined, firebaseUser),
    uid: firebaseUser.uid,
    updatedAt: now,
  };

  const initialSnapshot = await userRef.get();
  const initialExists = documentSnapshotExists(initialSnapshot);
  let existingBeforeWrite = initialExists ? ((initialSnapshot.data() as Partial<V2UserDoc> | undefined) ?? undefined) : undefined;
  if (!initialExists) {
    try {
      await userRef.set(createPayload);
      return createPayload;
    } catch (error) {
      // Concurrent first-login writes can race: one creates the doc, another receives permission-denied on update.
      if (!isPermissionDeniedError(error)) {
        throw error;
      }

      const racedSnapshot = await userRef.get();
      const racedExists = documentSnapshotExists(racedSnapshot);
      if (!racedExists) {
        throw error;
      }
      existingBeforeWrite = (racedSnapshot.data() as Partial<V2UserDoc> | undefined) ?? undefined;
    }
  }

  // Merge updates so server-controlled fields (for example pointsCurrent) are never removed by client writes.
  await userRef.set(
    {
      displayName: resolveDisplayName(existingBeforeWrite?.displayName, firebaseUser),
      updatedAt: now,
    },
    { merge: true }
  );

  const snapshot = await userRef.get();
  const existing = snapshot.data() as Partial<V2UserDoc> | undefined;
  const normalizedLegacySummary = normalizeLegacySummary(existing?.legacySummary);

  return {
    createdAt: typeof existing?.createdAt === 'string' ? existing.createdAt : now,
    displayName: resolveDisplayName(existing?.displayName, firebaseUser),
    email: resolveEmail(existing?.email, firebaseUser),
    uid: firebaseUser.uid,
    updatedAt: typeof existing?.updatedAt === 'string' ? existing.updatedAt : now,
    ...(typeof existing?.photoURL === 'string' ? { photoURL: existing.photoURL } : {}),
    ...(normalizedLegacySummary ? { legacySummary: normalizedLegacySummary } : {}),
    ...(typeof existing?.pointsCurrent === 'number' && Number.isFinite(existing.pointsCurrent)
      ? { pointsCurrent: existing.pointsCurrent }
      : {}),
  };
}

async function importLegacySummaryIfMissing(
  userRef: FirebaseFirestoreTypes.DocumentReference<FirebaseFirestoreTypes.DocumentData>,
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

  const snapshot = await userRef.get();
  const profileExists = documentSnapshotExists(snapshot);
  if (!profileExists) {
    return { importedNow: false, summary: null };
  }

  const existing = snapshot.data() as Partial<V2UserDoc> | undefined;
  const normalizedExistingLegacy = normalizeLegacySummary(existing?.legacySummary);
  if (normalizedExistingLegacy) {
    return { importedNow: false, summary: normalizedExistingLegacy };
  }

  await userRef.set(
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
  try {
    const legacyUserDoc = await firestore().collection(LEGACY_USERS_COLLECTION).doc(uid).get();
    if (!documentSnapshotExists(legacyUserDoc)) {
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

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { mytopia?: number };
    return coerceInteger(payload?.mytopia);
  } catch (error) {
    console.warn('[legacy-summary] Failed to fetch legacy ranking snapshot.', error);
    return null;
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

function documentSnapshotExists(snapshot: FirebaseFirestoreTypes.DocumentSnapshot<FirebaseFirestoreTypes.DocumentData>) {
  const maybeExists = (snapshot as { exists?: unknown }).exists;

  if (typeof maybeExists === 'function') {
    return Boolean((maybeExists as () => unknown)());
  }

  return Boolean(maybeExists);
}
