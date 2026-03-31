import { DecodedIdToken } from 'firebase-admin/auth';
import { DocumentData, Query } from 'firebase-admin/firestore';
import { Request } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { auth, firestore, storage } from './firebase.js';

import {
    LEGACY_USERS_COLLECTION_PATH,
    V2_LEADERBOARD_COLLECTION_PATH, V2_SCORE_EVENTS_COLLECTION_PATH, V2_SUBMISSIONS_COLLECTION_PATH,
    V2_USERS_COLLECTION_PATH
} from './constants.js';
import {
    HttpError,
    sendError
} from './utils.js';
import {
    FirebaseResponse
} from './types.js';
export async function verifyFirebaseUser(req: Request): Promise<DecodedIdToken> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing bearer token.');
    }

    const idToken = authHeader.slice('Bearer '.length);
    try {
    return await auth.verifyIdToken(idToken);
    } catch {
    throw new HttpError(401, 'Invalid Firebase ID token.');
    }
}

export async function handleDeleteAccount(req: Request, res: FirebaseResponse) {
    if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
    }

    try {
    const decodedToken = await verifyFirebaseUser(req);
    await deleteAccountData(decodedToken.uid);
    await auth.deleteUser(decodedToken.uid);

    logger.info('deleteAccount succeeded', { uid: decodedToken.uid });
    res.status(200).json({ ok: true });
    } catch (error) {
    logger.error('deleteAccount failed', error);
    sendError(res, error);
    }
}

export async function deleteAccountData(uid: string) {
    const userDocumentPaths = [`${V2_USERS_COLLECTION_PATH}/${uid}`, `${LEGACY_USERS_COLLECTION_PATH}/${uid}`];
    await Promise.all([
    ...userDocumentPaths.map((path) => firestore.doc(path).delete().catch(() => undefined)),
    deleteDocumentsByQuery(firestore.collection(V2_SUBMISSIONS_COLLECTION_PATH).where('ownerUid', '==', uid)),
    deleteDocumentsByQuery(firestore.collection(V2_SCORE_EVENTS_COLLECTION_PATH).where('uid', '==', uid)),
    deleteDocumentsByQuery(firestore.collection(V2_LEADERBOARD_COLLECTION_PATH).where('uid', '==', uid)),
    storage.bucket().deleteFiles({ prefix: `submissions/${uid}/` }).catch(() => undefined),
    ]);
}

export async function deleteDocumentsByQuery(query: Query<DocumentData>) {
    while (true) {
    const snapshot = await query.limit(100).get();
    if (snapshot.empty) {
      return;
    }

    const batch = firestore.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    }
}
