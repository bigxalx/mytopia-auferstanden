import { useEffect, useState } from 'react';
import {
  FirebaseFirestoreTypes,
  collection,
  getFirestore,
  onSnapshot,
  query,
  where,
} from '@react-native-firebase/firestore';

import { V2_COLLECTION, type RewardBreakdown, type StreakSummary } from '@/src/core/firestore/schema';
import { normalizeAppMode, type AppMode } from '@/src/core/session/appMode';

export type MissionSubmissionRecord = {
  awardedAtMs: number | null;
  awardedPoints: number | null;
  createdAtMs: number;
  earnedPoints: number | null;
  id: string;
  missionTitle: string;
  mode: AppMode;
  moderatorNote?: string;
  ownerUid: string;
  payload?: unknown;
  resolvedAtMs: number | null;
  rewardBreakdown?: RewardBreakdown;
  sourceId: string;
  sourceType: 'gps' | 'quiz' | 'text' | 'photo';
  status: 'pending' | 'approved' | 'rejected';
  streakSummary?: StreakSummary;
};

export function useMissionSubmissions(
  uid: string | undefined,
  mode: AppMode = 'production',
  refreshTrigger?: number,
): MissionSubmissionRecord[] {
  const [submissions, setSubmissions] = useState<MissionSubmissionRecord[]>([]);

  useEffect(() => {
    if (!uid) {
      setSubmissions([]);
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
        const nextSubmissions: MissionSubmissionRecord[] = [];

        snapshot.forEach((submissionDoc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
          const data = submissionDoc.data();
          if (!isMissionSourceType(data.sourceType)) {
            return;
          }

          const submissionMode = normalizeAppMode(data.mode);
          if (submissionMode !== mode || typeof data.sourceId !== 'string' || !isSubmissionStatus(data.status)) {
            return;
          }

          const rewardBreakdown = readRewardBreakdown(data);
          const streakSummary = readStreakSummary(data);
          const createdAtMs = timestampToMillis(data.createdAt);
          const awardedAtMs = timestampToMillisOrNull(data.awardedAt);
          const reviewedAtMs = timestampToMillisOrNull(data.reviewedAt);

          nextSubmissions.push({
            awardedAtMs,
            awardedPoints: typeof data.awardedPoints === 'number' ? Math.round(data.awardedPoints) : null,
            createdAtMs,
            earnedPoints: readEarnedPoints(data, rewardBreakdown),
            id: submissionDoc.id,
            missionTitle:
              typeof data.metadata?.missionTitle === 'string' && data.metadata.missionTitle.trim().length > 0
                ? data.metadata.missionTitle.trim()
                : 'Mission',
            mode: submissionMode,
            ...(typeof data.moderatorNote === 'string' && data.moderatorNote.trim().length > 0
              ? { moderatorNote: data.moderatorNote.trim() }
              : {}),
            ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : uid,
            ...(data.payload !== undefined ? { payload: data.payload } : {}),
            resolvedAtMs: reviewedAtMs ?? awardedAtMs ?? (data.status === 'approved' ? createdAtMs : null),
            ...(rewardBreakdown ? { rewardBreakdown } : {}),
            sourceId: data.sourceId,
            sourceType: data.sourceType,
            status: data.status,
            ...(streakSummary ? { streakSummary } : {}),
          });
        });

        nextSubmissions.sort((left, right) => {
          const leftTime = left.resolvedAtMs ?? left.createdAtMs;
          const rightTime = right.resolvedAtMs ?? right.createdAtMs;
          return rightTime - leftTime;
        });

        setSubmissions(nextSubmissions);
      },
      (error) => {
        console.warn('[useMissionSubmissions] Firestore listener error:', error);
        setSubmissions([]);
      },
    );

    return () => unsubscribe();
  }, [mode, refreshTrigger, uid]);

  return submissions;
}

function isMissionSourceType(value: unknown): value is 'quiz' | 'gps' | 'text' | 'photo' {
  return value === 'quiz' || value === 'gps' || value === 'text' || value === 'photo';
}

function isSubmissionStatus(value: unknown): value is 'pending' | 'approved' | 'rejected' {
  return value === 'pending' || value === 'approved' || value === 'rejected';
}

function readRewardBreakdown(data: Record<string, any>): RewardBreakdown | undefined {
  const payloadRewardBreakdown =
    data.payload && typeof data.payload === 'object' && data.payload.rewardBreakdown && typeof data.payload.rewardBreakdown === 'object'
      ? (data.payload.rewardBreakdown as RewardBreakdown)
      : undefined;

  if (data.rewardBreakdown && typeof data.rewardBreakdown === 'object') {
    return data.rewardBreakdown as RewardBreakdown;
  }

  return payloadRewardBreakdown;
}

function readStreakSummary(data: Record<string, any>): StreakSummary | undefined {
  if (data.streakSummary && typeof data.streakSummary === 'object') {
    return data.streakSummary as StreakSummary;
  }

  if (data.payload && typeof data.payload === 'object' && data.payload.streakSummary && typeof data.payload.streakSummary === 'object') {
    return data.payload.streakSummary as StreakSummary;
  }

  return undefined;
}

function readEarnedPoints(
  data: Record<string, any>,
  rewardBreakdown?: RewardBreakdown,
): number | null {
  if (typeof data.awardedPoints === 'number') {
    return Math.round(data.awardedPoints);
  }

  if (typeof data.earnedPoints === 'number') {
    return Math.round(data.earnedPoints);
  }

  if (data.payload && typeof data.payload === 'object' && typeof data.payload.earned === 'number') {
    return Math.round(data.payload.earned);
  }

  if (rewardBreakdown?.totalPoints !== undefined) {
    return Math.round(rewardBreakdown.totalPoints);
  }

  return null;
}

function timestampToMillisOrNull(value: unknown): number | null {
  const millis = timestampToMillis(value);
  return millis > 0 ? millis : null;
}

function timestampToMillis(value: unknown): number {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value && typeof value === 'object') {
    if (typeof (value as { toDate?: unknown }).toDate === 'function') {
      try {
        return (value as { toDate: () => Date }).toDate().getTime();
      } catch {
        return 0;
      }
    }

    if (typeof (value as { toMillis?: unknown }).toMillis === 'function') {
      try {
        return (value as { toMillis: () => number }).toMillis();
      } catch {
        return 0;
      }
    }

    const seconds = (value as { seconds?: unknown }).seconds;
    const nanoseconds = (value as { nanoseconds?: unknown }).nanoseconds;
    if (typeof seconds === 'number') {
      return seconds * 1000 + (typeof nanoseconds === 'number' ? Math.floor(nanoseconds / 1_000_000) : 0);
    }
  }

  return 0;
}
