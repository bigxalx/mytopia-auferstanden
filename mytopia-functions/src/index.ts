import { CloudTasksClient } from '@google-cloud/tasks';
import { OAuth2Client } from 'google-auth-library';
import { initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp, type DocumentData, type Query } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onRequest, type Request } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { isValidSignature, SIGNATURE_HEADER_NAME } from '@sanity/webhook';

initializeApp();

const firestore = getFirestore();
const auth = getAuth();
const messaging = getMessaging();
const tasksClient = new CloudTasksClient();
const oidcClient = new OAuth2Client();

const LEGACY_USERS_COLLECTION_PATH = 'users';
const NARRATIVE_STATE_COLLECTION_PATH = 'v2/app/narrativeState';
const NARRATIVE_STATE_COLLECTION_PATH_DEV = 'v2/app/narrativeStateDev';
const V2_LEADERBOARD_COLLECTION_PATH = 'v2/app/leaderboard';
const V2_SCORE_EVENTS_COLLECTION_PATH = 'v2/app/scoreEvents';
const V2_SUBMISSIONS_COLLECTION_PATH = 'v2/app/submissions';
const V2_USERS_COLLECTION_PATH = 'v2/app/users';
const SANITY_API_VERSION = 'v2025-02-19';
const SANITY_BUNDLE_PROJECTION = `
  _id,
  script,
  "scriptActor": scriptActor->{
    name,
    role,
    "avatarUrl": avatar.asset->url
  },
  releaseAt,
  pushTitle,
  pushBody,
  messages[]{
    messageId,
    text,
    "actor": actor->{
      name,
      role,
      "avatarUrl": avatar.asset->url
    },
    "attachment": attachment[0]{
      _type,
      _type == "imageAttachment" => {
        "url": asset.asset->url,
        caption
      },
      _type == "audioAttachment" => {
        "url": asset.asset->url,
        "originalFilename": asset.asset->originalFilename,
        "mimeType": asset.asset->mimeType,
        "extension": asset.asset->extension,
        title
      },
      _type == "videoAttachment" => {
        "url": asset.asset->url,
        "originalFilename": asset.asset->originalFilename,
        "mimeType": asset.asset->mimeType,
        "extension": asset.asset->extension,
        title
      },
      _type == "missionAttachment" => {
        "missionId": mission._ref,
        "missionTitle": mission->title,
        "missionKind": mission->kind,
        "missionPoints": mission->points,
        title,
        excerpt
      }
    }
  }
`;

type AttachmentDto =
  | {
    _type: 'imageAttachment';
    caption?: string;
    url: string;
  }
  | {
    _type: 'audioAttachment' | 'videoAttachment';
    extension?: string;
    mimeType?: string;
    originalFilename?: string;
    title?: string;
    url: string;
  }
  | {
    _type: 'missionAttachment';
    excerpt?: string;
    missionId: string;
    missionKind?: string;
    missionPoints?: number;
    missionTitle?: string;
    title?: string;
  };

type MessageDto = {
  actor: {
    avatarUrl?: string;
    name: string;
    role?: string;
  };
  attachment?: AttachmentDto;
  messageId: string;
  text?: string;
};

type BundleDto = {
  _id: string;
  messages: MessageDto[];
  script?: string;
  scriptActor?: {
    avatarUrl?: string;
    name: string;
    role?: string;
  };
  pushBody?: string;
  pushTitle?: string;
  releaseAt: string;
};

type FeedCursor = {
  id: string;
  releaseAt: string;
};

type NarrativeMode = 'production' | 'dev';
type NarrativeStateEventType = 'content_update' | 'release';

type SanityBundleWebhookPayload = {
  _id?: unknown;
  documentId?: unknown;
  ids?: {
    created?: unknown;
    updated?: unknown;
  };
};

type EnvConfig = {
  cloudTasksLocation: string;
  cloudTasksQueue: string;
  fcmTopicNarrative: string;
  fcmTopicNarrativeDev?: string;
  projectId: string;
  releaseFunctionUrl: string;
  sanityApiToken: string;
  sanityDataset: string;
  sanityDatasetDev?: string;
  sanityProjectId: string;
  sanityWebhookSecret: string;
  tasksServiceAccountEmail: string;
};

type FirebaseResponse = {
  status: (statusCode: number) => {
    json: (payload: unknown) => unknown;
  };
};

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

let cachedEnv: EnvConfig | null = null;

function env(): EnvConfig {
  if (cachedEnv) {
    return cachedEnv;
  }

  const fcmTopicNarrativeDev = optionalEnv('FCM_TOPIC_NARRATIVE_DEV');
  const sanityDatasetDev = optionalEnv('SANITY_DATASET_DEV');

  cachedEnv = {
    cloudTasksLocation: requiredEnv('CLOUD_TASKS_LOCATION'),
    cloudTasksQueue: requiredEnv('CLOUD_TASKS_QUEUE'),
    fcmTopicNarrative: requiredEnv('FCM_TOPIC_NARRATIVE'),
    ...(fcmTopicNarrativeDev ? { fcmTopicNarrativeDev } : {}),
    projectId: requiredEnv('GCLOUD_PROJECT', 'GCP_PROJECT'),
    releaseFunctionUrl: requiredEnv('RELEASE_FUNCTION_URL'),
    sanityApiToken: requiredEnv('SANITY_API_TOKEN'),
    sanityDataset: requiredEnv('SANITY_DATASET'),
    ...(sanityDatasetDev ? { sanityDatasetDev } : {}),
    sanityProjectId: requiredEnv('SANITY_PROJECT_ID'),
    sanityWebhookSecret: requiredEnv('SANITY_WEBHOOK_SECRET'),
    tasksServiceAccountEmail: requiredEnv('TASKS_SERVICE_ACCOUNT_EMAIL'),
  };

  return cachedEnv;
}

export const narrativeApi = onRequest({ cors: true, region: 'europe-west1' }, async (req, res) => {
  const path = normalizeRequestPath(req.path);

  if (path === '/account/delete') {
    await handleDeleteAccount(req, res);
    return;
  }

  if (path === '/sanity/webhook/bundle-upsert') {
    await handleSanityBundleUpsert(req, res);
    return;
  }

  if (path === '/internal/release-bundle') {
    await handleReleaseNarrativeBundle(req, res);
    return;
  }

  if (path === '/feed') {
    await handleFeedProxy(req, res);
    return;
  }

  if (path === '/missions') {
    await handleMissionsProxy(req, res);
    return;
  }

  res.status(404).json({ error: 'Route not found.' });
});

async function handleDeleteAccount(req: Request, res: FirebaseResponse) {
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

async function handleSanityBundleUpsert(req: Request, res: FirebaseResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    await verifySanitySignature(req, env().sanityWebhookSecret);
    const mode = resolveMode(readQueryParam(req, 'mode'));

    const bundleId = extractBundleId(req.body as SanityBundleWebhookPayload);
    if (!bundleId) {
      throw new HttpError(400, 'Unable to determine Sanity bundle ID from webhook payload.');
    }

    logger.info('sanityBundleUpsert received', {
      bundleId,
      mode,
      sanityWebhookId: readHeader(req, 'x-sanity-webhook-id'),
    });

    const bundle = await getBundleById(bundleId, mode);
    if (!bundle) {
      await deleteReleaseTask(bundleId, mode);
      logger.info('sanityBundleUpsert unpublished_ignored', { bundleId, mode });
      res.status(200).json({ ok: true, action: 'unpublished_ignored', bundleId, mode });
      return;
    }

    const existingState = await getNarrativeState(bundle._id, mode);
    const isAlreadyReleased = Boolean(existingState?.releasedAt);

    if (isAlreadyReleased) {
      await deleteReleaseTask(bundle._id, mode);
      await touchNarrativeState({
        bundleId: bundle._id,
        eventType: 'content_update',
        mode,
        releaseAt: bundle.releaseAt,
      });
      logger.info('sanityBundleUpsert signal_updated', {
        bundleId: bundle._id,
        mode,
        releaseAt: bundle.releaseAt,
      });

      res.status(200).json({ ok: true, action: 'signal_updated', bundleId: bundle._id, mode });
      return;
    }

    await upsertReleaseTask(bundle, mode);
    logger.info('sanityBundleUpsert task_upserted', {
      bundleId: bundle._id,
      mode,
      releaseAt: bundle.releaseAt,
    });
    res.status(200).json({ ok: true, action: 'task_upserted', bundleId: bundle._id, mode });
  } catch (error) {
    logger.error('sanityBundleUpsert failed', error);
    sendError(res, error);
  }
}

async function handleReleaseNarrativeBundle(req: Request, res: FirebaseResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    await verifyCloudTaskInvocation(req);
    const mode = resolveMode(
      typeof req.body?.mode === 'string' ? req.body.mode : readQueryParam(req, 'mode')
    );

    const bundleId = typeof req.body?.bundleId === 'string' ? req.body.bundleId : '';
    if (!bundleId) {
      throw new HttpError(400, 'Missing bundleId in task payload.');
    }

    logger.info('releaseNarrativeBundle start', { bundleId, mode });

    const bundle = await getBundleById(bundleId, mode);
    if (!bundle) {
      logger.info('releaseNarrativeBundle bundle_missing', { bundleId, mode });
      res.status(200).json({ ok: true, action: 'bundle_missing', bundleId, mode });
      return;
    }

    const nowIso = new Date().toISOString();
    const releaseClaim = await claimBundleRelease({
      bundleId,
      mode,
      nowIso,
      releaseAt: bundle.releaseAt,
    });

    if (releaseClaim.alreadyReleased) {
      logger.info('releaseNarrativeBundle already_released', { bundleId, mode });
      res.status(200).json({ ok: true, action: 'already_released', bundleId, mode });
      return;
    }

    try {
      const title = bundle.pushTitle?.trim() || 'Notfallkanal';
      const body = bundle.pushBody?.trim() || 'New narrative messages are available.';

      const pushMessageId = await messaging.send({
        data: {
          bundleId,
          eventType: 'release',
          route: '/(tabs)/feed',
        },
        notification: {
          body,
          title,
        },
        topic: resolveNarrativeTopic(mode),
      });

      await touchNarrativeState({
        bundleId,
        eventType: 'release',
        lastReleaseError: null,
        mode,
        pushSentAt: nowIso,
        pushState: 'sent',
        releaseAt: bundle.releaseAt,
      });
      logger.info('releaseNarrativeBundle push_sent', {
        bundleId,
        mode,
        pushMessageId,
        releaseAt: bundle.releaseAt,
      });
    } catch (pushError) {
      await touchNarrativeState({
        bundleId,
        eventType: 'release',
        lastReleaseError: formatError(pushError),
        mode,
        pushState: 'failed',
        releaseAt: bundle.releaseAt,
      });
      logger.error('releaseNarrativeBundle push_failed', {
        bundleId,
        mode,
        releaseAt: bundle.releaseAt,
        error: formatError(pushError),
      });
      throw pushError;
    }

    res.status(200).json({ ok: true, action: 'released', bundleId, mode });
  } catch (error) {
    logger.error('releaseNarrativeBundle failed', error);
    sendError(res, error);
  }
}

async function handleFeedProxy(req: Request, res: FirebaseResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const mode = resolveMode(readQueryParam(req, 'mode'));
    const decodedToken = await verifyFirebaseUser(req);
    if (mode === 'dev' && decodedToken.dev !== true) {
      throw new HttpError(403, 'Dev feed requires Firebase custom claim dev=true.');
    }

    const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const rawCursor = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;

    const limit = clampLimit(rawLimit);
    const cursor = parseCursor(rawCursor);

    const bundles = await getReleasedFeedBundles({ cursor, limit, mode });
    const nextCursor = bundles.length === limit ? createNextCursor(bundles[bundles.length - 1]) : null;

    res.status(200).json({ bundles, mode, nextCursor });
  } catch (error) {
    logger.error('feedProxy failed', error);
    sendError(res, error);
  }
}

// ---------------------------------------------------------------------------
// Missions read proxy (added to narrativeApi)
// ---------------------------------------------------------------------------

const MISSION_LIST_PROJECTION = `
  _id,
  title,
  kind,
  points,
  description,
  active,
  "gpsConfig": gpsConfig{
    "latitude": location.lat,
    "longitude": location.lng,
    radiusMeters
  },
  "questionCount": count(quizConfig.questions)
`;

const MISSION_DETAIL_PROJECTION = `
  _id,
  title,
  kind,
  points,
  description,
  active,
  "gpsConfig": gpsConfig{
    "latitude": location.lat,
    "longitude": location.lng,
    radiusMeters
  },
  "questions": quizConfig.questions[]{
    questionText,
    "optionCount": count(options),
    "options": options[].text
  }
`;

const MISSION_SCORING_PROJECTION = `
  _id,
  title,
  kind,
  points,
  active,
  "questions": quizConfig.questions[]{
    questionText,
    "options": options[]{text, isCorrect}
  }
`;

async function handleMissionsProxy(req: Request, res: FirebaseResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const mode = resolveMode(readQueryParam(req, 'mode'));
    const decodedToken = await verifyFirebaseUser(req);

    if (mode === 'dev' && decodedToken.dev !== true) {
      throw new HttpError(403, 'Dev missions require Firebase custom claim dev=true.');
    }

    const query = `*[_type == "mission" && active == true && count(*[_type == "narrativeBundle" && !(_id in path("drafts.**")) && defined(releaseAt) && dateTime(releaseAt) <= dateTime(now()) && references(^._id)]) > 0] | order(title asc) {${MISSION_DETAIL_PROJECTION}}`;
    const missions = await sanityQuery<unknown[]>(query, {}, mode);

    res.status(200).json({ missions });
  } catch (error) {
    logger.error('missionsProxy failed', error);
    sendError(res, error);
  }
}

// ---------------------------------------------------------------------------
// Mission scoring API (separate Cloud Function)
// ---------------------------------------------------------------------------

type MissionDto = {
  _id: string;
  active: boolean;
  kind: 'gps' | 'quiz';
  points: number;
  questions?: Array<{
    options: Array<{ isCorrect: boolean; text: string }>;
    questionText: string;
  }>;
  title: string;
};

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

  res.status(404).json({ error: 'Route not found.' });
});

async function handleQuizComplete(req: Request, res: FirebaseResponse) {
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

    // Fetch mission with correct answers from Sanity
    const query = `*[_type == "mission" && _id == $missionId && !(_id in path("drafts.**")) && count(*[_type == "narrativeBundle" && !(_id in path("drafts.**")) && defined(releaseAt) && dateTime(releaseAt) <= dateTime(now()) && references(^._id)]) > 0][0]{${MISSION_SCORING_PROJECTION}}`;
    const mission = await sanityQuery<MissionDto | null>(query, { missionId }, mode);

    if (!mission) {
      throw new HttpError(404, 'Mission not found.');
    }

    if (!mission.active) {
      throw new HttpError(400, 'Mission is not active.');
    }

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

    await batch.commit();

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

async function handleGpsComplete(req: Request, res: FirebaseResponse) {
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
    const query = `*[_type == "mission" && _id == $missionId && !(_id in path("drafts.**")) && count(*[_type == "narrativeBundle" && !(_id in path("drafts.**")) && defined(releaseAt) && dateTime(releaseAt) <= dateTime(now()) && references(^._id)]) > 0][0]{ _id, title, kind, points, active }`;
    const mission = await sanityQuery<MissionDto | null>(query, { missionId }, mode);

    if (!mission) {
      throw new HttpError(404, 'Mission not found.');
    }

    if (!mission.active) {
      throw new HttpError(400, 'Mission is not active.');
    }

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

    await batch.commit();

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

async function verifyFirebaseUser(req: Request): Promise<DecodedIdToken> {
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

async function deleteAccountData(uid: string) {
  const userDocumentPaths = [`${V2_USERS_COLLECTION_PATH}/${uid}`, `${LEGACY_USERS_COLLECTION_PATH}/${uid}`];

  await Promise.all([
    ...userDocumentPaths.map((path) => firestore.doc(path).delete().catch(() => undefined)),
    deleteDocumentsByQuery(firestore.collection(V2_SUBMISSIONS_COLLECTION_PATH).where('ownerUid', '==', uid)),
    deleteDocumentsByQuery(firestore.collection(V2_SCORE_EVENTS_COLLECTION_PATH).where('uid', '==', uid)),
    deleteDocumentsByQuery(firestore.collection(V2_LEADERBOARD_COLLECTION_PATH).where('uid', '==', uid)),
  ]);
}

async function deleteDocumentsByQuery(query: Query<DocumentData>) {
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

async function verifySanitySignature(req: Request, secret: string) {
  const signatureHeader = req.headers[SIGNATURE_HEADER_NAME] ?? req.headers['sanity-webhook-signature'];
  const rawHeader = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

  if (!rawHeader || typeof rawHeader !== 'string') {
    throw new HttpError(401, 'Missing Sanity signature header.');
  }

  const rawBody = getRawBody(req).toString('utf8');
  const isValid = await isValidSignature(rawBody, rawHeader, secret);

  if (!isValid) {
    logger.warn('Invalid Sanity webhook signature.', {
      bodyBytes: Buffer.byteLength(rawBody),
      hasSanityWebhookSignatureHeader: typeof req.headers['sanity-webhook-signature'] === 'string',
      sanityWebhookId: readHeader(req, 'x-sanity-webhook-id'),
    });
    throw new HttpError(401, 'Invalid Sanity webhook signature.');
  }
}

function getRawBody(req: Request): Buffer {
  const maybeRawBody = (req as Request & { rawBody?: unknown }).rawBody;
  if (maybeRawBody instanceof Buffer) {
    return maybeRawBody;
  }

  if (typeof maybeRawBody === 'string') {
    return Buffer.from(maybeRawBody);
  }

  if (req.body === undefined || req.body === null) {
    return Buffer.from('');
  }

  if (typeof req.body === 'string') {
    return Buffer.from(req.body);
  }

  return Buffer.from(JSON.stringify(req.body));
}

function readHeader(req: Request, key: string): string | null {
  const value = req.headers[key];
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null;
  }

  return typeof value === 'string' ? value : null;
}

async function verifyCloudTaskInvocation(req: Request) {
  const queueNameHeader = req.headers['x-cloudtasks-queuename'];
  const queueName = Array.isArray(queueNameHeader) ? queueNameHeader[0] : queueNameHeader;

  if (!queueName || queueName !== env().cloudTasksQueue) {
    throw new HttpError(401, 'Invalid Cloud Tasks queue header.');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing Cloud Tasks OIDC token.');
  }

  const token = authHeader.slice('Bearer '.length);

  let payload: unknown;
  try {
    const ticket = await oidcClient.verifyIdToken({
      audience: env().releaseFunctionUrl,
      idToken: token,
    });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'Failed to verify Cloud Tasks OIDC token.');
  }

  const email =
    payload && typeof payload === 'object' && typeof (payload as { email?: unknown }).email === 'string'
      ? (payload as { email: string }).email
      : null;

  if (!email) {
    throw new HttpError(401, 'Invalid OIDC token payload.');
  }

  if (email !== env().tasksServiceAccountEmail) {
    throw new HttpError(401, 'Unexpected service account for Cloud Tasks invocation.');
  }
}

function extractBundleId(payload: SanityBundleWebhookPayload | null | undefined): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (typeof payload._id === 'string' && payload._id.length > 0) {
    return normalizeBundleId(payload._id);
  }

  if (typeof payload.documentId === 'string' && payload.documentId.length > 0) {
    return normalizeBundleId(payload.documentId);
  }

  const createdIds = Array.isArray(payload.ids?.created) ? payload.ids?.created : [];
  const updatedIds = Array.isArray(payload.ids?.updated) ? payload.ids?.updated : [];
  const firstId = [...createdIds, ...updatedIds].find(
    (value) => typeof value === 'string' && value.length > 0
  );

  return typeof firstId === 'string' ? normalizeBundleId(firstId) : null;
}

function normalizeBundleId(bundleId: string) {
  return bundleId.startsWith('drafts.') ? bundleId.slice('drafts.'.length) : bundleId;
}

async function upsertReleaseTask(bundle: BundleDto, mode: NarrativeMode) {
  const releaseMs = Date.parse(bundle.releaseAt);
  if (Number.isNaN(releaseMs)) {
    throw new HttpError(400, `Bundle ${bundle._id} has invalid releaseAt value.`);
  }

  const nowMs = Date.now();
  const scheduleMs = releaseMs > nowMs ? releaseMs : nowMs + 5000;
  const scheduleSeconds = Math.floor(scheduleMs / 1000);

  const taskName = getTaskName(bundle._id, mode);
  const requestBody = mode === 'dev' ? { bundleId: bundle._id, mode: 'dev' } : { bundleId: bundle._id };
  await deleteTaskIfExists(taskName);

  await tasksClient.createTask({
    parent: tasksClient.queuePath(env().projectId, env().cloudTasksLocation, env().cloudTasksQueue),
    task: {
      httpRequest: {
        body: Buffer.from(JSON.stringify(requestBody)).toString('base64'),
        headers: {
          'Content-Type': 'application/json',
        },
        httpMethod: 'POST',
        oidcToken: {
          audience: env().releaseFunctionUrl,
          serviceAccountEmail: env().tasksServiceAccountEmail,
        },
        url: env().releaseFunctionUrl,
      },
      name: taskName,
      scheduleTime: {
        seconds: scheduleSeconds,
      },
    },
  });

  logger.info('releaseTask upserted', {
    bundleId: bundle._id,
    mode,
    releaseAt: bundle.releaseAt,
    scheduleSeconds,
  });
}

async function deleteReleaseTask(bundleId: string, mode: NarrativeMode) {
  await deleteTaskIfExists(getTaskName(bundleId, mode));
}

function getTaskName(bundleId: string, mode: NarrativeMode) {
  const normalized = bundleId.replace(/[^a-zA-Z0-9_-]/g, '-');
  const taskId = mode === 'dev' ? `bundle-release-dev-${normalized}` : `bundle-release-${normalized}`;

  return tasksClient.taskPath(
    env().projectId,
    env().cloudTasksLocation,
    env().cloudTasksQueue,
    taskId
  );
}

async function deleteTaskIfExists(taskName: string) {
  try {
    await tasksClient.deleteTask({ name: taskName });
  } catch (error) {
    if (!isNotFoundTaskError(error)) {
      throw error;
    }
  }
}

function isNotFoundTaskError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return code === 5 || code === '5' || code === 'NOT_FOUND';
}

async function claimBundleRelease({
  bundleId,
  mode,
  nowIso,
  releaseAt,
}: {
  bundleId: string;
  mode: NarrativeMode;
  nowIso: string;
  releaseAt?: string;
}) {
  const stateRef = narrativeStateRef(bundleId, mode);
  const releaseTimestamp = toTimestamp(nowIso);
  const releaseAtTimestamp = toTimestamp(releaseAt);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(stateRef);
    const existing = snapshot.data() as Record<string, unknown> | undefined;

    if (existing && existing.releasedAt) {
      return { alreadyReleased: true as const };
    }

    transaction.set(
      stateRef,
      {
        bundleId,
        lastEventType: 'release',
        ...(releaseAtTimestamp ? { releaseAt: releaseAtTimestamp } : {}),
        ...(releaseTimestamp ? { releasedAt: releaseTimestamp } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        version: FieldValue.increment(1),
        pushState: 'pending',
      },
      { merge: true }
    );

    return { alreadyReleased: false as const };
  });
}

async function getNarrativeState(bundleId: string, mode: NarrativeMode) {
  const snapshot = await narrativeStateRef(bundleId, mode).get();
  if (!snapshot.exists) {
    return null;
  }

  return (snapshot.data() as Record<string, unknown> | undefined) ?? null;
}

async function touchNarrativeState({
  bundleId,
  eventType,
  lastReleaseError,
  mode,
  pushSentAt,
  pushState,
  releaseAt,
}: {
  bundleId: string;
  eventType: NarrativeStateEventType;
  lastReleaseError?: string | null;
  mode: NarrativeMode;
  pushSentAt?: string;
  pushState?: 'failed' | 'pending' | 'sent';
  releaseAt?: string;
}) {
  const releaseAtTimestamp = toTimestamp(releaseAt);
  const pushSentAtTimestamp = toTimestamp(pushSentAt);

  const update: Record<string, unknown> = {
    bundleId,
    lastEventType: eventType,
    updatedAt: FieldValue.serverTimestamp(),
    version: FieldValue.increment(1),
  };

  if (releaseAtTimestamp) {
    update.releaseAt = releaseAtTimestamp;
  }

  if (pushSentAtTimestamp) {
    update.pushSentAt = pushSentAtTimestamp;
  }

  if (pushState) {
    update.pushState = pushState;
  }

  if (typeof lastReleaseError === 'string') {
    update.lastReleaseError = lastReleaseError;
  } else if (lastReleaseError === null) {
    update.lastReleaseError = FieldValue.delete();
  }

  await narrativeStateRef(bundleId, mode).set(update, { merge: true });
}

function narrativeStateRef(bundleId: string, mode: NarrativeMode) {
  const collectionPath =
    mode === 'dev' ? NARRATIVE_STATE_COLLECTION_PATH_DEV : NARRATIVE_STATE_COLLECTION_PATH;
  return firestore.collection(collectionPath).doc(bundleId);
}

function toTimestamp(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return Timestamp.fromMillis(parsed);
}

async function getBundleById(bundleId: string, mode: NarrativeMode): Promise<BundleDto | null> {
  const query = `*[_type == "narrativeBundle" && _id == $bundleId && !(_id in path("drafts.**"))][0]{${SANITY_BUNDLE_PROJECTION}}`;

  return sanityQuery<BundleDto | null>(query, { bundleId }, mode);
}

async function getReleasedFeedBundles({
  cursor,
  limit,
  mode,
}: {
  cursor: FeedCursor | null;
  limit: number;
  mode: NarrativeMode;
}): Promise<BundleDto[]> {
  const cursorFilter = cursor
    ? '&& (releaseAt < $cursorReleaseAt || (releaseAt == $cursorReleaseAt && _id < $cursorId))'
    : '';

  const query = `*[_type == "narrativeBundle"
    && !(_id in path("drafts.**"))
    && defined(releaseAt)
    && dateTime(releaseAt) <= dateTime(now())
    ${cursorFilter}
  ] | order(releaseAt desc, _id desc) [0...$limit] {${SANITY_BUNDLE_PROJECTION}}`;

  const params: Record<string, unknown> = { limit };
  if (cursor) {
    params.cursorId = cursor.id;
    params.cursorReleaseAt = cursor.releaseAt;
  }

  const result = await sanityQuery<BundleDto[]>(query, params, mode);

  return result.map((bundle) => ({
    ...bundle,
    messages: normalizeBundleMessages(bundle),
  }));
}

function normalizeBundleMessages(bundle: BundleDto): MessageDto[] {
  const structuredMessages = Array.isArray(bundle.messages) ? bundle.messages : [];
  if (structuredMessages.length > 0) {
    return structuredMessages;
  }

  const script = typeof bundle.script === 'string' ? bundle.script.trim() : '';
  if (!script) {
    return [];
  }

  const defaultActor = bundle.scriptActor?.name
    ? bundle.scriptActor
    : {
      name: 'Notfallkanal',
    };

  return script
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk, index) => ({
      actor: defaultActor,
      messageId: `script_${bundle._id}_${index + 1}`,
      text: chunk,
    }));
}

async function sanityQuery<T>(
  query: string,
  params: Record<string, unknown>,
  mode: NarrativeMode
): Promise<T> {
  const url = new URL(
    `https://${env().sanityProjectId}.api.sanity.io/${SANITY_API_VERSION}/data/query/${resolveSanityDataset(mode)}`
  );

  url.searchParams.set('query', query);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    url.searchParams.set(`$${key}`, JSON.stringify(value));
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env().sanityApiToken}`,
    },
    method: 'GET',
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Sanity query failed with status ${response.status}: ${details}`);
  }

  const payload = (await response.json()) as { result: T };
  return payload.result;
}

function createNextCursor(bundle: BundleDto): string | null {
  if (!bundle.releaseAt) {
    return null;
  }

  return Buffer.from(
    JSON.stringify({
      id: bundle._id,
      releaseAt: bundle.releaseAt,
    })
  ).toString('base64url');
}

function parseCursor(cursorValue: unknown): FeedCursor | null {
  if (typeof cursorValue !== 'string' || cursorValue.trim().length === 0) {
    return null;
  }

  try {
    const decoded = Buffer.from(cursorValue, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as Partial<FeedCursor>;

    if (typeof parsed.id !== 'string' || typeof parsed.releaseAt !== 'string') {
      return null;
    }

    return {
      id: parsed.id,
      releaseAt: parsed.releaseAt,
    };
  } catch {
    return null;
  }
}

function resolveMode(raw: unknown): NarrativeMode {
  return raw === 'dev' ? 'dev' : 'production';
}

function resolveSanityDataset(mode: NarrativeMode) {
  if (mode === 'dev') {
    const devDataset = env().sanityDatasetDev;
    if (!devDataset || devDataset.length === 0) {
      throw new Error('SANITY_DATASET_DEV is required when mode=dev.');
    }

    return devDataset;
  }

  return env().sanityDataset;
}

function resolveNarrativeTopic(mode: NarrativeMode) {
  if (mode === 'dev') {
    const devTopic = env().fcmTopicNarrativeDev;
    if (typeof devTopic === 'string' && devTopic.length > 0) {
      return devTopic;
    }

    return `${env().fcmTopicNarrative}-dev`;
  }

  return env().fcmTopicNarrative;
}

function readQueryParam(req: Request, key: string): string | null {
  const value = req.query[key];
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null;
  }

  return typeof value === 'string' ? value : null;
}

function normalizeRequestPath(pathValue: string | undefined) {
  const raw = typeof pathValue === 'string' ? pathValue.trim() : '/';
  if (raw.length === 0) {
    return '/';
  }

  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')) {
    return withLeadingSlash.slice(0, -1);
  }

  return withLeadingSlash;
}

function clampLimit(input: unknown) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return 20;
  }

  return Math.max(1, Math.min(50, Math.round(parsed)));
}

function requiredEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  throw new Error(`Missing required environment variable. Tried: ${keys.join(', ')}`);
}

function optionalEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

function sendError(res: FirebaseResponse, error: unknown) {
  if (isHttpError(error)) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: formatError(error) });
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
