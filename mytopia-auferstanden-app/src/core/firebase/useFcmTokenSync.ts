import { useEffect } from 'react';
import { getFCMToken } from '@/src/core/firebase/messagingClient';
import { V2_COLLECTION } from '@/src/core/firestore/schema';

/** Lazy-loader for Firebase Firestore */
const getFirebaseFirestore = () => {
  try {
    return require('@react-native-firebase/firestore');
  } catch {
    return null;
  }
};

const firestore = getFirebaseFirestore();

const {
  getFirestore,
  doc,
  setDoc,
  arrayUnion,
} = firestore || {
  getFirestore: () => null,
  doc: () => null,
  setDoc: async () => {},
  arrayUnion: () => [],
};

/**
 * A hook that synchronizes the current device's FCM token to the user's Firestore document.
 * This allows the backend to send targeted push notifications.
 */
export function useFcmTokenSync(uid: string | undefined) {
  useEffect(() => {
    if (!uid) return;
    const userId = uid;
    let isCancelled = false;

    async function syncToken() {
      try {
        const token = await getFCMToken();
        if (isCancelled || !token) return;

        const db = getFirestore();
        const userRef = doc(db, V2_COLLECTION.fcmRegistrations, userId);

        // We store tokens in an array to support multiple devices.
        // Using arrayUnion ensures no duplicates.
        await setDoc(userRef, {
          fcmTokens: arrayUnion(token),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (error) {
        console.warn('[useFcmTokenSync] Failed to sync FCM token:', error);
      }
    }

    void syncToken();

    return () => {
      isCancelled = true;
    };
  }, [uid]);
}
