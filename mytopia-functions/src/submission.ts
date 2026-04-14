import { FieldValue } from 'firebase-admin/firestore';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { firestore, messaging } from './firebase.js';
import { upsertChannelMessage } from './channelThreads.js';

import {
    V2_FCM_REGISTRATIONS_COLLECTION_PATH,
    V2_SCORE_EVENTS_COLLECTION_PATH, V2_SUBMISSIONS_COLLECTION_PATH,
    V2_USERS_COLLECTION_PATH
} from './constants.js';
import { syncUserToLeaderboard } from './leaderboard.js';
export const submissionModerated = onDocumentUpdated(
      {
        document: `${V2_SUBMISSIONS_COLLECTION_PATH}/{submissionId}`,
        region: 'europe-west1',
      },
      async (event) => {
        const docBefore = event.data?.before;
        const docAfter = event.data?.after;

        if (!docBefore || !docAfter) return;

        const beforeStatus = docBefore.data().status;
        const afterData = docAfter.data();
        const afterStatus = afterData.status;

        if (beforeStatus !== 'approved' && afterStatus === 'approved') {
          const earnedPoints = Number(afterData.earnedPoints);
          if (!Number.isFinite(earnedPoints) || earnedPoints <= 0) {
            logger.warn('Approved submission without valid earnedPoints', { submissionId: event.params.submissionId });
            return;
          }

          if (afterData.awarded) {
            return; // Already awarded
          }

          const uid = afterData.ownerUid;
          const missionId = afterData.sourceId;
          const sourceType = afterData.sourceType as 'text' | 'photo';
          const submitIdempotencyKey = afterData.idempotencyKey;

          const awardIdempotencyKey = `award:${submitIdempotencyKey}`;
          const eventRef = firestore.collection(V2_SCORE_EVENTS_COLLECTION_PATH).doc(awardIdempotencyKey);
          const userRef = firestore.collection(V2_USERS_COLLECTION_PATH).doc(uid);
          const submissionRef = docAfter.ref;

          const batch = firestore.batch();

          batch.set(eventRef, {
            createdAt: FieldValue.serverTimestamp(),
            createdBy: 'system',
            delta: earnedPoints,
            idempotencyKey: awardIdempotencyKey,
            metadata: {
              missionTitle: afterData.metadata?.missionTitle ?? 'Unbekannt',
            },
            reason: `${sourceType}_approved`,
            sourceId: missionId,
            sourceType,
            uid,
          });

          batch.set(userRef, {
            uid,
            pointsCurrent: FieldValue.increment(earnedPoints),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          batch.set(submissionRef, {
            awarded: true,
            awardedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          await batch.commit();
          await syncUserToLeaderboard(uid);

          logger.info('submission approved and scored', { earnedPoints, missionId, uid, submissionId: event.params.submissionId });

          await writeChannelModerationUpdates({
            afterData,
            earnedPoints,
            missionId,
            outcome: 'approved',
            submissionId: event.params.submissionId,
            uid,
          });

          // Send targeted notification
          const missionTitle = afterData.metadata?.missionTitle ?? 'Unbekannt';
          await sendTargetedNotification(uid, {
            title: 'Mission bestätigt!',
            body: `Deine Mission "${missionTitle}" wurde bestätigt. Du hast ${earnedPoints} Punkte erhalten.`,
          }, {
            type: 'submission_approved',
            missionId,
          });
        } else if (beforeStatus !== 'rejected' && afterStatus === 'rejected') {
          const uid = afterData.ownerUid;
          const missionId = afterData.sourceId;
          const missionTitle = afterData.metadata?.missionTitle ?? 'Unbekannt';

          logger.info('submission rejected', { missionId, uid, submissionId: event.params.submissionId });

          await writeChannelModerationUpdates({
            afterData,
            missionId,
            outcome: 'rejected',
            submissionId: event.params.submissionId,
            uid,
          });

          await sendTargetedNotification(uid, {
            title: 'Mission leider nicht bestätigt',
            body: `Deine Mission "${missionTitle}" konnte leider nicht bestätigt werden.`,
          }, {
            type: 'submission_rejected',
            missionId,
          });
        }
      }
    );

/**
 * Sends a targeted push notification to all registered FCM tokens of a specific user.
 */
export async function sendTargetedNotification(uid: string, notification: { title: string; body: string }, data?: Record<string, string>) {
    try {
    const regRef = firestore.collection(V2_FCM_REGISTRATIONS_COLLECTION_PATH).doc(uid);
    const regDoc = await regRef.get();
    if (!regDoc.exists) {
      logger.info('sendTargetedNotification: no registration doc for user', { uid });
      return;
    }

    const regData = regDoc.data()!;
    const tokens = regData.fcmTokens;
    if (!Array.isArray(tokens) || tokens.length === 0) {
      logger.info('sendTargetedNotification: No FCM tokens for user', { uid });
      return;
    }

    // Filter out potential non-string tokens if any corrupted data exists
    const validTokens = tokens.filter((t): t is string => typeof t === 'string' && t.length > 0);
    if (validTokens.length === 0) return;

    const response = await messaging.sendEachForMulticast({
      tokens: validTokens,
      notification,
      data: data || {},
    });

    logger.info('Targeted notification sent', {
      uid,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });
    } catch (err) {
    logger.error('Failed to send targeted notification', { uid, error: err });
    }
}

async function writeChannelModerationUpdates({
  afterData,
  earnedPoints,
  missionId,
  outcome,
  submissionId,
  uid,
}: {
  afterData: Record<string, any>;
  earnedPoints?: number;
  missionId: string;
  outcome: 'approved' | 'rejected';
  submissionId: string;
  uid: string;
}) {
  const channelId = typeof afterData.metadata?.channelId === 'string' ? afterData.metadata.channelId : null;
  const actorId = typeof afterData.metadata?.actorId === 'string' ? afterData.metadata.actorId : null;
  if (!channelId || !actorId) {
    return;
  }

  const mode = afterData.mode === 'dev' ? 'dev' : 'production';
  const createdAtMs = Date.now();
  const actorName = typeof afterData.metadata?.actorName === 'string' ? afterData.metadata.actorName : 'System';
  const actorAvatarUrl =
    typeof afterData.metadata?.actorAvatarUrl === 'string' ? afterData.metadata.actorAvatarUrl : undefined;
  const missionTitle = typeof afterData.metadata?.missionTitle === 'string' ? afterData.metadata.missionTitle : 'Mission';
  const moderatorNote =
    typeof afterData.moderatorNote === 'string' && afterData.moderatorNote.trim().length > 0
      ? afterData.moderatorNote.trim()
      : outcome === 'approved'
        ? `Deine Mission "${missionTitle}" wurde bestätigt.`
        : `Deine Mission "${missionTitle}" wurde leider nicht bestätigt.`;

  await upsertChannelMessage({
    actorAvatarUrl,
    actorId,
    actorName,
    channelId,
    channelType: 'actor',
    createdAtMs,
    incrementUnread: true,
    messageId: `${submissionId}:moderation`,
    mode,
    ownerUid: uid,
    text: moderatorNote,
    title: actorName,
  });

  await upsertChannelMessage({
    actorId,
    channelId,
    channelType: 'actor',
    createdAtMs: createdAtMs + 1,
    incrementUnread: true,
    isUser: false,
    messageId: `${submissionId}:result`,
    mode,
    ownerUid: uid,
    title: actorName,
    attachment: {
      _type: 'missionResultAttachment',
      earnedPoints,
      kind: afterData.sourceType ?? 'mission',
      missionId,
      missionTitle,
      payload: {
        action: outcome,
        moderatorNote,
        status: outcome,
      },
    },
  });
}
