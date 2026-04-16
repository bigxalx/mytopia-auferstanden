import { useEffect, useState } from 'react';
import {
    FirebaseFirestoreTypes,
    collection,
    doc,
    getFirestore,
    limit,
    onSnapshot,
    orderBy,
    query,
    where,
} from '@react-native-firebase/firestore';

import {
    type RewardBreakdown,
    type StreakSummary,
    V2_COLLECTION,
} from '@/src/core/firestore/schema';

export type UserRewardSummary = {
    points: number | null;
    streakCount: number;
    streakMultiplier: number;
};

export type UserRewardHistoryItem = {
    createdAtMs: number;
    delta: number;
    id: string;
    missionTitle: string;
    rewardBreakdown?: RewardBreakdown;
    sourceId: string;
    sourceType: string;
    streakSummary?: StreakSummary;
};

export type MissionRewardItem = {
    createdAtMs: number;
    delta: number;
    id: string;
    missionTitle: string;
    rewardBreakdown?: RewardBreakdown;
    streakSummary?: StreakSummary;
};

export function useUserRewardSummary(
    uid: string | undefined,
    refreshTrigger?: number,
): UserRewardSummary {
    const [summary, setSummary] = useState<UserRewardSummary>({
        points: null,
        streakCount: 0,
        streakMultiplier: 1,
    });

    useEffect(() => {
        if (!uid) {
            setSummary({
                points: null,
                streakCount: 0,
                streakMultiplier: 1,
            });
            return;
        }

        const db = getFirestore();
        const userRef = doc(db, V2_COLLECTION.users, uid);

        const unsubscribe = onSnapshot(
            userRef,
            (snapshot) => {
                if (!snapshot.exists) {
                    setSummary({
                        points: null,
                        streakCount: 0,
                        streakMultiplier: 1,
                    });
                    return;
                }

                const data = snapshot.data();
                setSummary({
                    points: typeof data?.pointsCurrent === 'number' ? data.pointsCurrent : 0,
                    streakCount: typeof data?.streakCount === 'number' ? data.streakCount : 0,
                    streakMultiplier: typeof data?.streakMultiplierCurrent === 'number' ? data.streakMultiplierCurrent : 1,
                });
            },
            (error) => {
                console.warn('[useUserRewardSummary] Firestore listener error:', error);
                setSummary({
                    points: null,
                    streakCount: 0,
                    streakMultiplier: 1,
                });
            },
        );

        return () => unsubscribe();
    }, [refreshTrigger, uid]);

    return summary;
}

export function useUserRewardHistory(
    uid: string | undefined,
    refreshTrigger?: number,
): UserRewardHistoryItem[] {
    const [history, setHistory] = useState<UserRewardHistoryItem[]>([]);

    useEffect(() => {
        if (!uid) {
            setHistory([]);
            return;
        }

        const db = getFirestore();
        const scoreEventsQuery = query(
            collection(db, V2_COLLECTION.scoreEvents),
            where('uid', '==', uid),
            orderBy('createdAt', 'desc'),
            limit(20),
        );

        const unsubscribe = onSnapshot(
            scoreEventsQuery,
            (snapshot) => {
                const nextHistory: UserRewardHistoryItem[] = [];
                snapshot.forEach((docSnapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
                    const data = docSnapshot.data();
                    if (!isMissionRewardSourceType(data.sourceType)) {
                        return;
                    }

                    nextHistory.push({
                        createdAtMs: timestampToMillis(data.createdAt),
                        delta: typeof data.delta === 'number' ? data.delta : 0,
                        id: docSnapshot.id,
                        missionTitle:
                            typeof data.metadata?.missionTitle === 'string'
                                ? data.metadata.missionTitle
                                : 'Mission',
                        ...(data.metadata?.rewardBreakdown ? { rewardBreakdown: data.metadata.rewardBreakdown as RewardBreakdown } : {}),
                        sourceId: typeof data.sourceId === 'string' ? data.sourceId : '',
                        sourceType: typeof data.sourceType === 'string' ? data.sourceType : 'mission',
                        ...(data.metadata?.streakSummary ? { streakSummary: data.metadata.streakSummary as StreakSummary } : {}),
                    });
                });
                setHistory(nextHistory);
            },
            (error) => {
                console.warn('[useUserRewardHistory] Firestore listener error:', error);
                setHistory([]);
            },
        );

        return () => unsubscribe();
    }, [refreshTrigger, uid]);

    return history;
}

export function useMissionRewardEvent(
    uid: string | undefined,
    missionId: string | null | undefined,
    refreshTrigger?: number,
): MissionRewardItem | null {
    const [item, setItem] = useState<MissionRewardItem | null>(null);

    useEffect(() => {
        if (!uid || !missionId) {
            setItem(null);
            return;
        }

        const db = getFirestore();
        const scoreEventsQuery = query(
            collection(db, V2_COLLECTION.scoreEvents),
            where('uid', '==', uid),
        );

        const unsubscribe = onSnapshot(
            scoreEventsQuery,
            (snapshot) => {
                let nextItem: MissionRewardItem | null = null;

                snapshot.forEach((docSnapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
                    const data = docSnapshot.data();
                    if (!isMissionRewardSourceType(data.sourceType) || data.sourceId !== missionId) {
                        return;
                    }

                    const candidate: MissionRewardItem = {
                        createdAtMs: timestampToMillis(data.createdAt),
                        delta: typeof data.delta === 'number' ? data.delta : 0,
                        id: docSnapshot.id,
                        missionTitle:
                            typeof data.metadata?.missionTitle === 'string'
                                ? data.metadata.missionTitle
                                : 'Mission',
                        ...(data.metadata?.rewardBreakdown
                            ? { rewardBreakdown: data.metadata.rewardBreakdown as RewardBreakdown }
                            : {}),
                        ...(data.metadata?.streakSummary
                            ? { streakSummary: data.metadata.streakSummary as StreakSummary }
                            : {}),
                    };

                    if (!nextItem || candidate.createdAtMs > nextItem.createdAtMs) {
                        nextItem = candidate;
                    }
                });

                setItem(nextItem);
            },
            (error) => {
                console.warn('[useMissionRewardEvent] Firestore listener error:', error);
                setItem(null);
            },
        );

        return () => unsubscribe();
    }, [missionId, refreshTrigger, uid]);

    return item;
}

function isMissionRewardSourceType(value: unknown): value is 'quiz' | 'gps' | 'text' | 'photo' {
    return value === 'quiz' || value === 'gps' || value === 'text' || value === 'photo';
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
