import { FieldValue } from 'firebase-admin/firestore';
import { onRequest, Request } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { firestore, messaging, oidcClient, storage, tasksClient } from './firebase.js';

import {
    MAP_CHECKPOINT_PROJECTION,
    MAP_MISSION_POINT_PROJECTION,
    MISSION_DETAIL_PROJECTION,
    NARRATIVE_STATE_COLLECTION_PATH, NARRATIVE_STATE_COLLECTION_PATH_DEV,
    SANITY_BUNDLE_PROJECTION,
    V2_NARRATIVE_REACTIONS_COLLECTION_PATH,
    V2_NARRATIVE_USER_REACTIONS_COLLECTION_PATH,
    V2_SUBMISSIONS_COLLECTION_PATH
} from './constants.js';

import { env, resolveMode, resolveNarrativeTopic } from './config.js';

import {
    clampLimit,
    createNextCursor,
    formatError,
    HttpError,
    normalizeRequestPath,
    parseCursor,
    readHeader,
    readQueryParam,
    sendError,
    toTimestamp
} from './utils.js';

import { applySanityImageTransforms, sanityQuery, verifySanitySignature } from './sanity.js';
import { handleDeleteAccount, verifyFirebaseUser } from './auth.js';
import { emptyReactionCounts, isNarrativeReactionId } from './reactions.js';
import {
    BundleDto, FeedCursor,
    FirebaseResponse,
    MapPointDto,
    MessageDto,
    NarrativeMode, NarrativeReactionId, NarrativeStateEventType,
    SanityWebhookPayload
} from './types.js';
export const narrativeApi = onRequest({ cors: true, region: 'europe-west1' }, async (req, res) => {
      const path = normalizeRequestPath(req.path);

      if (path === '/account/delete') {
        await handleDeleteAccount(req, res);
        return;
      }

      if (path === '/sanity/webhook') {
        await handleSanityWebhook(req, res);
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

      if (path === '/feed/reactions') {
        await handleFeedReactions(req, res);
        return;
      }

      if (path === '/missions') {
        await handleMissionsProxy(req, res);
        return;
      }

      if (path === '/map-points') {
        await handleMapPointsProxy(req, res);
        return;
      }

      res.status(404).json({ error: 'Route not found.' });
    });

export async function handleSanityWebhook(req: Request, res: FirebaseResponse) {
    if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
    }

    try {
    await verifySanitySignature(req, env().sanityWebhookSecret);
    const mode = resolveMode(readQueryParam(req, 'mode'));
    const payload = req.body as SanityWebhookPayload;

    const docId = extractBundleId(payload);
    const docType = typeof payload._type === 'string' ? payload._type : null;

    if (!docId) {
      throw new HttpError(400, 'Unable to determine document ID from webhook payload.');
    }

    logger.info('sanityWebhook received', {
      docId,
      docType,
      mode,
      sanityWebhookId: readHeader(req, 'x-sanity-webhook-id'),
    });

    const bundle = await getBundleById(docId, mode);

    // If the document is not found, it's a deletion or unpublishing
    if (!bundle) {
      if (docType === 'mission') {
        const missionId = docId.replace(/^drafts\./, '');
        logger.info('sanityWebhook mission_deleted', { missionId, mode });

        const submissionsQuery = firestore.collection(V2_SUBMISSIONS_COLLECTION_PATH).where('sourceId', '==', missionId);
        const submissionsSnapshot = await submissionsQuery.get();

        const batch = firestore.batch();
        const storageDeletes: Promise<any>[] = [];

        for (const doc of submissionsSnapshot.docs) {
          const data = doc.data();
          if (data.sourceType === 'photo' && typeof data.payload === 'string' && data.payload.length > 0) {
            storageDeletes.push(storage.bucket().file(data.payload).delete().catch(() => undefined));
          }
          batch.delete(doc.ref);
        }

        await Promise.all([batch.commit(), ...storageDeletes]);
        res.status(200).json({ ok: true, action: 'mission_data_deleted', missionId });
        return;
      }

      // Default behavior for narrativeBundle (and other types not explicitly handled)
      await deleteReleaseTask(docId, mode);
      logger.info('sanityWebhook document_deleted_or_unpublished', { docId, docType, mode });
      res.status(200).json({ ok: true, action: 'deleted_or_unpublished', docId, mode });
      return;
    }

    // From here on, we have a valid document (bundle or mission)
    // If it's a mission, we don't have further logic yet for updates
    if (docType === 'mission') {
      res.status(200).json({ ok: true, action: 'mission_update_ignored', docId });
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

    if (bundle.publishMode === 'instant' || bundle.pushNow) {
      await executeBundleRelease(bundle, mode);
      logger.info('sanityBundleUpsert pushed_immediately', {
        bundleId: bundle._id,
        mode,
      });

      res.status(200).json({ ok: true, action: 'pushed_immediately', bundleId: bundle._id, mode });
      return;
    }

    await upsertReleaseTask(bundle, mode);

    // Write signal immediately so the app's Firestore listener detects the
    // new bundle without waiting for the Cloud Task to fire. The feed API
    // will only return it once releaseAt has passed, but the signal primes
    // the app to refresh as soon as it becomes available.
    await touchNarrativeState({
      bundleId: bundle._id,
      eventType: 'content_update',
      mode,
      releaseAt: bundle.releaseAt,
    });

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

export async function handleReleaseNarrativeBundle(req: Request, res: FirebaseResponse) {
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

    logger.info('releaseNarrativeBundle task_triggered', { bundleId, mode });

    const bundle = await getBundleById(bundleId, mode);
    if (!bundle) {
      logger.info('releaseNarrativeBundle bundle_missing', { bundleId, mode });
      res.status(200).json({ ok: true, action: 'bundle_missing', bundleId, mode });
      return;
    }

    await executeBundleRelease(bundle, mode);
    res.status(200).json({ ok: true, action: 'released', bundleId, mode });
  } catch (error) {
    logger.error('releaseNarrativeBundle failed', error);
    sendError(res, error);
  }
}

export async function executeBundleRelease(bundle: BundleDto, mode: NarrativeMode) {
  const bundleId = bundle._id;
  const nowIso = new Date().toISOString();

  // If pushNow is used, releaseAt might not be set in Sanity. 
  // We use now as the fallback for state tracking.
  const releaseAt = bundle.releaseAt || nowIso;

  const releaseClaim = await claimBundleRelease({
    bundleId,
    mode,
    nowIso,
    releaseAt: releaseAt,
  });

  if (releaseClaim.alreadyReleased) {
    logger.info('executeBundleRelease already_rolled_out', { bundleId, mode });
    return;
  }

  try {
    // --- DYNAMIC PUSH NOTIFICATION LOGIC ---
    const firstMessage = bundle.messages && bundle.messages.length > 0 ? bundle.messages[0] : null;

    // 1. Resolve Actor Name for Title
    const actorName = firstMessage?.actor?.name || bundle.scriptActor?.name || 'Notfallkanal';
    const title = bundle.pushTitle?.trim() || `Neue Nachricht von ${actorName}`;

    // 2. Resolve Body
    let defaultBody = 'New narrative messages are available.';
    if (firstMessage) {
      if (firstMessage.text?.trim()) {
        defaultBody = firstMessage.text.trim();
      } else if (firstMessage.attachment) {
        const type = firstMessage.attachment._type;
        if (type === 'imageAttachment') defaultBody = '📸 Bild empfangen';
        else if (type === 'videoAttachment') defaultBody = '🎥 Video empfangen';
        else if (type === 'audioAttachment') defaultBody = '🎙️ Sprachnachricht';
        else if (type === 'missionAttachment') {
          const kind = (firstMessage.attachment as any).missionKind;
          if (kind === 'quiz') defaultBody = '🧠 Quiz verfügbar';
          else if (kind === 'photo') defaultBody = '📸 Foto-Mission';
          else if (kind === 'gps') defaultBody = '📍 Ort finden';
          else if (kind === 'text') defaultBody = '✏️ Text-Aufgabe';
          else defaultBody = '🚩 Neue Mission';
        }
      }
    } else if (bundle.script?.trim()) {
      const firstLine = bundle.script.trim().split('\n')[0].trim();
      if (firstLine) defaultBody = firstLine;
    }

    const body = bundle.pushBody?.trim() || defaultBody;

    const pushMessageId = await messaging.send({
      data: {
        bundleId,
        eventType: 'release',
        route: '/(tabs)/feed/hub',
      },
      notification: {
        body: body.length > 200 ? `${body.substring(0, 197)}...` : body,
        title: title.length > 100 ? `${title.substring(0, 97)}...` : title,
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
      releaseAt: releaseAt,
    });

    logger.info('executeBundleRelease push_sent', {
      bundleId,
      mode,
      pushMessageId,
      releaseAt: releaseAt,
    });
  } catch (pushError) {
    await touchNarrativeState({
      bundleId,
      eventType: 'release',
      lastReleaseError: formatError(pushError),
      mode,
      pushState: 'failed',
      releaseAt: releaseAt,
    });
    logger.error('executeBundleRelease push_failed', {
      bundleId,
      mode,
      releaseAt: releaseAt,
      error: formatError(pushError),
    });
    throw pushError;
  }
}

export async function handleFeedProxy(req: Request, res: FirebaseResponse) {
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

    const sanityBundles = await getReleasedFeedBundles({ cursor, limit, mode });

    const combined = [...sanityBundles]
      .sort((a, b) => {
        const timeA = Date.parse(a.releaseAt);
        const timeB = Date.parse(b.releaseAt);
        if (timeA !== timeB) return timeB - timeA;
        return b._id.localeCompare(a._id);
      })
      .slice(0, limit);

    const nextCursor = combined.length === limit ? createNextCursor(combined[combined.length - 1] as any) : null;

    res.status(200).json({ bundles: combined, mode, nextCursor });
  } catch (error) {
    logger.error('feedProxy failed', error);
    sendError(res, error);
  }
}

export async function handleFeedReactions(req: Request, res: FirebaseResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const mode = resolveMode(readQueryParam(req, 'mode'));
    const decodedToken = await verifyFirebaseUser(req);
    if (mode === 'dev' && decodedToken.dev !== true) {
      throw new HttpError(403, 'Dev feed reactions require Firebase custom claim dev=true.');
    }

    const bundleId =
      typeof req.body?.bundleId === 'string' ? normalizeBundleId(req.body.bundleId.trim()) : '';
    const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId.trim() : '';
    const rawReaction = req.body?.reaction;
    const reaction = normalizeReactionInput(rawReaction);

    if (!bundleId) {
      throw new HttpError(400, 'Missing bundleId.');
    }

    if (!messageId) {
      throw new HttpError(400, 'Missing messageId.');
    }

    if (rawReaction !== null && reaction === null) {
      throw new HttpError(400, 'Invalid reaction.');
    }

    const bundle = await getBundleById(bundleId, mode);
    if (!bundle || !isBundleReleasedToFeed(bundle)) {
      throw new HttpError(404, 'Bundle not found in released feed.');
    }

    const bundleMessages = normalizeBundleMessages(bundle);
    if (!bundleMessages.some((message) => message.messageId === messageId)) {
      throw new HttpError(404, 'Message not found in released feed bundle.');
    }

    await writeNarrativeReaction({
      bundleId,
      messageId,
      mode,
      reaction,
      uid: decodedToken.uid,
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('feedReactions failed', error);
    sendError(res, error);
  }
}

export async function handleMissionsProxy(req: Request, res: FirebaseResponse) {
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

    const query = `*[_type == "mission" && active == true && count(*[_type == "narrativeBundle" && !(_id in path("drafts.**")) && (publishMode == "instant" || (defined(releaseAt) && dateTime(releaseAt) <= dateTime(now()))) && references(^._id)]) > 0] | order(title asc) {${MISSION_DETAIL_PROJECTION}}`;
    const missions = await sanityQuery<unknown[]>(query, {}, mode);

    res.status(200).json({ missions });
    } catch (error) {
    logger.error('missionsProxy failed', error);
    sendError(res, error);
    }
}

export async function handleMapPointsProxy(req: Request, res: FirebaseResponse) {
    if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
    }

    try {
    const mode = resolveMode(readQueryParam(req, 'mode'));
    const decodedToken = await verifyFirebaseUser(req);

    if (mode === 'dev' && decodedToken.dev !== true) {
      throw new HttpError(403, 'Dev map points require Firebase custom claim dev=true.');
    }

    const missionQuery = `*[_type == "mission" && kind == "gps" && active == true && defined(gpsConfig.location.lat) && defined(gpsConfig.location.lng) && count(*[_type == "narrativeBundle" && !(_id in path("drafts.**")) && (publishMode == "instant" || (defined(releaseAt) && dateTime(releaseAt) <= dateTime(now()))) && references(^._id)]) > 0] | order(title asc) {${MAP_MISSION_POINT_PROJECTION}}`;
    const checkpointQuery = `*[_type == "mytopiaCheckpoint" && !(_id in path("drafts.**")) && defined(location.lat) && defined(location.lng)] | order(title asc) {${MAP_CHECKPOINT_PROJECTION}}`;

    const [missionPoints, checkpointPoints] = await Promise.all([
      sanityQuery<MapPointDto[]>(missionQuery, {}, mode),
      sanityQuery<MapPointDto[]>(checkpointQuery, {}, mode),
    ]);

    const points = [...missionPoints, ...checkpointPoints].sort((a, b) => a.title.localeCompare(b.title, 'de'));

    res.status(200).json({ points });
    } catch (error) {
    logger.error('mapPointsProxy failed', error);
    sendError(res, error);
    }
}

export async function getBundleById(bundleId: string, mode: NarrativeMode): Promise<BundleDto | null> {
    const query = `*[_type == "narrativeBundle" && _id == $bundleId && !(_id in path("drafts.**"))][0]{${SANITY_BUNDLE_PROJECTION}}`;
    return sanityQuery<BundleDto | null>(query, { bundleId }, mode);
}

export async function getReleasedFeedBundles({
      cursor,
      limit,
      mode,
    }: {
          cursor: FeedCursor | null;
          limit: number;
          mode: NarrativeMode;
        }): Promise<BundleDto[]> {
    const cursorFilter = cursor
            ? '&& (select(publishMode == "instant" => _updatedAt, releaseAt) < $cursorReleaseAt || (select(publishMode == "instant" => _updatedAt, releaseAt) == $cursorReleaseAt && _id < $cursorId))'
            : '';
    const query = `*[_type == "narrativeBundle"
    && !(_id in path("drafts.**"))
    && (
      (publishMode == "instant") || 
      (defined(releaseAt) && dateTime(releaseAt) <= dateTime(now()))
    )
    ${cursorFilter}
  ] | order(select(publishMode == "instant" => _updatedAt, releaseAt) desc, _id desc) [0...$limit] {${SANITY_BUNDLE_PROJECTION}}`;
    const params: Record<string, unknown> = { limit };
    if (cursor) {
    params.cursorId = cursor.id;
    params.cursorReleaseAt = cursor.releaseAt;
    }

    const result = await sanityQuery<BundleDto[]>(query, params, mode);
    return result.map((bundle) => ({
    ...bundle,
    messages: normalizeBundleMessages(bundle).map(applySanityImageTransforms),
    }));
}

export function normalizeBundleMessages(bundle: BundleDto): MessageDto[] {
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

function normalizeReactionInput(value: unknown): NarrativeReactionId | null {
  if (value === null) {
    return null;
  }

  return isNarrativeReactionId(value) ? value : null;
}

function isBundleReleasedToFeed(bundle: BundleDto) {
  const releaseMs = Date.parse(bundle.releaseAt);
  return Number.isFinite(releaseMs) && releaseMs <= Date.now();
}

export function extractBundleId(payload: SanityWebhookPayload | null | undefined): string | null {
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

export function normalizeBundleId(bundleId: string) {
    return bundleId.startsWith('drafts.') ? bundleId.slice('drafts.'.length) : bundleId;
}

export async function upsertReleaseTask(bundle: BundleDto, mode: NarrativeMode) {
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

export async function deleteReleaseTask(bundleId: string, mode: NarrativeMode) {
    await deleteTaskIfExists(getTaskName(bundleId, mode));
}

export function getTaskName(bundleId: string, mode: NarrativeMode) {
    const normalized = bundleId.replace(/[^a-zA-Z0-9_-]/g, '-');
    const taskId = mode === 'dev' ? `bundle-release-dev-${normalized}` : `bundle-release-${normalized}`;
    return tasksClient.taskPath(
    env().projectId,
    env().cloudTasksLocation,
    env().cloudTasksQueue,
    taskId
    );
}

export async function claimBundleRelease({
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

export async function getNarrativeState(bundleId: string, mode: NarrativeMode) {
    const snapshot = await narrativeStateRef(bundleId, mode).get();
    if (!snapshot.exists) {
    return null;
    }

    return (snapshot.data() as Record<string, unknown> | undefined) ?? null;
}

export async function touchNarrativeState({
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

export function narrativeStateRef(bundleId: string, mode: NarrativeMode) {
    const collectionPath = mode === 'dev' ? NARRATIVE_STATE_COLLECTION_PATH_DEV : NARRATIVE_STATE_COLLECTION_PATH;
    return firestore.collection(collectionPath).doc(bundleId);
}

export async function writeNarrativeReaction({
      bundleId,
      messageId,
      mode,
      reaction,
      uid,
    }: {
          bundleId: string;
          messageId: string;
          mode: NarrativeMode;
          reaction: NarrativeReactionId | null;
          uid: string;
        }) {
    const aggregateRef = narrativeReactionsRef(bundleId, mode);
    const userRef = narrativeUserReactionsRef(bundleId, mode, uid);

    await firestore.runTransaction(async (transaction) => {
      const [aggregateSnapshot, userSnapshot] = await Promise.all([
        transaction.get(aggregateRef),
        transaction.get(userRef),
      ]);

      const aggregateData = (aggregateSnapshot.data() as Record<string, unknown> | undefined) ?? {};
      const userData = (userSnapshot.data() as Record<string, unknown> | undefined) ?? {};
      const aggregateMessages = cloneAggregateMessages(aggregateData.messages);
      const userMessages = cloneUserMessages(userData.messages);

      const previousReaction = userMessages[messageId] ?? null;
      if (previousReaction === reaction) {
        return;
      }

      const nextCounts = {
        ...emptyReactionCounts(),
        ...(aggregateMessages[messageId] ?? {}),
      };

      if (previousReaction) {
        const previousCount = nextCounts[previousReaction] ?? 0;
        if (previousCount <= 1) {
          delete nextCounts[previousReaction];
        } else {
          nextCounts[previousReaction] = previousCount - 1;
        }
      }

      if (reaction) {
        nextCounts[reaction] = (nextCounts[reaction] ?? 0) + 1;
        userMessages[messageId] = reaction;
      } else {
        delete userMessages[messageId];
      }

      if (Object.keys(nextCounts).length > 0) {
        aggregateMessages[messageId] = nextCounts;
      } else {
        delete aggregateMessages[messageId];
      }

      if (Object.keys(aggregateMessages).length === 0) {
        transaction.delete(aggregateRef);
      } else {
        transaction.set(aggregateRef, {
          bundleId,
          messages: serializeAggregateMessages(aggregateMessages),
          mode,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      if (Object.keys(userMessages).length === 0) {
        transaction.delete(userRef);
      } else {
        transaction.set(userRef, {
          bundleId,
          messages: serializeUserMessages(userMessages),
          mode,
          ownerUid: uid,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
}

function narrativeReactionsRef(bundleId: string, mode: NarrativeMode) {
  return firestore.collection(V2_NARRATIVE_REACTIONS_COLLECTION_PATH).doc(buildNarrativeReactionDocId({ bundleId, mode }));
}

function narrativeUserReactionsRef(bundleId: string, mode: NarrativeMode, uid: string) {
  return firestore.collection(V2_NARRATIVE_USER_REACTIONS_COLLECTION_PATH).doc(
    buildNarrativeUserReactionDocId({
      bundleId,
      mode,
      uid,
    })
  );
}

function buildNarrativeReactionDocId({
      bundleId,
      mode,
    }: {
          bundleId: string;
          mode: NarrativeMode;
        }) {
    return `${mode}__${bundleId}`;
}

function buildNarrativeUserReactionDocId({
      bundleId,
      mode,
      uid,
    }: {
          bundleId: string;
          mode: NarrativeMode;
          uid: string;
        }) {
    return `${mode}__${uid}__${bundleId}`;
}

function cloneAggregateMessages(value: unknown) {
  const cloned: Record<string, Partial<Record<NarrativeReactionId, number>>> = {};
  if (!value || typeof value !== 'object') {
    return cloned;
  }

  for (const [messageId, rawEntry] of Object.entries(value as Record<string, unknown>)) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      continue;
    }

    const rawCounts = (rawEntry as Record<string, unknown>).counts;
    if (!rawCounts || typeof rawCounts !== 'object') {
      continue;
    }

    const counts = emptyReactionCounts();
    for (const [reactionId, rawCount] of Object.entries(rawCounts as Record<string, unknown>)) {
      if (!isNarrativeReactionId(reactionId) || typeof rawCount !== 'number' || !Number.isFinite(rawCount) || rawCount <= 0) {
        continue;
      }

      counts[reactionId] = Math.floor(rawCount);
    }

    if (Object.keys(counts).length > 0) {
      cloned[messageId] = counts;
    }
  }

  return cloned;
}

function cloneUserMessages(value: unknown) {
  const cloned: Record<string, NarrativeReactionId> = {};
  if (!value || typeof value !== 'object') {
    return cloned;
  }

  for (const [messageId, rawEntry] of Object.entries(value as Record<string, unknown>)) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      continue;
    }

    const reaction = (rawEntry as Record<string, unknown>).reaction;
    if (!isNarrativeReactionId(reaction)) {
      continue;
    }

    cloned[messageId] = reaction;
  }

  return cloned;
}

function serializeAggregateMessages(messages: Record<string, Partial<Record<NarrativeReactionId, number>>>) {
  return Object.fromEntries(
    Object.entries(messages).map(([messageId, counts]) => [
      messageId,
      {
        counts,
      },
    ])
  );
}

function serializeUserMessages(messages: Record<string, NarrativeReactionId>) {
  return Object.fromEntries(
    Object.entries(messages).map(([messageId, reaction]) => [
      messageId,
      {
        reaction,
      },
    ])
  );
}

export async function verifyCloudTaskInvocation(req: Request) {
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

    const email = payload && typeof payload === 'object' && typeof (payload as { email?: unknown }).email === 'string'
              ? (payload as { email: string }).email
              : null;
    if (!email) {
    throw new HttpError(401, 'Invalid OIDC token payload.');
    }

    if (email !== env().tasksServiceAccountEmail) {
    throw new HttpError(401, 'Unexpected service account for Cloud Tasks invocation.');
    }
}

export async function deleteTaskIfExists(taskName: string) {
    try {
    await tasksClient.deleteTask({ name: taskName });
    } catch (error) {
    if (!isNotFoundTaskError(error)) {
      throw error;
    }
    }
}

export function isNotFoundTaskError(error: unknown) {
    if (typeof error !== 'object' || error === null) {
    return false;
    }

    const code = (error as { code?: unknown }).code;
    return code === 5 || code === '5' || code === 'NOT_FOUND';
}
