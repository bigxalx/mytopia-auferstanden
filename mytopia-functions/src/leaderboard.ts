import { FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { firestore } from './firebase.js';

import {
    V2_LEADERBOARD_COLLECTION_PATH,
    V2_USERS_COLLECTION_PATH
} from './constants.js';

/**
 * Ensures a user's current points and display name are mirrored to the leaderboard collection.
 * This should be called after any points update.
 */
export async function syncUserToLeaderboard(uid: string) {
    try {
    const userRef = firestore.collection(V2_USERS_COLLECTION_PATH).doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      logger.warn('syncUserToLeaderboard: user doc not found', { uid });
      return;
    }

    const userData = userDoc.data()!;
    const points = userData.pointsCurrent || 0;
    const name = userData.displayName || 'Anonym';

    const leadRef = firestore.collection(V2_LEADERBOARD_COLLECTION_PATH).doc(uid);
    await leadRef.set({
      uid,
      displayName: name,
      pointsCurrent: points,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    logger.info('Leaderboard synced', { uid, points });
    } catch (err) {
    logger.error('Failed to sync leaderboard', { uid, error: err });
    }
}
