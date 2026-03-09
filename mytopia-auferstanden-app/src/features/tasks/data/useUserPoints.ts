import { useEffect, useState } from 'react';
import firestore from '@react-native-firebase/firestore';

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

        const unsubscribe = firestore()
            .collection(V2_COLLECTION.users)
            .doc(uid)
            .onSnapshot(
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
