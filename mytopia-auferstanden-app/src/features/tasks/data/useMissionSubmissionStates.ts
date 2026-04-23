import { useEffect, useState } from 'react';
import {
  FirebaseFirestoreTypes,
  collection,
  getFirestore,
  onSnapshot,
  query,
  where,
} from '@react-native-firebase/firestore';

import { type SubmissionStatus, V2_COLLECTION } from '@/src/core/firestore/schema';
import { normalizeAppMode, type AppMode } from '@/src/core/session/appMode';

export type MissionSubmissionState = {
  moderatorNote?: string;
  status: SubmissionStatus;
};

/**
 * Real-time submission status map keyed by mission id for the current user.
 */
export function useMissionSubmissionStates(
  uid: string | undefined,
  mode: AppMode = 'production',
  refreshTrigger?: number,
): Record<string, MissionSubmissionState> {
  const [submissionStates, setSubmissionStates] = useState<Record<string, MissionSubmissionState>>({});

  useEffect(() => {
    if (!uid) {
      setSubmissionStates({});
      return;
    }

    const db = getFirestore();
    const submissionsQuery = query(
      collection(db, V2_COLLECTION.submissions),
      where('ownerUid', '==', uid),
    );

    const unsubscribe = onSnapshot(
      submissionsQuery,
      (snapshot) => {
        const nextStates: Record<string, MissionSubmissionState> = {};

        snapshot.forEach((submissionDoc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
          const data = submissionDoc.data();
          if (
            normalizeAppMode(data.mode) !== mode ||
            typeof data.sourceId !== 'string' ||
            !isSubmissionStatus(data.status)
          ) {
            return;
          }

          nextStates[data.sourceId] = {
            ...(typeof data.moderatorNote === 'string' && data.moderatorNote.trim().length > 0
              ? { moderatorNote: data.moderatorNote.trim() }
              : {}),
            status: data.status,
          };
        });

        setSubmissionStates(nextStates);
      },
      (error) => {
        console.warn('[useMissionSubmissionStates] Firestore listener error:', error);
        setSubmissionStates({});
      },
    );

    return () => unsubscribe();
  }, [mode, refreshTrigger, uid]);

  return submissionStates;
}

function isSubmissionStatus(value: unknown): value is SubmissionStatus {
  return value === 'draft' || value === 'pending' || value === 'approved' || value === 'rejected';
}
