import { useEffect, useState } from 'react';
import { getFirestore, collection, query, where, onSnapshot, FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import { V2_COLLECTION } from '@/src/core/firestore/schema';

/**
 * Real-time listener for a user's completed missions from scoreEvents.
 * Returns an array of mission IDs.
 */
export function useCompletedMissions(uid: string | undefined, refreshTrigger?: number): string[] {
    const [completedIds, setCompletedIds] = useState<string[]>([]);

    useEffect(() => {
        if (!uid) {
            setCompletedIds([]);
            return;
        }

        const db = getFirestore();
        const col = collection(db, V2_COLLECTION.scoreEvents);
        const q = query(col, where('uid', '==', uid));

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const ids: string[] = [];
                snapshot.forEach((doc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
                    const data = doc.data();
                    // Depending on schema, we check sourceType or reason to identify missions
                    if (['quiz', 'gps', 'text', 'photo'].includes(data.sourceType) && typeof data.sourceId === 'string') {
                        ids.push(data.sourceId);
                    }
                });
                setCompletedIds(ids);
            },
            (error) => {
                console.warn('[useCompletedMissions] Firestore listener error:', error);
                setCompletedIds([]);
            }
        );

        return () => unsubscribe();
    }, [uid, refreshTrigger]);

    return completedIds;
}
