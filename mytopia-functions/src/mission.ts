import { FieldValue } from 'firebase-admin/firestore';
import { onRequest, Request } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { firestore } from './firebase.js';

import {
    MISSION_SCORING_PROJECTION,
    V2_SUBMISSIONS_COLLECTION_PATH
} from './constants.js';

import { resolveMode } from './config.js';

import {
    HttpError,
    normalizeRequestPath,
    readQueryParam,
    sendError
} from './utils.js';

import { sanityQuery } from './sanity.js';

import { syncUserToLeaderboard } from './leaderboard.js';

import { verifyFirebaseUser } from './auth.js';
import {
    FirebaseResponse, MissionDto
} from './types.js';
export const missionApi = onRequest({ cors: true, region: 'europe-west1' }, async (req, res) => {
      const path = normalizeRequestPath(req.path);

      if (path === '/quiz/complete') {
        await handleQuizComplete(req, res);
        return;
      }

      if (path === '/gps/complete') {
        await handleGpsComplete(req, res);
        return;
      }

      if (path === '/text/submit') {
        await handleTextSubmit(req, res);
        return;
      }

      if (path === '/photo/submit') {
        await handlePhotoSubmit(req, res);
        return;
      }

      if (path === '/settings') {
        await handleGetSettings(req, res);
        return;
      }

      res.status(404).json({ error: 'Route not found.' });
    });

export async function handleQuizComplete(req: Request, res: FirebaseResponse) {
    if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
    }

    try {
    const mode = resolveMode(readQueryParam(req, 'mode'));
    const decodedToken = await verifyFirebaseUser(req);
    const uid = decodedToken.uid;

    if (mode === 'dev' && decodedToken.dev !== true) {
      throw new HttpError(403, 'Dev missions require Firebase custom claim dev=true.');
    }

    const body = req.body as { answers?: number[]; missionId?: string } | undefined;
    const missionId = body?.missionId;
    const answers = body?.answers;

    if (typeof missionId !== 'string' || !missionId) {
      throw new HttpError(400, 'Missing missionId.');
    }

    if (!Array.isArray(answers)) {
      throw new HttpError(400, 'Missing answers array.');
    }

    // Fetch mission and global settings from Sanity
    const query = `{
      "mission": *[_type == "mission" && _id == $missionId && !(_id in path("drafts.**")) && count(*[_type == "narrativeBundle" && !(_id in path("drafts.**")) && (publishMode == "instant" || (defined(releaseAt) && dateTime(releaseAt) <= dateTime(now()))) && references(^._id)]) > 0][0]{${MISSION_SCORING_PROJECTION}},
      "settings": *[_type == "siteSettings" && !(_id in path("drafts.**"))][0]{
        defaultQuizFeedbackCorrect,
        defaultQuizFeedbackIncorrect
      }
    }`;
    const { mission, settings } = await sanityQuery<{ mission: MissionDto | null; settings: any }>(query, { missionId }, mode);

    if (!mission) {
      throw new HttpError(404, 'Mission not found.');
    }

    if (!mission.active) {
      throw new HttpError(400, 'Mission is not active.');
    }

    assertMissionNotExpired(mission);

    if (mission.kind !== 'quiz') {
      throw new HttpError(400, 'Mission is not a quiz.');
    }

    const questions = mission.questions ?? [];
    if (questions.length === 0) {
      throw new HttpError(400, 'Mission has no questions.');
    }

    if (answers.length !== questions.length) {
      throw new HttpError(400, `Expected ${questions.length} answers, got ${answers.length}.`);
    }

    // Validate answers
    let correctCount = 0;
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const selectedIndex = answers[i];

      if (typeof selectedIndex !== 'number' || selectedIndex < 0 || selectedIndex >= question.options.length) {
        throw new HttpError(400, `Invalid answer index at position ${i}.`);
      }

      if (question.options[selectedIndex].isCorrect) {
        correctCount++;
      }
    }

    const earned = Math.round((correctCount / questions.length) * mission.points);
    const idempotencyKey = `quiz:${missionId}:${uid}`;

    // Check idempotency
    const existingEvent = await firestore
      .collection('v2/app/scoreEvents')
      .where('idempotencyKey', '==', idempotencyKey)
      .limit(1)
      .get();

    if (!existingEvent.empty) {
      const existing = existingEvent.docs[0].data();
      res.status(200).json({
        action: 'already_completed',
        correct: correctCount,
        earned: existing.delta,
        total: questions.length,
      });
      return;
    }

    // Batch write: scoreEvent + increment user pointsCurrent
    const batch = firestore.batch();
    const eventRef = firestore.collection('v2/app/scoreEvents').doc(idempotencyKey);
    const userRef = firestore.collection('v2/app/users').doc(uid);

    batch.set(eventRef, {
      createdAt: FieldValue.serverTimestamp(),
      createdBy: 'system',
      delta: earned,
      idempotencyKey,
      metadata: {
        correct: correctCount,
        missionTitle: mission.title,
        total: questions.length,
      },
      reason: 'quiz_completed',
      sourceId: missionId,
      sourceType: 'quiz',
      uid,
    });

    batch.set(userRef, {
      uid,
      pointsCurrent: FieldValue.increment(earned),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Also create a submission record for the feed
    const submissionRef = firestore.collection(V2_SUBMISSIONS_COLLECTION_PATH).doc(idempotencyKey);
    batch.set(submissionRef, {
      createdAt: FieldValue.serverTimestamp(),
      idempotencyKey,
      metadata: { missionTitle: mission.title },
      mode,
      ownerUid: uid,
      payload: {
        correctCount,
        totalCount: questions.length,
        earned,
      },
      sourceId: missionId,
      sourceType: 'quiz',
      status: 'approved',
      awarded: true,
      awardedAt: FieldValue.serverTimestamp(),
      moderatorNote: correctCount === questions.length 
        ? (mission.feedbackCorrect || settings?.defaultQuizFeedbackCorrect || 'Hervorragend! Alles richtig.') 
        : (mission.feedbackIncorrect || settings?.defaultQuizFeedbackIncorrect || 'Nicht ganz perfekt, aber okay!'),
    });

    await batch.commit();
    await syncUserToLeaderboard(uid);

    logger.info('quizComplete scored', { correct: correctCount, earned, missionId, total: questions.length, uid });

    res.status(200).json({
      action: 'scored',
      correct: correctCount,
      earned,
      total: questions.length,
    });
    } catch (error) {
    logger.error('quizComplete failed', error);
    sendError(res, error);
    }
}

export async function handleGpsComplete(req: Request, res: FirebaseResponse) {
    if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
    }

    try {
    const mode = resolveMode(readQueryParam(req, 'mode'));
    const decodedToken = await verifyFirebaseUser(req);
    const uid = decodedToken.uid;

    if (mode === 'dev' && decodedToken.dev !== true) {
      throw new HttpError(403, 'Dev missions require Firebase custom claim dev=true.');
    }

    const body = req.body as { missionId?: string } | undefined;
    const missionId = body?.missionId;

    if (typeof missionId !== 'string' || !missionId) {
      throw new HttpError(400, 'Missing missionId.');
    }

    // Fetch mission from Sanity (no answers needed, just verify it exists)
    const query = `*[_type == "mission" && _id == $missionId && !(_id in path("drafts.**")) && count(*[_type == "narrativeBundle" && !(_id in path("drafts.**")) && (publishMode == "instant" || (defined(releaseAt) && dateTime(releaseAt) <= dateTime(now()))) && references(^._id)]) > 0][0]{ _id, title, kind, points, active, expiresAt }`;
    const mission = await sanityQuery<MissionDto | null>(query, { missionId }, mode);

    if (!mission) {
      throw new HttpError(404, 'Mission not found.');
    }

    if (!mission.active) {
      throw new HttpError(400, 'Mission is not active.');
    }

    assertMissionNotExpired(mission);

    if (mission.kind !== 'gps') {
      throw new HttpError(400, 'Mission is not a GPS mission.');
    }

    const earned = mission.points;
    const idempotencyKey = `gps:${missionId}:${uid}`;

    // Check idempotency
    const existingEvent = await firestore
      .collection('v2/app/scoreEvents')
      .where('idempotencyKey', '==', idempotencyKey)
      .limit(1)
      .get();

    if (!existingEvent.empty) {
      const existing = existingEvent.docs[0].data();
      res.status(200).json({
        action: 'already_completed',
        earned: existing.delta,
      });
      return;
    }

    // Batch write: scoreEvent + increment user pointsCurrent
    const batch = firestore.batch();
    const eventRef = firestore.collection('v2/app/scoreEvents').doc(idempotencyKey);
    const userRef = firestore.collection('v2/app/users').doc(uid);

    batch.set(eventRef, {
      createdAt: FieldValue.serverTimestamp(),
      createdBy: 'system',
      delta: earned,
      idempotencyKey,
      metadata: {
        missionTitle: mission.title,
      },
      reason: 'gps_completed',
      sourceId: missionId,
      sourceType: 'gps',
      uid,
    });

    batch.set(userRef, {
      uid,
      pointsCurrent: FieldValue.increment(earned),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Also create a submission record for the feed
    const submissionRef = firestore.collection(V2_SUBMISSIONS_COLLECTION_PATH).doc(idempotencyKey);
    batch.set(submissionRef, {
      createdAt: FieldValue.serverTimestamp(),
      idempotencyKey,
      metadata: { missionTitle: mission.title },
      mode,
      ownerUid: uid,
      payload: {}, // No specific payload needed for GPS yet, just the pin is enough
      sourceId: missionId,
      sourceType: 'gps',
      status: 'approved',
      awarded: true,
      awardedAt: FieldValue.serverTimestamp(),
      moderatorNote: mission.feedbackCorrect || 'Standort verifiziert! Gute Arbeit.',
    });

    await batch.commit();
    await syncUserToLeaderboard(uid);

    logger.info('gpsComplete scored', { earned, missionId, uid });

    res.status(200).json({
      action: 'scored',
      earned,
    });
    } catch (error) {
    logger.error('gpsComplete failed', error);
    sendError(res, error);
    }
}

export async function handleTextSubmit(req: Request, res: FirebaseResponse) {
    if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
    }

    try {
    const mode = resolveMode(readQueryParam(req, 'mode'));
    const decodedToken = await verifyFirebaseUser(req);
    const uid = decodedToken.uid;

    if (mode === 'dev' && decodedToken.dev !== true) {
      throw new HttpError(403, 'Dev missions require Firebase custom claim dev=true.');
    }

    const body = req.body as { missionId?: string; text?: string } | undefined;
    const missionId = body?.missionId;
    const text = body?.text?.trim();

    if (typeof missionId !== 'string' || !missionId) {
      throw new HttpError(400, 'Missing missionId.');
    }

    if (typeof text !== 'string' || !text) {
      throw new HttpError(400, 'Missing text payload.');
    }

    const query = `*[_type == "mission" && _id == $missionId && !(_id in path("drafts.**")) && count(*[_type == "narrativeBundle" && !(_id in path("drafts.**")) && (publishMode == "instant" || (defined(releaseAt) && dateTime(releaseAt) <= dateTime(now()))) && references(^._id)]) > 0][0]{ _id, title, kind, points, active, expiresAt }`;
    const mission = await sanityQuery<MissionDto | null>(query, { missionId }, mode);

    if (!mission) {
      throw new HttpError(404, 'Mission not found.');
    }

    if (!mission.active) {
      throw new HttpError(400, 'Mission is not active.');
    }

    assertMissionNotExpired(mission);

    if (mission.kind !== 'text') {
      throw new HttpError(400, 'Mission is not a text mission.');
    }

    const idempotencyKey = `text:${missionId}:${uid}`;
    const submissionRef = firestore.collection(V2_SUBMISSIONS_COLLECTION_PATH).doc(idempotencyKey);

    const doc = await submissionRef.get();
    if (doc.exists) {
      res.status(200).json({ action: 'already_submitted' });
      return;
    }

    await submissionRef.set({
      createdAt: FieldValue.serverTimestamp(),
      idempotencyKey,
      metadata: {
        missionTitle: mission.title,
      },
      mode,
      ownerUid: uid,
      payload: text,
      sourceId: missionId,
      sourceType: 'text',
      status: 'pending',
    });

    logger.info('textSubmit queued', { missionId, uid });
    res.status(200).json({ action: 'submitted' });
    } catch (error) {
    logger.error('textSubmit failed', error);
    sendError(res, error);
    }
}

export async function handlePhotoSubmit(req: Request, res: FirebaseResponse) {
    if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
    }

    try {
    const mode = resolveMode(readQueryParam(req, 'mode'));
    const decodedToken = await verifyFirebaseUser(req);
    const uid = decodedToken.uid;

    if (mode === 'dev' && decodedToken.dev !== true) {
      throw new HttpError(403, 'Dev missions require Firebase custom claim dev=true.');
    }

    const body = req.body as { missionId?: string; photoPath?: string } | undefined;
    const missionId = body?.missionId;
    const photoPath = body?.photoPath?.trim();

    if (typeof missionId !== 'string' || !missionId) {
      throw new HttpError(400, 'Missing missionId.');
    }

    if (typeof photoPath !== 'string' || !photoPath) {
      throw new HttpError(400, 'Missing photoPath payload.');
    }

    const query = `*[_type == "mission" && _id == $missionId && !(_id in path("drafts.**")) && count(*[_type == "narrativeBundle" && !(_id in path("drafts.**")) && (publishMode == "instant" || (defined(releaseAt) && dateTime(releaseAt) <= dateTime(now()))) && references(^._id)]) > 0][0]{ _id, title, kind, points, active, expiresAt }`;
    const mission = await sanityQuery<MissionDto | null>(query, { missionId }, mode);

    if (!mission) {
      throw new HttpError(404, 'Mission not found.');
    }

    if (!mission.active) {
      throw new HttpError(400, 'Mission is not active.');
    }

    assertMissionNotExpired(mission);

    if (mission.kind !== 'photo') {
      throw new HttpError(400, 'Mission is not a photo mission.');
    }

    const idempotencyKey = `photo:${missionId}:${uid}`;
    const submissionRef = firestore.collection(V2_SUBMISSIONS_COLLECTION_PATH).doc(idempotencyKey);

    const doc = await submissionRef.get();
    if (doc.exists) {
      res.status(200).json({ action: 'already_submitted' });
      return;
    }

    await submissionRef.set({
      createdAt: FieldValue.serverTimestamp(),
      idempotencyKey,
      metadata: {
        missionTitle: mission.title,
      },
      mode,
      ownerUid: uid,
      payload: photoPath,
      sourceId: missionId,
      sourceType: 'photo',
      status: 'pending',
    });

    logger.info('photoSubmit queued', { missionId, uid });
    res.status(200).json({ action: 'submitted' });
    } catch (error) {
    logger.error('photoSubmit failed', error);
    sendError(res, error);
    }
}

export async function handleGetSettings(req: Request, res: FirebaseResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const mode = resolveMode(readQueryParam(req, 'mode'));
    const query = `*[_type == "siteSettings" && !(_id in path("drafts.**"))][0]{
      defaultQuizFeedbackCorrect,
      defaultQuizFeedbackIncorrect
    }`;
    const settings = await sanityQuery<any>(query, {}, mode);
    res.status(200).json(settings || {});
  } catch (error) {
    logger.error('handleGetSettings failed', error);
    sendError(res, error);
  }
}

function assertMissionNotExpired(mission: MissionDto) {
    if (!mission.expiresAt) {
      return;
    }

    const expiresAt = Date.parse(mission.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      throw new HttpError(400, 'Mission has expired.');
    }
}
