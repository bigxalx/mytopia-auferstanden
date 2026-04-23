import { useEffect, useState } from 'react';
import { getFirestore, collection, query, where, onSnapshot, FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import { V2_COLLECTION } from '@/src/core/firestore/schema';
import { normalizeAppMode, type AppMode } from '@/src/core/session/appMode';

/**
 * Real-time listener for a user's approved missions from submissions.
 * Returns an array of mission IDs.
 */
export function useCompletedMissions(
    uid: string | undefined,
    mode: AppMode = 'production',
    refreshTrigger?: number,
): string[] {
    const [completedIds, setCompletedIds] = useState<string[]>([]);

    useEffect(() => {
        if (!uid) {
            setCompletedIds([]);
            return;
        }

        const db = getFirestore();
        const col = collection(db, V2_COLLECTION.submissions);
        const q = query(col, where('ownerUid', '==', uid));

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const ids = new Set<string>();
                snapshot.forEach((doc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
                    const data = doc.data();
                    if (
                        normalizeAppMode(data.mode) === mode &&
                        data.status === 'approved' &&
                        ['quiz', 'gps', 'text', 'photo'].includes(data.sourceType) &&
                        typeof data.sourceId === 'string'
                    ) {
                        ids.add(data.sourceId);
                    }
                });
                setCompletedIds([...ids]);
            },
            (error) => {
                console.warn('[useCompletedMissions] Firestore listener error:', error);
                setCompletedIds([]);
            }
        );

        return () => unsubscribe();
    }, [mode, uid, refreshTrigger]);

    return completedIds;
}
