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
import { computeRewardOutcome } from './rewards.js';
import type { RewardBreakdownDto, StreakSummaryDto } from './types.js';
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
          const basePoints = Number(afterData.earnedPoints);
          if (!Number.isFinite(basePoints) || basePoints <= 0) {
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
          const customAchievementIds = Array.isArray(afterData.customAchievementIds)
            ? afterData.customAchievementIds.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
            : [];
          const awardedAtMs = Date.now();
          const rewardOutcome = await computeRewardOutcome({
            awardAtMs: awardedAtMs,
            basePoints,
            customAchievementIds,
            missionId,
            mode: afterData.mode === 'dev' ? 'dev' : 'production',
            timeReferenceAtMs: toMillis(afterData.createdAt) ?? awardedAtMs,
            uid,
          });

          const awardIdempotencyKey = `award:${submitIdempotencyKey}`;
          const eventRef = firestore.collection(V2_SCORE_EVENTS_COLLECTION_PATH).doc(awardIdempotencyKey);
          const userRef = firestore.collection(V2_USERS_COLLECTION_PATH).doc(uid);
          const submissionRef = docAfter.ref;

          const batch = firestore.batch();

          batch.set(eventRef, {
            createdAt: FieldValue.serverTimestamp(),
            createdBy: 'system',
            delta: rewardOutcome.breakdown.totalPoints,
            idempotencyKey: awardIdempotencyKey,
            metadata: {
              missionTitle: afterData.metadata?.missionTitle ?? 'Unbekannt',
              rewardBreakdown: rewardOutcome.breakdown,
              streakSummary: rewardOutcome.streakSummary,
            },
            reason: `${sourceType}_approved`,
            sourceId: missionId,
            sourceType,
            uid,
          });

          batch.set(userRef, {
            ...(rewardOutcome.appliedGroupBonusId
              ? { awardedGroupBonusIds: FieldValue.arrayUnion(rewardOutcome.appliedGroupBonusId) }
              : {}),
            uid,
            pointsCurrent: FieldValue.increment(rewardOutcome.breakdown.totalPoints),
            streakCount: rewardOutcome.streakSummary.count,
            streakLastUpdatedAt: new Date(awardedAtMs).toISOString(),
            streakMultiplierCurrent: rewardOutcome.streakSummary.multiplier,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          batch.set(submissionRef, {
            awarded: true,
            awardedAt: FieldValue.serverTimestamp(),
            awardedPoints: rewardOutcome.breakdown.totalPoints,
            rewardBreakdown: rewardOutcome.breakdown,
          }, { merge: true });

          await batch.commit();
          await syncUserToLeaderboard(uid);

          logger.info('submission approved and scored', {
            earnedPoints: rewardOutcome.breakdown.totalPoints,
            missionId,
            uid,
            submissionId: event.params.submissionId,
          });

          await writeChannelModerationUpdates({
            afterData,
            earnedPoints: rewardOutcome.breakdown.totalPoints,
            missionId,
            outcome: 'approved',
            rewardBreakdown: rewardOutcome.breakdown,
            submissionId: event.params.submissionId,
            streakSummary: rewardOutcome.streakSummary,
            uid,
          });

          // Send targeted notification
          const missionTitle = afterData.metadata?.missionTitle ?? 'Unbekannt';
          await sendTargetedNotification(uid, {
            title: 'Mission bestätigt!',
            body: `Deine Mission "${missionTitle}" wurde bestätigt. Du hast ${rewardOutcome.breakdown.totalPoints} Punkte erhalten.`,
          }, {
            type: 'submission_approved',
            missionId,
          });
        } else if (beforeStatus !== 'rejected' && afterStatus === 'rejected') {
          const uid = afterData.ownerUid;
          const missionId = afterData.sourceId;
          const missionTitle = afterData.metadata?.missionTitle ?? 'Unbekannt';

          logger.info('submission rejected', { missionId, uid, submissionId: event.params.submissionId });

          await firestore.collection(V2_USERS_COLLECTION_PATH).doc(uid).set({
            streakCount: 0,
            streakLastUpdatedAt: new Date().toISOString(),
            streakMultiplierCurrent: 1,
            uid,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

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
  rewardBreakdown,
  submissionId,
  streakSummary,
  uid,
}: {
  afterData: Record<string, any>;
  earnedPoints?: number;
  missionId: string;
  outcome: 'approved' | 'rejected';
  rewardBreakdown?: RewardBreakdownDto;
  submissionId: string;
  streakSummary?: StreakSummaryDto;
  uid: string;
}) {
  const channelMeta =
    afterData.metadata && typeof afterData.metadata === 'object' && afterData.metadata.channelMeta && typeof afterData.metadata.channelMeta === 'object'
      ? afterData.metadata.channelMeta
      : null;
  const channelId = channelMeta && typeof channelMeta.channelId === 'string' ? channelMeta.channelId : null;
  const actorId = channelMeta && typeof channelMeta.actorId === 'string' ? channelMeta.actorId : null;
  if (!channelId || !actorId) {
    return;
  }

  const mode = afterData.mode === 'dev' ? 'dev' : 'production';
  const createdAtMs = Date.now();
  const actorName = channelMeta && typeof channelMeta.actorName === 'string' ? channelMeta.actorName : 'System';
  const actorAvatarUrl =
    channelMeta && typeof channelMeta.actorAvatarUrl === 'string' ? channelMeta.actorAvatarUrl : undefined;
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
        ...(rewardBreakdown ? { rewardBreakdown } : {}),
        status: outcome,
        ...(streakSummary ? { streakSummary } : {}),
      },
    },
  });
}

function toMillis(value: unknown): number | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === 'object' && value !== null) {
    if (typeof (value as { toMillis?: unknown }).toMillis === 'function') {
      try {
        const result = (value as { toMillis: () => number }).toMillis();
        return Number.isFinite(result) ? result : null;
      } catch {
        return null;
      }
    }

    const seconds = (value as { seconds?: unknown }).seconds;
    const nanoseconds = (value as { nanoseconds?: unknown }).nanoseconds;
    if (typeof seconds === 'number') {
      return (seconds * 1000) + (typeof nanoseconds === 'number' ? Math.floor(nanoseconds / 1_000_000) : 0);
    }
  }

  return null;
}
