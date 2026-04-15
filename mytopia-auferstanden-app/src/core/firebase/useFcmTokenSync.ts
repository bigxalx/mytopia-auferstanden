import { useEffect } from 'react';
import { getFCMToken } from '@/src/core/firebase/messagingClient';
import { V2_COLLECTION } from '@/src/core/firestore/schema';
import * as firestore from '@react-native-firebase/firestore';

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

        await persistFcmToken(userId, token);
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

export async function syncFcmTokenForUser(uid: string) {
  const token = await getFCMToken();
  if (!token) {
    return false;
  }

  await persistFcmToken(uid, token);
  return true;
}

async function persistFcmToken(uid: string, token: string) {
  const db = getFirestore();
  const userRef = doc(db, V2_COLLECTION.fcmRegistrations, uid);

  // We store tokens in an array to support multiple devices.
  // Using arrayUnion ensures no duplicates.
  await setDoc(userRef, {
    fcmTokens: arrayUnion(token),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}
