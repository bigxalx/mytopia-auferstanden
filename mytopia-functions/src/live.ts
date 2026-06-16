import crypto from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Request } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

import { verifyFirebaseUser } from './auth.js';
import { resolveMode, env } from './config.js';
import {
  V2_FCM_REGISTRATIONS_COLLECTION_PATH,
  V2_LIVE_SESSIONS_COLLECTION_PATH,
  V2_LIVE_SHOW_WINDOWS_COLLECTION_PATH,
} from './constants.js';
import { firestore, messaging } from './firebase.js';
import { FirebaseResponse, NarrativeMode } from './types.js';
import { formatError, HttpError, readHeader, readQueryParam, sendError } from './utils.js';

type LiveSessionStatus = 'draft' | 'active' | 'paused' | 'closed';
type LiveEventSource = 'admin' | 'adaptor';
type LiveEventType = 'terror_alert';
type LiveShowWindowStatus = 'scheduled' | 'cancelled';
type LiveSessionSource = 'schedule' | 'manual';

type LiveSessionDoc = {
  closedAt?: Timestamp;
  closedBy?: string;
  currentEventId?: string | null;
  endsAt?: Timestamp;
  joinTokenHash?: string;
  mode?: NarrativeMode;
  sessionSource?: LiveSessionSource;
  showWindowId?: string | null;
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

type LiveShowWindowDoc = {
  cancelledAt?: Timestamp;
  cancelledBy?: string;
  createdAt?: Timestamp;
  createdBy?: string;
  endsAt?: Timestamp;
  mode?: NarrativeMode;
  startsAt?: Timestamp;
  status?: LiveShowWindowStatus;
  title?: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
  venueLatitude?: number;
  venueLongitude?: number;
  venueName?: string;
  venueRadiusMeters?: number;
};

type LiveParticipantDoc = {
  connectionState?: 'connected' | 'reconnecting' | 'offline';
  lastSeenAt?: Timestamp;
  uid?: string;
};

const DEFAULT_SESSION_TITLE = 'Mytopia Live';
const DEBUG_SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
const DEFAULT_VENUE_LATITUDE = 50.9871377;
const DEFAULT_VENUE_LONGITUDE = 12.4374725;
const DEFAULT_VENUE_NAME = 'Theater Altenburg Gera';
const DEFAULT_VENUE_RADIUS_METERS = 50;
const EARTH_RADIUS_METERS = 6_371_000;
const LIVE_ALERT_PUSH_BURST_COUNT = 4;
const LIVE_ALERT_PUSH_BURST_DELAY_MS = 350;
const LIVE_ALERT_PUSH_TITLE = 'Dringende Live-Meldung';
const LIVE_ALERT_PUSH_BODY = 'Öffne Mytopia für weitere Informationen.';
const LIVE_ALERT_PUSH_CHANNEL_ID = 'live-terror-alert';
const LIVE_ALERT_PUSH_BATCH_SIZE = 500;
const PERMANENT_FCM_TOKEN_ERROR_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);
const CURRENT_SESSION_IDS: Record<NarrativeMode, string> = {
  dev: 'dev-current',
  production: 'production-current',
};

export async function handleLiveRequest(req: Request, res: FirebaseResponse, path: string) {
  try {
    const clearMatch = path.match(/^\/live\/events\/([^/]+)\/clear$/);
    const sessionCloseMatch = path.match(/^\/live\/sessions\/([^/]+)\/close$/);
    const sessionGetMatch = path.match(/^\/live\/sessions\/([^/]+)$/);
    const showWindowCancelMatch = path.match(/^\/live\/show-windows\/([^/]+)\/cancel$/);
    const showWindowMatch = path.match(/^\/live\/show-windows\/([^/]+)$/);

    if (path === '/live/adaptor/terror-alert/start') {
      if (!isAdaptorSignalMethod(req.method)) {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      await handleAdaptorTerrorAlertStart(req, res);
      return;
    }

    if (path === '/live/adaptor/terror-alert/stop') {
      if (!isAdaptorSignalMethod(req.method)) {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      await handleAdaptorTerrorAlertStop(req, res);
      return;
    }

    if (path === '/live/availability' && req.method === 'GET') {
      await handleGetLiveAvailability(req, res);
      return;
    }

    if (path === '/live/show-windows' && req.method === 'GET') {
      await handleListLiveShowWindows(req, res);
      return;
    }

    if (path === '/live/show-windows' && req.method === 'POST') {
      await handleCreateLiveShowWindow(req, res);
      return;
    }

    if (showWindowCancelMatch && req.method === 'POST') {
      await handleCancelLiveShowWindow(req, res, decodeURIComponent(showWindowCancelMatch[1]));
      return;
    }

    if (showWindowMatch && req.method === 'POST') {
      await handleUpdateLiveShowWindow(req, res, decodeURIComponent(showWindowMatch[1]));
      return;
    }

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

    if (path === '/live/leave' && req.method === 'POST') {
      await handleLeaveLiveSession(req, res);
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

async function handleGetLiveAvailability(req: Request, res: FirebaseResponse) {
  const decoded = await verifyFirebaseUser(req);
  const mode = resolveMode(readQueryParam(req, 'mode'));
  assertCanUseMode(decoded, mode);

  const sessionId = requiredString(readQueryParam(req, 'sessionId'), 'sessionId');
  assertCurrentLiveSession(sessionId, mode);

  const token = stringValue(readQueryParam(req, 'token'));
  if (!token || !await doesJoinTokenMatch(sessionId, token)) {
    throw new HttpError(403, 'Invalid live session join credentials.');
  }

  const activeSession = await ensureCurrentSessionForActiveWindow(mode) ?? await findActiveLiveSession(mode);
  if (activeSession) {
    const window = activeSession.data.showWindowId
      ? await readLiveShowWindow(activeSession.data.showWindowId)
      : null;
    res.status(200).json({
      currentWindow: window ? serializeLiveShowWindow(window.id, window.data) : null,
      ok: true,
      session: serializeLiveSession(activeSession.id, activeSession.data),
      state: 'active',
    });
    return;
  }

  const nextWindow = await findNextLiveShowWindow(mode);
  res.status(200).json({
    nextWindow: nextWindow ? serializeLiveShowWindow(nextWindow.id, nextWindow.data) : null,
    ok: true,
    state: nextWindow ? 'upcoming' : 'unavailable',
  });
}

async function handleListLiveShowWindows(req: Request, res: FirebaseResponse) {
  const decoded = await verifyFirebaseUser(req);
  assertModerator(decoded);

  const mode = resolveMode(readQueryParam(req, 'mode'));
  assertCanUseMode(decoded, mode);
  const windows = await listLiveShowWindows(mode);
  const activeSession = await ensureCurrentSessionForActiveWindow(mode) ?? await findActiveLiveSession(mode);
  const nextWindow = await findNextLiveShowWindow(mode);

  res.status(200).json({
    currentSession: activeSession
      ? await serializeLiveSessionWithOptionalStats(activeSession.id, activeSession.data, true)
      : null,
    joinToken: await ensureLiveSessionJoinToken(liveSessionIdForMode(mode)),
    nextWindow: nextWindow ? serializeLiveShowWindow(nextWindow.id, nextWindow.data) : null,
    ok: true,
    windows: windows.map((window) => serializeLiveShowWindow(window.id, window.data)),
  });
}

async function handleCreateLiveShowWindow(req: Request, res: FirebaseResponse) {
  const decoded = await verifyFirebaseUser(req);
  assertModerator(decoded);

  const body = objectBody(req);
  const input = parseLiveShowWindowInput(body, { partial: false });
  assertCanUseMode(decoded, input.mode);

  const ref = liveShowWindowsCollection().doc();
  await ref.set({
    createdAt: FieldValue.serverTimestamp(),
    createdBy: decoded.uid,
    endsAt: input.endsAt,
    mode: input.mode,
    startsAt: input.startsAt,
    status: 'scheduled',
    title: input.title,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: decoded.uid,
    venueLatitude: input.venueLatitude,
    venueLongitude: input.venueLongitude,
    venueName: input.venueName,
    venueRadiusMeters: input.venueRadiusMeters,
  });

  const snapshot = await ref.get();
  await ensureCurrentSessionForActiveWindow(input.mode);
  logger.info('live show window created', { mode: input.mode, showWindowId: ref.id, uid: decoded.uid });
  res.status(200).json({
    ok: true,
    window: serializeLiveShowWindow(ref.id, snapshot.data() as LiveShowWindowDoc),
  });
}

async function handleUpdateLiveShowWindow(req: Request, res: FirebaseResponse, windowId: string) {
  const decoded = await verifyFirebaseUser(req);
  assertModerator(decoded);

  const ref = liveShowWindowRef(windowId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new HttpError(404, 'Live show window not found.');
  }

  const current = snapshot.data() as LiveShowWindowDoc;
  const mode = resolveMode(current.mode);
  assertCanUseMode(decoded, mode);
  const input = parseLiveShowWindowInput({ ...current, ...objectBody(req), mode }, { partial: false });

  await ref.set({
    endsAt: input.endsAt,
    startsAt: input.startsAt,
    title: input.title,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: decoded.uid,
    venueLatitude: input.venueLatitude,
    venueLongitude: input.venueLongitude,
    venueName: input.venueName,
    venueRadiusMeters: input.venueRadiusMeters,
  }, { merge: true });

  const updatedSnapshot = await ref.get();
  await ensureCurrentSessionForActiveWindow(mode);
  logger.info('live show window updated', { mode, showWindowId: windowId, uid: decoded.uid });
  res.status(200).json({
    ok: true,
    window: serializeLiveShowWindow(windowId, updatedSnapshot.data() as LiveShowWindowDoc),
  });
}

async function handleCancelLiveShowWindow(req: Request, res: FirebaseResponse, windowId: string) {
  const decoded = await verifyFirebaseUser(req);
  assertModerator(decoded);

  const ref = liveShowWindowRef(windowId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new HttpError(404, 'Live show window not found.');
  }

  const data = snapshot.data() as LiveShowWindowDoc;
  const mode = resolveMode(data.mode);
  assertCanUseMode(decoded, mode);
  await ref.set({
    cancelledAt: FieldValue.serverTimestamp(),
    cancelledBy: decoded.uid,
    status: 'cancelled',
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: decoded.uid,
  }, { merge: true });

  const session = await findActiveLiveSession(mode);
  if (session?.data.showWindowId === windowId) {
    await closeLiveSession(session.id, decoded.uid);
  }

  const updatedSnapshot = await ref.get();
  logger.info('live show window cancelled', { mode, showWindowId: windowId, uid: decoded.uid });
  res.status(200).json({
    ok: true,
    window: serializeLiveShowWindow(windowId, updatedSnapshot.data() as LiveShowWindowDoc),
  });
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
  const joinToken = await ensureLiveSessionJoinToken(sessionId);

  await firestore.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    const currentSession = sessionSnapshot.exists ? sessionSnapshot.data() as LiveSessionDoc : null;
    const isContinuingActiveSession = Boolean(
      currentSession?.status === 'active'
      && !hasSessionEnded(currentSession)
      && resolveMode(currentSession.mode) === mode
      && currentSession.sessionSource === 'manual'
    );
    const startsAt = isContinuingActiveSession && currentSession?.startsAt
      ? currentSession.startsAt
      : Timestamp.fromMillis(now);
    const endsAt = isContinuingActiveSession && currentSession?.endsAt && currentSession.endsAt.toMillis() > now
      ? currentSession.endsAt
      : Timestamp.fromMillis(now + DEBUG_SESSION_DURATION_MS);

    const payload: Record<string, unknown> = {
      ...(sessionSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      ...(sessionSnapshot.exists ? {
        closedAt: FieldValue.delete(),
        closedBy: FieldValue.delete(),
      } : {}),
      currentEventId: isContinuingActiveSession ? currentSession?.currentEventId ?? null : null,
      endsAt,
      joinTokenHash: hashJoinToken(joinToken),
      mode,
      sessionSource: 'manual',
      showWindowId: null,
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
  const session = await ensureCurrentSessionForActiveWindow(mode) ?? await findActiveLiveSession(mode);
  const includeAdminStats = isModerator(decoded);
  if (!session) {
    const nextWindow = await findNextLiveShowWindow(mode);
    res.status(200).json({
      ...(includeAdminStats ? { joinToken: await ensureLiveSessionJoinToken(liveSessionIdForMode(mode)) } : {}),
      nextWindow: nextWindow ? serializeLiveShowWindow(nextWindow.id, nextWindow.data) : null,
      ok: true,
      session: null,
    });
    return;
  }

  res.status(200).json({
    ...(includeAdminStats ? { joinToken: await ensureLiveSessionJoinToken(session.id) } : {}),
    currentWindow: session.data.showWindowId
      ? serializeNullableLiveShowWindow(await readLiveShowWindow(session.data.showWindowId))
      : null,
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

  await closeLiveSession(sessionId, decoded.uid);

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
  const mode = resolveMode(body.mode);
  assertCanUseMode(decoded, mode);
  assertCurrentLiveSession(sessionId, mode);

  const token = stringValue(body.token);
  const requestedJoinMethod = stringValue(body.joinMethod);
  const location = normalizeLocation(body.location);

  let joinMethod: 'qr' | 'auto-gps-time';
  let session = await ensureCurrentSessionForActiveWindow(mode) ?? await findActiveLiveSession(mode);
  if (token && await doesJoinTokenMatch(sessionId, token)) {
    joinMethod = 'qr';
  } else if (requestedJoinMethod === 'auto-gps-time') {
    joinMethod = 'auto-gps-time';
    session = await ensureCurrentSessionForActiveWindow(mode);
  } else {
    throw new HttpError(403, 'Invalid live session join credentials.');
  }

  if (!session) {
    throw new HttpError(403, 'No active live window.');
  }

  const data = session.data;
  assertSessionCanAcceptJoin(data);
  if (joinMethod === 'auto-gps-time' && !isValidAutoCheckIn(data, location)) {
    throw new HttpError(403, 'Live auto check-in is not available here.');
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

async function handleLeaveLiveSession(req: Request, res: FirebaseResponse) {
  const decoded = await verifyFirebaseUser(req);
  const body = objectBody(req);
  const sessionId = requiredString(body.sessionId, 'sessionId');
  const sessionSnapshot = await liveSessionRef(sessionId).get();
  if (!sessionSnapshot.exists) {
    logger.info('live session participant leave skipped: session missing', { sessionId, uid: decoded.uid });
    res.status(200).json({ ok: true });
    return;
  }

  const data = sessionSnapshot.data() as LiveSessionDoc;
  assertCanUseMode(decoded, resolveMode(data.mode));

  await liveSessionRef(sessionId).collection('participants').doc(decoded.uid).set(
    {
      connectionState: 'offline',
      lastSeenAt: FieldValue.serverTimestamp(),
      leftAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  logger.info('live session participant left', { sessionId, uid: decoded.uid });
  res.status(200).json({ ok: true });
}

async function handleAdaptorTerrorAlertStart(req: Request, res: FirebaseResponse) {
  const source: LiveEventSource = 'adaptor';
  await authenticateEventSource(req, source);

  const mode = resolveMode(readQueryParam(req, 'mode'));
  const sessionId = liveSessionIdForMode(mode);
  const session = await ensureCurrentSessionForActiveWindow(mode) ?? await findActiveLiveSession(mode);
  if (!session) {
    throw new HttpError(403, 'No active live window.');
  }
  assertSessionIsActive(session.data);

  const sessionRef = liveSessionRef(sessionId);
  const nextEventRef = sessionRef.collection('events').doc();
  const payload = normalizeEventPayload(null);
  const result = await firestore.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    if (!sessionSnapshot.exists) {
      throw new HttpError(404, 'Live session not found.');
    }

    const currentSession = sessionSnapshot.data() as LiveSessionDoc;
    const currentEventId = typeof currentSession.currentEventId === 'string'
      ? currentSession.currentEventId
      : null;

    if (currentEventId) {
      const currentEventRef = sessionRef.collection('events').doc(currentEventId);
      const currentEventSnapshot = await transaction.get(currentEventRef);
      const currentEvent = currentEventSnapshot.exists
        ? currentEventSnapshot.data() as { status?: string; type?: string }
        : null;

      if (currentEvent?.status === 'active' && currentEvent.type === 'terror_alert') {
        return { eventId: currentEventId, reused: true };
      }
    }

    transaction.set(nextEventRef, {
      createdAt: FieldValue.serverTimestamp(),
      createdBy: source,
      cueId: stringValue(readQueryParam(req, 'cueId')) ?? null,
      mode,
      payload,
      source,
      status: 'active',
      type: 'terror_alert',
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(sessionRef, {
      currentEventId: nextEventRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { eventId: nextEventRef.id, reused: false };
  });

  logger.info('adaptor terror alert started', {
    eventId: result.eventId,
    mode,
    reused: result.reused,
    sessionId,
  });
  if (!result.reused) {
    await sendLiveAlertPushBurstToConnectedParticipants({
      eventId: result.eventId,
      sessionId,
    });
  }
  res.status(200).json({
    eventId: result.eventId,
    ok: true,
    sessionId,
    status: 'active',
  });
}

async function handleAdaptorTerrorAlertStop(req: Request, res: FirebaseResponse) {
  const source: LiveEventSource = 'adaptor';
  await authenticateEventSource(req, source);

  const mode = resolveMode(readQueryParam(req, 'mode'));
  const sessionId = liveSessionIdForMode(mode);
  const sessionRef = liveSessionRef(sessionId);
  const eventId = await firestore.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    if (!sessionSnapshot.exists) {
      return null;
    }

    const session = sessionSnapshot.data() as LiveSessionDoc;
    const currentEventId = typeof session.currentEventId === 'string' ? session.currentEventId : null;
    if (!currentEventId) {
      return null;
    }

    const eventRef = sessionRef.collection('events').doc(currentEventId);
    const eventSnapshot = await transaction.get(eventRef);
    const event = eventSnapshot.exists
      ? eventSnapshot.data() as { status?: string; type?: string }
      : null;

    if (event && event.type !== 'terror_alert') {
      return null;
    }

    if (eventSnapshot.exists) {
      transaction.set(eventRef, {
        clearCueId: stringValue(readQueryParam(req, 'cueId')) ?? null,
        clearedAt: FieldValue.serverTimestamp(),
        clearedBy: source,
        status: 'cleared',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    transaction.set(sessionRef, {
      currentEventId: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return currentEventId;
  });

  logger.info('adaptor terror alert stopped', { eventId, mode, sessionId });
  res.status(200).json({
    eventId,
    ok: true,
    sessionId,
    status: 'cleared',
  });
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
  assertCurrentLiveSession(sessionId, mode);
  const session = await ensureCurrentSessionForActiveWindow(mode) ?? await findActiveLiveSession(mode);
  if (!session) {
    throw new HttpError(403, 'No active live window.');
  }
  assertSessionIsActive(session.data);

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
  if (type === 'terror_alert') {
    await sendLiveAlertPushBurstToConnectedParticipants({
      eventId: eventRef.id,
      sessionId,
    });
  }
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

async function sendLiveAlertPushBurstToConnectedParticipants({
  eventId,
  sessionId,
}: {
  eventId: string;
  sessionId: string;
}) {
  const participantsSnapshot = await liveSessionRef(sessionId)
    .collection('participants')
    .where('connectionState', '==', 'connected')
    .limit(LIVE_ALERT_PUSH_BATCH_SIZE)
    .get();

  const targetUids = participantsSnapshot.docs
    .map((doc) => ({ data: doc.data() as LiveParticipantDoc, uid: doc.id }))
    .map(({ data, uid }) => stringValue(data.uid) ?? uid);

  if (targetUids.length === 0) {
    logger.info('live alert push skipped: no connected participants', { eventId, sessionId });
    return;
  }

  const tokenOwners = await readLiveAlertPushTokens(targetUids);
  if (tokenOwners.length === 0) {
    logger.info('live alert push skipped: no FCM tokens', {
      eventId,
      sessionId,
      targetUserCount: targetUids.length,
    });
    return;
  }

  const invalidTokensByUid = new Map<string, string[]>();
  let successCount = 0;
  let failureCount = 0;
  for (let burstIndex = 0; burstIndex < LIVE_ALERT_PUSH_BURST_COUNT; burstIndex += 1) {
    if (burstIndex > 0) {
      await delay(LIVE_ALERT_PUSH_BURST_DELAY_MS);
    }

    for (const chunk of chunkArray(tokenOwners, LIVE_ALERT_PUSH_BATCH_SIZE)) {
      const response = await messaging.sendEachForMulticast({
        android: {
          notification: {
            channelId: LIVE_ALERT_PUSH_CHANNEL_ID,
            defaultVibrateTimings: true,
            priority: 'max',
            sound: 'default',
            visibility: 'public',
          },
          priority: 'high',
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
        data: {
          eventId,
          eventType: 'live_terror_alert',
          route: '/live/session',
          sessionId,
          type: 'live_terror_alert',
        },
        notification: {
          body: LIVE_ALERT_PUSH_BODY,
          title: LIVE_ALERT_PUSH_TITLE,
        },
        tokens: chunk.map(({ token }) => token),
      });

      successCount += response.successCount;
      failureCount += response.failureCount;
      response.responses.forEach((result, index) => {
        if (result.success || !PERMANENT_FCM_TOKEN_ERROR_CODES.has(result.error?.code ?? '')) {
          return;
        }

        const owner = chunk[index];
        const existing = invalidTokensByUid.get(owner.uid) ?? [];
        existing.push(owner.token);
        invalidTokensByUid.set(owner.uid, existing);
      });
    }
  }

  await pruneInvalidLiveAlertPushTokens(invalidTokensByUid);
  logger.info('live alert push burst sent', {
    eventId,
    failureCount,
    sessionId,
    successCount,
    targetTokenCount: tokenOwners.length,
    targetUserCount: targetUids.length,
  });
}

async function readLiveAlertPushTokens(uids: string[]) {
  const uniqueUids = [...new Set(uids)];
  const refs = uniqueUids.map((uid) => firestore.collection(V2_FCM_REGISTRATIONS_COLLECTION_PATH).doc(uid));
  const snapshots = refs.length > 0 ? await firestore.getAll(...refs) : [];
  const seenTokens = new Set<string>();
  return snapshots.flatMap((snapshot) => {
    const uid = snapshot.id;
    const tokens = snapshot.data()?.fcmTokens;
    if (!Array.isArray(tokens)) {
      return [];
    }

    return tokens.flatMap((token) => {
      if (typeof token !== 'string' || token.trim().length === 0 || seenTokens.has(token)) {
        return [];
      }
      seenTokens.add(token);
      return [{ token, uid }];
    });
  });
}

async function pruneInvalidLiveAlertPushTokens(invalidTokensByUid: Map<string, string[]>) {
  if (invalidTokensByUid.size === 0) {
    return;
  }

  await Promise.all([...invalidTokensByUid.entries()].map(([uid, tokens]) => {
    if (tokens.length === 0) {
      return Promise.resolve();
    }

    return firestore
      .collection(V2_FCM_REGISTRATIONS_COLLECTION_PATH)
      .doc(uid)
      .set({
        fcmTokens: FieldValue.arrayRemove(...tokens),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
  }));
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function liveSessionRef(sessionId: string) {
  return firestore.collection(V2_LIVE_SESSIONS_COLLECTION_PATH).doc(sessionId);
}

function liveSessionJoinTokenRef(sessionId: string) {
  return liveSessionRef(sessionId).collection('private').doc('joinToken');
}

function liveShowWindowsCollection() {
  return firestore.collection(V2_LIVE_SHOW_WINDOWS_COLLECTION_PATH);
}

function liveShowWindowRef(windowId: string) {
  return liveShowWindowsCollection().doc(windowId);
}

async function findActiveLiveSession(mode: NarrativeMode) {
  const sessionId = liveSessionIdForMode(mode);
  const snapshot = await liveSessionRef(sessionId).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as LiveSessionDoc;
  if (data.status !== 'active') {
    return null;
  }

  if (hasSessionEnded(data)) {
    await closeLiveSession(snapshot.id, 'system');
    return null;
  }

  return { id: snapshot.id, data };
}

async function ensureCurrentSessionForActiveWindow(mode: NarrativeMode) {
  const window = await findCurrentLiveShowWindow(mode);
  if (!window) {
    return null;
  }

  const sessionId = liveSessionIdForMode(mode);
  const sessionRef = liveSessionRef(sessionId);
  const joinToken = await ensureLiveSessionJoinToken(sessionId);
  await firestore.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    const currentSession = sessionSnapshot.exists ? sessionSnapshot.data() as LiveSessionDoc : null;
    const isContinuingWindowSession = Boolean(
      currentSession?.status === 'active'
      && currentSession.showWindowId === window.id
      && !hasSessionEnded(currentSession)
    );

    transaction.set(sessionRef, {
      ...(sessionSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      ...(sessionSnapshot.exists ? {
        closedAt: FieldValue.delete(),
        closedBy: FieldValue.delete(),
      } : {}),
      currentEventId: isContinuingWindowSession ? currentSession?.currentEventId ?? null : null,
      endsAt: window.data.endsAt,
      joinTokenHash: hashJoinToken(joinToken),
      mode,
      sessionSource: 'schedule',
      showWindowId: window.id,
      startsAt: window.data.startsAt,
      status: 'active',
      title: window.data.title ?? DEFAULT_SESSION_TITLE,
      updatedAt: FieldValue.serverTimestamp(),
      venueLatitude: window.data.venueLatitude ?? DEFAULT_VENUE_LATITUDE,
      venueLongitude: window.data.venueLongitude ?? DEFAULT_VENUE_LONGITUDE,
      venueName: window.data.venueName ?? DEFAULT_VENUE_NAME,
      venueRadiusMeters: window.data.venueRadiusMeters ?? DEFAULT_VENUE_RADIUS_METERS,
    }, { merge: true });
  });

  await closeOtherActiveSessions(mode, sessionId);
  const snapshot = await sessionRef.get();
  return { id: snapshot.id, data: snapshot.data() as LiveSessionDoc };
}

async function listLiveShowWindows(mode: NarrativeMode) {
  const snapshot = await liveShowWindowsCollection()
    .where('mode', '==', mode)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as LiveShowWindowDoc }))
    .sort((left, right) => compareTimestamps(right.data.startsAt, left.data.startsAt))
    .slice(0, 40);
}

async function findCurrentLiveShowWindow(mode: NarrativeMode, now = Date.now()) {
  const windows = await listScheduledLiveShowWindows(mode);
  return windows
    .filter((window) => isLiveShowWindowActive(window.data, now))
    .sort((left, right) => compareTimestamps(right.data.startsAt, left.data.startsAt))[0] ?? null;
}

async function findNextLiveShowWindow(mode: NarrativeMode, now = Date.now()) {
  const windows = await listScheduledLiveShowWindows(mode);
  return windows
    .filter((window) => {
      const startsAtMs = window.data.startsAt?.toMillis();
      return typeof startsAtMs === 'number' && startsAtMs > now;
    })
    .sort((left, right) => compareTimestamps(left.data.startsAt, right.data.startsAt))[0] ?? null;
}

async function readLiveShowWindow(windowId: string) {
  const snapshot = await liveShowWindowRef(windowId).get();
  if (!snapshot.exists) {
    return null;
  }
  return { id: snapshot.id, data: snapshot.data() as LiveShowWindowDoc };
}

async function listScheduledLiveShowWindows(mode: NarrativeMode) {
  const snapshot = await liveShowWindowsCollection()
    .where('mode', '==', mode)
    .where('status', '==', 'scheduled')
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as LiveShowWindowDoc }));
}

async function serializeLiveSessionWithOptionalStats(sessionId: string, data: LiveSessionDoc, includeStats: boolean) {
  const serialized = serializeLiveSession(sessionId, data);
  if (!includeStats) {
    return serialized;
  }

  const participantsSnapshot = await liveSessionRef(sessionId)
    .collection('participants')
    .where('connectionState', '==', 'connected')
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
    sessionSource: data.sessionSource ?? 'manual',
    sessionId,
    showWindowId: data.showWindowId ?? null,
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

function serializeLiveShowWindow(windowId: string, data: LiveShowWindowDoc) {
  return {
    cancelledAt: timestampToIso(data.cancelledAt),
    cancelledBy: data.cancelledBy ?? null,
    createdAt: timestampToIso(data.createdAt),
    createdBy: data.createdBy ?? null,
    endsAt: timestampToIso(data.endsAt),
    mode: resolveMode(data.mode),
    startsAt: timestampToIso(data.startsAt),
    status: data.status ?? 'scheduled',
    title: data.title ?? DEFAULT_SESSION_TITLE,
    updatedAt: timestampToIso(data.updatedAt),
    updatedBy: data.updatedBy ?? null,
    venueLatitude: data.venueLatitude ?? null,
    venueLongitude: data.venueLongitude ?? null,
    venueName: data.venueName ?? null,
    venueRadiusMeters: data.venueRadiusMeters ?? DEFAULT_VENUE_RADIUS_METERS,
    windowId,
  };
}

function serializeNullableLiveShowWindow(window: { id: string; data: LiveShowWindowDoc } | null) {
  return window ? serializeLiveShowWindow(window.id, window.data) : null;
}

async function readLiveSessionJoinToken(sessionId: string) {
  const snapshot = await liveSessionJoinTokenRef(sessionId).get();
  if (!snapshot.exists) {
    return null;
  }
  return stringValue((snapshot.data() as LiveJoinTokenDoc).token) ?? null;
}

async function ensureLiveSessionJoinToken(sessionId: string) {
  const tokenRef = liveSessionJoinTokenRef(sessionId);
  const token = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(tokenRef);
    const currentToken = snapshot.exists ? stringValue((snapshot.data() as LiveJoinTokenDoc).token) : undefined;
    if (currentToken) {
      transaction.set(tokenRef, {
        tokenHash: hashJoinToken(currentToken),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return currentToken;
    }

    const nextToken = createJoinToken();
    transaction.set(tokenRef, {
      createdAt: FieldValue.serverTimestamp(),
      token: nextToken,
      tokenHash: hashJoinToken(nextToken),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return nextToken;
  });
  return token;
}

async function doesJoinTokenMatch(sessionId: string, token: string) {
  const storedToken = await readLiveSessionJoinToken(sessionId);
  return Boolean(storedToken && hashJoinToken(storedToken) === hashJoinToken(token));
}

async function authenticateEventSource(req: Request, source: LiveEventSource) {
  if (source === 'adaptor') {
    const configuredToken = env().adaptorLiveTriggerToken;
    if (!configuredToken) {
      throw new HttpError(503, 'Adaptor live trigger token is not configured.');
    }

    const providedToken = readBearerToken(req)
      ?? readHeader(req, 'x-live-trigger-token')
      ?? stringValue(readQueryParam(req, 'token'));
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

function isAdaptorSignalMethod(method: string) {
  return method === 'GET' || method === 'POST';
}

function timestampValue(value: unknown, fieldName: string) {
  if (value instanceof Timestamp) {
    return value;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `Missing ${fieldName}.`);
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, `Invalid ${fieldName}.`);
  }

  return Timestamp.fromMillis(parsed);
}

function parseLiveShowWindowInput(body: Record<string, unknown>, { partial }: { partial: boolean }) {
  const mode = resolveMode(body.mode);
  const title = stringValue(body.title) ?? DEFAULT_SESSION_TITLE;
  const startsAt = timestampValue(body.startsAt, 'startsAt');
  const endsAt = timestampValue(body.endsAt, 'endsAt');
  if (startsAt.toMillis() >= endsAt.toMillis()) {
    throw new HttpError(400, 'Live show window must end after it starts.');
  }

  return {
    endsAt,
    mode,
    startsAt,
    title,
    venueLatitude: numberValue(body.venueLatitude) ?? (partial ? undefined : DEFAULT_VENUE_LATITUDE),
    venueLongitude: numberValue(body.venueLongitude) ?? (partial ? undefined : DEFAULT_VENUE_LONGITUDE),
    venueName: stringValue(body.venueName) ?? (partial ? undefined : DEFAULT_VENUE_NAME),
    venueRadiusMeters: numberValue(body.venueRadiusMeters) ?? (partial ? undefined : DEFAULT_VENUE_RADIUS_METERS),
  };
}

function isLiveShowWindowActive(data: LiveShowWindowDoc, now: number) {
  const startsAtMs = data.startsAt?.toMillis();
  const endsAtMs = data.endsAt?.toMillis();
  return data.status === 'scheduled'
    && typeof startsAtMs === 'number'
    && typeof endsAtMs === 'number'
    && startsAtMs <= now
    && endsAtMs >= now;
}

function compareTimestamps(left: Timestamp | undefined, right: Timestamp | undefined) {
  return (left?.toMillis() ?? 0) - (right?.toMillis() ?? 0);
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
    message: stringValue(source.message) ?? 'Angriff bestätigt. Es gibt mehrere Opfer. Die Angreifer konnten vorerst vertrieben werden.',
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

async function closeLiveSession(sessionId: string, closedBy: string) {
  const sessionRef = liveSessionRef(sessionId);
  const snapshot = await sessionRef.get();
  if (!snapshot.exists) {
    return;
  }

  const data = snapshot.data() as LiveSessionDoc;
  const currentEventId = typeof data.currentEventId === 'string' ? data.currentEventId : null;
  const payload = {
    closedAt: FieldValue.serverTimestamp(),
    closedBy,
    currentEventId: null,
    status: 'closed',
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (currentEventId) {
    await firestore.runTransaction(async (transaction) => {
      transaction.set(sessionRef, payload, { merge: true });
      transaction.set(liveSessionRef(sessionId).collection('events').doc(currentEventId), {
        clearedAt: FieldValue.serverTimestamp(),
        clearedBy: closedBy,
        status: 'cleared',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  } else {
    await sessionRef.set(payload, { merge: true });
  }

  await markParticipantsOffline(sessionId);
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

  await Promise.all(staleSessions.map((doc) => closeLiveSession(doc.id, 'system')));
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
