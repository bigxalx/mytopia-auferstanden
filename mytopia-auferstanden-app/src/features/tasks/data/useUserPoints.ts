import { useEffect, useState } from 'react';
import { getFirestore, doc, onSnapshot } from '@react-native-firebase/firestore';

import { V2_COLLECTION } from '@/src/core/firestore/schema';

/**
 * Real-time listener for a user's current season points from Firestore.
 * Returns `null` while loading or if no user doc exists.
 */
export function useUserPoints(uid: string | undefined): number | null {
    const [points, setPoints] = useState<number | null>(null);

    useEffect(() => {
        if (!uid) {
            setPoints(null);
            return;
        }

        const db = getFirestore();
        const userRef = doc(db, V2_COLLECTION.users, uid);

        const unsubscribe = onSnapshot(
            userRef,
            (snapshot) => {
                if (!snapshot.exists) {
                    setPoints(null);
                    return;
                }

                const data = snapshot.data();
                if (data) {
                    setPoints(typeof data.pointsCurrent === 'number' ? data.pointsCurrent : 0);
                } else {
                    setPoints(null);
                }
            },
            (error) => {
                console.warn('[useUserPoints] Firestore listener error:', error);
                setPoints(null);
            }
        );

        return () => unsubscribe();
    }, [uid]);

    return points;
}
