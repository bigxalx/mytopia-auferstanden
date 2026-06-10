import crypto from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Request } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

import { verifyFirebaseUser } from './auth.js';
import { resolveMode, env } from './config.js';
import { V2_LIVE_SESSIONS_COLLECTION_PATH } from './constants.js';
import { firestore } from './firebase.js';
import { FirebaseResponse, NarrativeMode } from './types.js';
import { formatError, HttpError, readHeader, readQueryParam, sendError } from './utils.js';

type LiveSessionStatus = 'draft' | 'active' | 'paused' | 'closed';
type LiveEventSource = 'admin' | 'adaptor';
type LiveEventType = 'terror_alert';

type LiveSessionDoc = {
  closedAt?: Timestamp;
  closedBy?: string;
  currentEventId?: string | null;
  endsAt?: Timestamp;
  joinTokenHash?: string;
  mode?: NarrativeMode;
  startsAt?: Timestamp;
  status?: LiveSessionStatus;
  title?: string;
  updatedAt?: Timestamp;
  venueLatitude?: number;
  venueLongitude?: number;
  venueName?: string;
  venueRadiusMeters?: number;
};

type LiveJoinTokenDoc = {
  token?: string;
  tokenHash?: string;
};

const DEFAULT_SESSION_TITLE = 'Mytopia Live';
const DEFAULT_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const DEFAULT_VENUE_LATITUDE = 50.9871377;
const DEFAULT_VENUE_LONGITUDE = 12.4374725;
const DEFAULT_VENUE_NAME = 'Theater Altenburg Gera';
const DEFAULT_VENUE_RADIUS_METERS = 50;
const EARTH_RADIUS_METERS = 6_371_000;
const CURRENT_SESSION_IDS: Record<NarrativeMode, string> = {
  dev: 'dev-current',
  production: 'production-current',
};

export async function handleLiveRequest(req: Request, res: FirebaseResponse, path: string) {
  try {
    const clearMatch = path.match(/^\/live\/events\/([^/]+)\/clear$/);
    const sessionCloseMatch = path.match(/^\/live\/sessions\/([^/]+)\/close$/);
    const sessionGetMatch = path.match(/^\/live\/sessions\/([^/]+)$/);

    if (path === '/live/sessions' && req.method === 'POST') {
      await handleStartLiveSession(req, res);
      return;
    }

    if (path === '/live/sessions/active' && req.method === 'GET') {
      await handleGetActiveLiveSession(req, res);
      return;
    }

    if (sessionCloseMatch && req.method === 'POST') {
      await handleCloseLiveSession(req, res, decodeURIComponent(sessionCloseMatch[1]));
      return;
    }

    if (sessionGetMatch && req.method === 'GET') {
      await handleGetLiveSession(req, res, decodeURIComponent(sessionGetMatch[1]));
      return;
    }

    if (path === '/live/join' && req.method === 'POST') {
      await handleJoinLiveSession(req, res);
      return;
    }

    if (path === '/live/heartbeat' && req.method === 'POST') {
      await handleLiveHeartbeat(req, res);
      return;
    }

    if (path === '/live/events' && req.method === 'POST') {
      await handleTriggerLiveEvent(req, res);
      return;
    }

    if (clearMatch && req.method === 'POST') {
      await handleClearLiveEvent(req, res, decodeURIComponent(clearMatch[1]));
      return;
    }

    res.status(404).json({ error: 'Live route not found.' });
  } catch (error) {
    logger.error('live route failed', { path, error: formatError(error) });
    sendError(res, error);
  }
}

async function handleStartLiveSession(req: Request, res: FirebaseResponse) {
  const decoded = await verifyFirebaseUser(req);
  assertModerator(decoded);

  const body = objectBody(req);
  const mode = resolveMode(body.mode);
  assertCanUseMode(decoded, mode);

  const now = Date.now();
  const title = stringValue(body.title) ?? DEFAULT_SESSION_TITLE;
  const sessionId = liveSessionIdForMode(mode);
  const venueLatitude = numberValue(body.venueLatitude) ?? DEFAULT_VENUE_LATITUDE;
  const venueLongitude = numberValue(body.venueLongitude) ?? DEFAULT_VENUE_LONGITUDE;
  const venueRadiusMeters = numberValue(body.venueRadiusMeters) ?? DEFAULT_VENUE_RADIUS_METERS;
  const venueName = stringValue(body.venueName) ?? DEFAULT_VENUE_NAME;
  const sessionRef = liveSessionRef(sessionId);
  const tokenRef = liveSessionJoinTokenRef(sessionId);

  const joinToken = await firestore.runTransaction(async (transaction) => {
    const [sessionSnapshot, tokenSnapshot] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(tokenRef),
    ]);
    const currentSession = sessionSnapshot.exists ? sessionSnapshot.data() as LiveSessionDoc : null;
    const currentToken = tokenSnapshot.exists ? tokenSnapshot.data() as LiveJoinTokenDoc : null;
    const isContinuingActiveSession = Boolean(
      currentSession?.status === 'active'
      && !hasSessionEnded(currentSession)
      && resolveMode(currentSession.mode) === mode
    );
    const reusableToken = isContinuingActiveSession ? stringValue(currentToken?.token) : undefined;
    const nextJoinToken = reusableToken ?? createJoinToken();
    const startsAt = isContinuingActiveSession && currentSession?.startsAt
      ? currentSession.startsAt
      : Timestamp.fromMillis(now);
    const endsAt = isContinuingActiveSession && currentSession?.endsAt && currentSession.endsAt.toMillis() > now
      ? currentSession.endsAt
      : Timestamp.fromMillis(now + DEFAULT_SESSION_DURATION_MS);

    const payload: Record<string, unknown> = {
      ...(sessionSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      ...(sessionSnapshot.exists ? {
        closedAt: FieldValue.delete(),
        closedBy: FieldValue.delete(),
      } : {}),
      currentEventId: isContinuingActiveSession ? currentSession?.currentEventId ?? null : null,
      endsAt,
      joinTokenHash: hashJoinToken(nextJoinToken),
      mode,
      startsAt,
      status: 'active',
      title,
      updatedAt: FieldValue.serverTimestamp(),
      venueRadiusMeters,
    };

    payload.venueName = venueName;
    payload.venueLatitude = venueLatitude;
    payload.venueLongitude = venueLongitude;

    transaction.set(sessionRef, payload, { merge: true });
    transaction.set(tokenRef, {
      ...(tokenSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      token: nextJoinToken,
      tokenHash: hashJoinToken(nextJoinToken),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return nextJoinToken;
  });

  await closeOtherActiveSessions(mode, sessionId);

  const snapshot = await sessionRef.get();
  const data = snapshot.data() as LiveSessionDoc;
  logger.info('live session started', { mode, sessionId, title, uid: decoded.uid });
  res.status(200).json({
    joinToken,
    ok: true,
    session: serializeLiveSession(sessionId, data),
  });
}

async function handleGetActiveLiveSession(req: Request, res: FirebaseResponse) {
  const decoded = await verifyFirebaseUser(req);
  const mode = resolveMode(readQueryParam(req, 'mode'));
  assertCanUseMode(decoded, mode);
  const session = await findActiveLiveSession(mode);
  if (!session) {
    res.status(200).json({ ok: true, session: null });
    return;
  }

  const includeAdminStats = isModerator(decoded);
  res.status(200).json({
    ...(includeAdminStats ? { joinToken: await readLiveSessionJoinToken(session.id) } : {}),
    ok: true,
    session: await serializeLiveSessionWithOptionalStats(session.id, session.data, includeAdminStats),
  });
}

async function handleGetLiveSession(req: Request, res: FirebaseResponse, sessionId: string) {
  const decoded = await verifyFirebaseUser(req);
  const snapshot = await liveSessionRef(sessionId).get();
  if (!snapshot.exists) {
    throw new HttpError(404, 'Live session not found.');
  }

  const data = snapshot.data() as LiveSessionDoc;
  assertCanUseMode(decoded, resolveMode(data.mode));
  res.status(200).json({
    ok: true,
    session: await serializeLiveSessionWithOptionalStats(snapshot.id, data, isModerator(decoded)),
  });
}

async function handleCloseLiveSession(req: Request, res: FirebaseResponse, sessionId: string) {
  const decoded = await verifyFirebaseUser(req);
  assertModerator(decoded);

  const sessionRef = liveSessionRef(sessionId);
  const snapshot = await sessionRef.get();
  if (!snapshot.exists) {
    throw new HttpError(404, 'Live session not found.');
  }

  const data = snapshot.data() as LiveSessionDoc;
  const mode = resolveMode(data.mode);
  assertCanUseMode(decoded, mode);

  const currentEventId = typeof data.currentEventId === 'string' ? data.currentEventId : null;
  const payload = {
    closedAt: FieldValue.serverTimestamp(),
    closedBy: decoded.uid,
    currentEventId: null,
    status: 'closed',
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (currentEventId) {
    await firestore.runTransaction(async (transaction) => {
      transaction.set(sessionRef, payload, { merge: true });
      transaction.set(liveSessionRef(sessionId).collection('events').doc(currentEventId), {
        clearedAt: FieldValue.serverTimestamp(),
        clearedBy: decoded.uid,
        status: 'cleared',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  } else {
    await sessionRef.set(payload, { merge: true });
  }

  await markParticipantsOffline(sessionId);

  const closedSnapshot = await sessionRef.get();
  logger.info('live session closed', { mode, sessionId, uid: decoded.uid });
  res.status(200).json({
    ok: true,
    session: serializeLiveSession(sessionId, closedSnapshot.data() as LiveSessionDoc),
  });
}

async function handleJoinLiveSession(req: Request, res: FirebaseResponse) {
  const decoded = await verifyFirebaseUser(req);
  const body = objectBody(req);
  const sessionId = requiredString(body.sessionId, 'sessionId');
  const snapshot = await liveSessionRef(sessionId).get();
  if (!snapshot.exists) {
    throw new HttpError(404, 'Live session not found.');
  }

  const data = snapshot.data() as LiveSessionDoc;
  const mode = resolveMode(data.mode);
  assertCanUseMode(decoded, mode);
  assertCurrentLiveSession(sessionId, mode);
  assertSessionCanAcceptJoin(data);

  const token = stringValue(body.token);
  const requestedJoinMethod = stringValue(body.joinMethod);
  const location = normalizeLocation(body.location);

  let joinMethod: 'qr' | 'auto-gps-time';
  if (token && data.joinTokenHash === hashJoinToken(token)) {
    joinMethod = 'qr';
  } else if (requestedJoinMethod === 'auto-gps-time' && isValidAutoCheckIn(data, location)) {
    joinMethod = 'auto-gps-time';
  } else {
    throw new HttpError(403, 'Invalid live session join credentials.');
  }

  const participantRef = liveSessionRef(sessionId).collection('participants').doc(decoded.uid);
  const participantSnapshot = await participantRef.get();
  await participantRef.set(
    {
      connectionState: 'connected',
      ...(participantSnapshot.exists ? {} : { joinedAt: FieldValue.serverTimestamp() }),
      joinMethod,
      lastSeenAt: FieldValue.serverTimestamp(),
      uid: decoded.uid,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  logger.info('live session joined', { joinMethod, mode, sessionId, uid: decoded.uid });
  res.status(200).json({
    joinMethod,
    ok: true,
    session: serializeLiveSession(sessionId, data),
  });
}

async function handleLiveHeartbeat(req: Request, res: FirebaseResponse) {
  const decoded = await verifyFirebaseUser(req);
  const body = objectBody(req);
  const sessionId = requiredString(body.sessionId, 'sessionId');
  const sessionSnapshot = await liveSessionRef(sessionId).get();
  if (!sessionSnapshot.exists) {
    throw new HttpError(404, 'Live session not found.');
  }

  const data = sessionSnapshot.data() as LiveSessionDoc;
  const mode = resolveMode(data.mode);
  assertCanUseMode(decoded, mode);

  const participantRef = liveSessionRef(sessionId).collection('participants').doc(decoded.uid);
  const participantSnapshot = await participantRef.get();
  if (!participantSnapshot.exists) {
    throw new HttpError(404, 'Live session participant not found.');
  }

  try {
    assertCurrentLiveSession(sessionId, mode);
    assertSessionCanAcceptJoin(data);
  } catch (error) {
    await participantRef.set(
      {
        connectionState: 'offline',
        lastSeenAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw error;
  }

  await participantRef.set(
    {
      connectionState: 'connected',
      lastSeenAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  res.status(200).json({ ok: true });
}

async function handleTriggerLiveEvent(req: Request, res: FirebaseResponse) {
  const body = objectBody(req);
  const source = normalizeLiveEventSource(body.source);
  const actor = await authenticateEventSource(req, source);
  const mode = resolveMode(body.mode);
  if (actor.uid) {
    assertCanUseMode(actor.decoded, mode);
  }

  const sessionId = requiredString(body.sessionId, 'sessionId');
  const type = normalizeLiveEventType(body.type);
  const snapshot = await liveSessionRef(sessionId).get();
  if (!snapshot.exists) {
    throw new HttpError(404, 'Live session not found.');
  }
  const session = snapshot.data() as LiveSessionDoc;
  if (resolveMode(session.mode) !== mode) {
    throw new HttpError(400, 'Live event mode does not match the session mode.');
  }
  assertCurrentLiveSession(sessionId, mode);
  assertSessionIsActive(session);

  const eventRef = liveSessionRef(sessionId).collection('events').doc();
  const payload = normalizeEventPayload(body.payload);
  await eventRef.set({
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.uid ?? source,
    cueId: stringValue(body.cueId) ?? null,
    mode,
    payload,
    source,
    status: 'active',
    type,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await liveSessionRef(sessionId).set({
    currentEventId: eventRef.id,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  logger.info('live event triggered', { eventId: eventRef.id, sessionId, source, type });
  res.status(200).json({
    eventId: eventRef.id,
    ok: true,
    sessionId,
    status: 'active',
  });
}

async function handleClearLiveEvent(req: Request, res: FirebaseResponse, eventId: string) {
  const body = objectBody(req);
  const source = normalizeLiveEventSource(body.source);
  const actor = await authenticateEventSource(req, source);
  const sessionId = requiredString(body.sessionId, 'sessionId');
  const eventRef = liveSessionRef(sessionId).collection('events').doc(eventId);
  const sessionRef = liveSessionRef(sessionId);

  await firestore.runTransaction(async (transaction) => {
    const [eventSnapshot, sessionSnapshot] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(sessionRef),
    ]);
    if (!eventSnapshot.exists) {
      throw new HttpError(404, 'Live event not found.');
    }
    if (!sessionSnapshot.exists) {
      throw new HttpError(404, 'Live session not found.');
    }

    const session = sessionSnapshot.data() as LiveSessionDoc;
    if (actor.uid) {
      assertCanUseMode(actor.decoded, resolveMode(session.mode));
    }

    transaction.set(eventRef, {
      clearCueId: stringValue(body.cueId) ?? null,
      clearedAt: FieldValue.serverTimestamp(),
      clearedBy: actor.uid ?? source,
      status: 'cleared',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (session.currentEventId === eventId) {
      transaction.set(sessionRef, {
        currentEventId: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });

  logger.info('live event cleared', { eventId, sessionId, source });
  res.status(200).json({
    eventId,
    ok: true,
    sessionId,
    status: 'cleared',
  });
}

function liveSessionRef(sessionId: string) {
  return firestore.collection(V2_LIVE_SESSIONS_COLLECTION_PATH).doc(sessionId);
}

function liveSessionJoinTokenRef(sessionId: string) {
  return liveSessionRef(sessionId).collection('private').doc('joinToken');
}

async function findActiveLiveSession(mode: NarrativeMode) {
  const sessionId = liveSessionIdForMode(mode);
  const snapshot = await liveSessionRef(sessionId).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as LiveSessionDoc;
  if (data.status !== 'active' || hasSessionEnded(data)) {
    return null;
  }

  return { id: snapshot.id, data };
}

async function serializeLiveSessionWithOptionalStats(sessionId: string, data: LiveSessionDoc, includeStats: boolean) {
  const serialized = serializeLiveSession(sessionId, data);
  if (!includeStats) {
    return serialized;
  }

  const recentCutoff = Timestamp.fromMillis(Date.now() - 30_000);
  const participantsSnapshot = await liveSessionRef(sessionId)
    .collection('participants')
    .where('lastSeenAt', '>=', recentCutoff)
    .get();
  return {
    ...serialized,
    recentParticipantCount: participantsSnapshot.size,
  };
}

function serializeLiveSession(sessionId: string, data: LiveSessionDoc) {
  return {
    currentEventId: data.currentEventId ?? null,
    closedAt: timestampToIso(data.closedAt),
    closedBy: data.closedBy ?? null,
    endsAt: timestampToIso(data.endsAt),
    mode: resolveMode(data.mode),
    sessionId,
    startsAt: timestampToIso(data.startsAt),
    status: data.status ?? 'draft',
    title: data.title ?? DEFAULT_SESSION_TITLE,
    updatedAt: timestampToIso(data.updatedAt),
    venueLatitude: data.venueLatitude ?? null,
    venueLongitude: data.venueLongitude ?? null,
    venueName: data.venueName ?? null,
    venueRadiusMeters: data.venueRadiusMeters ?? DEFAULT_VENUE_RADIUS_METERS,
  };
}

async function readLiveSessionJoinToken(sessionId: string) {
  const snapshot = await liveSessionJoinTokenRef(sessionId).get();
  if (!snapshot.exists) {
    return null;
  }
  return stringValue((snapshot.data() as LiveJoinTokenDoc).token) ?? null;
}

async function authenticateEventSource(req: Request, source: LiveEventSource) {
  if (source === 'adaptor') {
    const configuredToken = env().adaptorLiveTriggerToken;
    if (!configuredToken) {
      throw new HttpError(503, 'Adaptor live trigger token is not configured.');
    }

    const providedToken = readBearerToken(req) ?? readHeader(req, 'x-live-trigger-token');
    if (!providedToken || providedToken !== configuredToken) {
      throw new HttpError(401, 'Invalid adaptor live trigger token.');
    }

    return { source };
  }

  const decoded = await verifyFirebaseUser(req);
  assertModerator(decoded);
  return { decoded, source, uid: decoded.uid };
}

function assertModerator(decoded: Record<string, unknown>) {
  if (decoded.admin === true || decoded.moderator === true) {
    return;
  }
  throw new HttpError(403, 'Admin or moderator claim required.');
}

function isModerator(decoded: Record<string, unknown>) {
  return decoded.admin === true || decoded.moderator === true;
}

function assertCanUseMode(decoded: Record<string, unknown> | undefined, mode: NarrativeMode) {
  if (mode === 'production') {
    return;
  }
  if (decoded?.dev === true || decoded?.admin === true || decoded?.moderator === true) {
    return;
  }
  throw new HttpError(403, 'Dev mode claim required.');
}

function assertSessionCanAcceptJoin(data: LiveSessionDoc) {
  if (data.status !== 'active') {
    throw new HttpError(403, 'Live session is not active.');
  }
  if (hasSessionEnded(data)) {
    throw new HttpError(403, 'Live session has ended.');
  }
}

function assertSessionIsActive(data: LiveSessionDoc) {
  assertSessionCanAcceptJoin(data);
}

function assertCurrentLiveSession(sessionId: string, mode: NarrativeMode) {
  if (sessionId !== liveSessionIdForMode(mode)) {
    throw new HttpError(403, 'Live session is no longer current.');
  }
}

function hasSessionEnded(data: LiveSessionDoc) {
  const endsAtMs = data.endsAt?.toMillis();
  return typeof endsAtMs === 'number' && endsAtMs < Date.now();
}

function isValidAutoCheckIn(data: LiveSessionDoc, location: { latitude: number; longitude: number } | null) {
  if (!location) {
    return false;
  }

  const now = Date.now();
  const startsAtMs = data.startsAt?.toMillis();
  const endsAtMs = data.endsAt?.toMillis();
  if (typeof startsAtMs === 'number' && now < startsAtMs) {
    return false;
  }
  if (typeof endsAtMs === 'number' && now > endsAtMs) {
    return false;
  }
  if (typeof data.venueLatitude !== 'number' || typeof data.venueLongitude !== 'number') {
    return false;
  }

  const radius = data.venueRadiusMeters ?? DEFAULT_VENUE_RADIUS_METERS;
  return calculateDistanceMeters(location, {
    latitude: data.venueLatitude,
    longitude: data.venueLongitude,
  }) <= radius;
}

function calculateDistanceMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number }
) {
  const leftLat = toRadians(left.latitude);
  const rightLat = toRadians(right.latitude);
  const deltaLat = toRadians(right.latitude - left.latitude);
  const deltaLon = toRadians(right.longitude - left.longitude);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function objectBody(req: Request): Record<string, unknown> {
  return typeof req.body === 'object' && req.body !== null ? req.body as Record<string, unknown> : {};
}

function requiredString(value: unknown, fieldName: string) {
  const normalized = stringValue(value);
  if (!normalized) {
    throw new HttpError(400, `Missing ${fieldName}.`);
  }
  return normalized;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeLocation(value: unknown) {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const latitude = numberValue((value as { latitude?: unknown }).latitude);
  const longitude = numberValue((value as { longitude?: unknown }).longitude);
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  return { latitude, longitude };
}

function normalizeLiveEventSource(value: unknown): LiveEventSource {
  return value === 'adaptor' ? 'adaptor' : 'admin';
}

function normalizeLiveEventType(value: unknown): LiveEventType {
  if (value === 'terror_alert') {
    return value;
  }
  throw new HttpError(400, 'Unsupported live event type.');
}

function normalizeEventPayload(value: unknown) {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  return {
    message: stringValue(source.message) ?? 'Angriff außerhalb der Kuppel bestätigt.',
    severity: stringValue(source.severity) ?? 'alarm',
    title: stringValue(source.title) ?? 'Terrorwarnung',
  };
}

function createJoinToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function hashJoinToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('base64url');
}

function liveSessionIdForMode(mode: NarrativeMode) {
  return CURRENT_SESSION_IDS[mode];
}

async function closeOtherActiveSessions(mode: NarrativeMode, currentSessionId: string) {
  const snapshot = await firestore
    .collection(V2_LIVE_SESSIONS_COLLECTION_PATH)
    .where('mode', '==', mode)
    .where('status', '==', 'active')
    .get();

  const staleSessions = snapshot.docs.filter((doc) => doc.id !== currentSessionId);
  if (staleSessions.length === 0) {
    return;
  }

  const batch = firestore.batch();
  for (const doc of staleSessions) {
    batch.set(doc.ref, {
      closedAt: FieldValue.serverTimestamp(),
      closedBy: 'system',
      currentEventId: null,
      status: 'closed',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
  await Promise.all(staleSessions.map((doc) => markParticipantsOffline(doc.id)));
}

async function markParticipantsOffline(sessionId: string) {
  const snapshot = await liveSessionRef(sessionId)
    .collection('participants')
    .where('connectionState', '==', 'connected')
    .limit(500)
    .get();

  if (snapshot.empty) {
    return;
  }

  const batch = firestore.batch();
  for (const doc of snapshot.docs) {
    batch.set(doc.ref, {
      connectionState: 'offline',
      lastSeenAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
}

function timestampToIso(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

function readBearerToken(req: Request) {
  const authHeader = readHeader(req, 'authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length);
}
