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
import { firestore, messaging, oidcClient, tasksClient } from './firebase.js';
import { FirebaseResponse, NarrativeMode } from './types.js';
import { formatError, HttpError, readHeader, readQueryParam, sendError } from './utils.js';

type LiveSessionStatus = 'draft' | 'active' | 'paused' | 'closed';
type LiveEventSource = 'admin' | 'adaptor';
type LiveEventType = 'terror_alert';
type LiveShowWindowStatus = 'scheduled' | 'cancelled';
type LiveSessionSource = 'schedule' | 'manual';

type LiveSessionDoc = {
  activeRunId?: string | null;
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
  joinedAt?: Timestamp;
  lastSeenAt?: Timestamp;
  leftAt?: Timestamp;
  runId?: string;
  uid?: string;
};

const DEFAULT_SESSION_TITLE = 'Mytopia Live';
const DEBUG_SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
const DEFAULT_VENUE_LATITUDE = 50.9871377;
const DEFAULT_VENUE_LONGITUDE = 12.4374725;
const DEFAULT_VENUE_NAME = 'Theater Altenburg Gera';
const DEFAULT_VENUE_RADIUS_METERS = 50;
const LIVE_ALERT_PUSH_BURST_COUNT = 4;
const LIVE_ALERT_PUSH_BURST_DELAY_MS = 350;
const LIVE_ALERT_PUSH_TITLE = 'Dringende Live-Meldung';
const LIVE_ALERT_PUSH_BODY = 'Öffne Mytopia für weitere Informationen.';
const LIVE_ALERT_PUSH_CHANNEL_ID = 'live-terror-alert';
const LIVE_ALERT_PUSH_BATCH_SIZE = 500;
const LIVE_BOUNDARY_TASK_DELAY_MS = 5_000;
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

    if (path === '/live/internal/window-boundary' && req.method === 'POST') {
      await handleLiveWindowBoundaryTask(req, res);
      return;
    }

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

async function handleLiveWindowBoundaryTask(req: Request, res: FirebaseResponse) {
  await verifyLiveCloudTaskInvocation(req);
  const body = objectBody(req);
  const action = stringValue(body.action);
  const expectedAtMs = numberValue(body.expectedAtMs);

  if (action === 'start-window') {
    const windowId = requiredString(body.windowId, 'windowId');
    const window = await readLiveShowWindow(windowId);
    if (!window || window.data.status !== 'scheduled') {
      res.status(200).json({ action: 'window_unavailable', ok: true, windowId });
      return;
    }

    if (window.data.startsAt?.toMillis() !== expectedAtMs) {
      res.status(200).json({ action: 'stale_task', ok: true, windowId });
      return;
    }

    if (!isLiveShowWindowActive(window.data, Date.now())) {
      res.status(200).json({ action: 'window_not_active', ok: true, windowId });
      return;
    }

    const mode = resolveMode(window.data.mode);
    const session = await ensureCurrentSessionForActiveWindow(mode);
    res.status(200).json({
      action: session?.data.showWindowId === windowId ? 'session_started' : 'superseded',
      ok: true,
      sessionId: session?.id ?? null,
      windowId,
    });
    return;
  }

  if (action === 'close-run') {
    const sessionId = requiredString(body.sessionId, 'sessionId');
    const runId = requiredString(body.runId, 'runId');
    const snapshot = await liveSessionRef(sessionId).get();
    if (!snapshot.exists) {
      res.status(200).json({ action: 'session_missing', ok: true, runId, sessionId });
      return;
    }

    const session = snapshot.data() as LiveSessionDoc;
    if (
      session.status !== 'active'
      || session.activeRunId !== runId
      || session.endsAt?.toMillis() !== expectedAtMs
    ) {
      res.status(200).json({ action: 'stale_task', ok: true, runId, sessionId });
      return;
    }

    if (typeof expectedAtMs === 'number' && Date.now() + 1_000 < expectedAtMs) {
      throw new HttpError(409, 'Live run close task arrived before the configured end time.');
    }

    const didClose = await closeLiveSession(sessionId, 'system', runId);
    res.status(200).json({
      action: didClose ? 'session_closed' : 'stale_task',
      ok: true,
      runId,
      sessionId,
    });
    return;
  }

  throw new HttpError(400, 'Unsupported live boundary task action.');
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
  await scheduleLiveShowWindowTasks(ref.id, snapshot.data() as LiveShowWindowDoc);
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
  const updated = updatedSnapshot.data() as LiveShowWindowDoc;
  await replaceLiveShowWindowTasks(windowId, current, updated);
  await synchronizeCurrentSession(mode);
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

  await deleteLiveShowWindowTasks(windowId, data);

  const session = await findActiveLiveSession(mode);
  if (session?.data.showWindowId === windowId) {
    await closeLiveSession(session.id, decoded.uid, windowId);
  }
  await ensureCurrentSessionForActiveWindow(mode);

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
  let activeRunId = '';
  let previousRunId: string | null = null;
  let runEndsAt = Timestamp.fromMillis(now + DEBUG_SESSION_DURATION_MS);

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
    activeRunId = isContinuingActiveSession && currentSession?.activeRunId
      ? currentSession.activeRunId
      : `manual-${crypto.randomUUID()}`;
    previousRunId = stringValue(currentSession?.activeRunId) ?? null;
    runEndsAt = endsAt;

    if (!isContinuingActiveSession && currentSession?.currentEventId) {
      transaction.set(sessionRef.collection('events').doc(currentSession.currentEventId), {
        clearedAt: FieldValue.serverTimestamp(),
        clearedBy: decoded.uid,
        status: 'cleared',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const payload: Record<string, unknown> = {
      ...(sessionSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      ...(sessionSnapshot.exists ? {
        closedAt: FieldValue.delete(),
        closedBy: FieldValue.delete(),
      } : {}),
      currentEventId: isContinuingActiveSession ? currentSession?.currentEventId ?? null : null,
      activeRunId,
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

  if (previousRunId && previousRunId !== activeRunId) {
    await markParticipantsOffline(sessionId, previousRunId);
  }
  await closeOtherActiveSessions(mode, sessionId);
  await scheduleLiveRunCloseTask({
    endsAt: runEndsAt,
    runId: activeRunId,
    sessionId,
  });

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

  let joinMethod: 'qr' | 'auto-local-gps-time' | 'auto-time-only';
  let session = await ensureCurrentSessionForActiveWindow(mode) ?? await findActiveLiveSession(mode);
  if (token && await doesJoinTokenMatch(sessionId, token)) {
    joinMethod = 'qr';
  } else if (requestedJoinMethod === 'auto-local-gps-time') {
    joinMethod = 'auto-local-gps-time';
    session = await ensureCurrentSessionForActiveWindow(mode);
  } else if (requestedJoinMethod === 'auto-time-only') {
    joinMethod = 'auto-time-only';
    session = await ensureCurrentSessionForActiveWindow(mode);
  } else {
    throw new HttpError(403, 'Invalid live session join credentials.');
  }

  if (!session) {
    throw new HttpError(403, 'No active live window.');
  }

  const data = session.data;
  assertSessionCanAcceptJoin(data);
  const runId = requiredString(data.activeRunId, 'activeRunId');

  const sessionRef = liveSessionRef(sessionId);
  const participantRef = liveSessionRef(sessionId).collection('participants').doc(decoded.uid);
  await firestore.runTransaction(async (transaction) => {
    const [currentSessionSnapshot, participantSnapshot] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(participantRef),
    ]);
    if (!currentSessionSnapshot.exists) {
      throw new HttpError(404, 'Live session not found.');
    }
    const currentSession = currentSessionSnapshot.data() as LiveSessionDoc;
    assertSessionCanAcceptJoin(currentSession);
    if (currentSession.activeRunId !== runId) {
      throw new HttpError(409, 'Live session run changed before the join completed.');
    }

    const participant = participantSnapshot.exists
      ? participantSnapshot.data() as LiveParticipantDoc
      : null;
    const isContinuingMembership = participant?.runId === runId
      && participant.connectionState === 'connected';
    transaction.set(participantRef, {
      connectionState: 'connected',
      joinedAt: isContinuingMembership
        ? participant?.joinedAt ?? FieldValue.serverTimestamp()
        : FieldValue.serverTimestamp(),
      joinMethod,
      lastSeenAt: FieldValue.serverTimestamp(),
      leftAt: FieldValue.delete(),
      runId,
      uid: decoded.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  logger.info('live session joined', { joinMethod, mode, runId, sessionId, uid: decoded.uid });
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
  const runId = requiredString(body.runId, 'runId');
  const sessionSnapshot = await liveSessionRef(sessionId).get();
  if (!sessionSnapshot.exists) {
    logger.info('live session participant leave skipped: session missing', { sessionId, uid: decoded.uid });
    res.status(200).json({ ok: true });
    return;
  }

  const data = sessionSnapshot.data() as LiveSessionDoc;
  assertCanUseMode(decoded, resolveMode(data.mode));

  const participantRef = liveSessionRef(sessionId).collection('participants').doc(decoded.uid);
  const didLeave = await firestore.runTransaction(async (transaction) => {
    const participantSnapshot = await transaction.get(participantRef);
    if (!participantSnapshot.exists) {
      return false;
    }
    const participant = participantSnapshot.data() as LiveParticipantDoc;
    if (participant.runId !== runId) {
      return false;
    }
    transaction.set(participantRef, {
      connectionState: 'offline',
      lastSeenAt: FieldValue.serverTimestamp(),
      leftAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });

  logger.info('live session participant leave processed', { didLeave, runId, sessionId, uid: decoded.uid });
  res.status(200).json({ didLeave, ok: true });
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
  const runId = requiredString(session.data.activeRunId, 'activeRunId');

  const sessionRef = liveSessionRef(sessionId);
  const nextEventRef = sessionRef.collection('events').doc();
  const payload = normalizeEventPayload(null);
  const result = await firestore.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    if (!sessionSnapshot.exists) {
      throw new HttpError(404, 'Live session not found.');
    }

    const currentSession = sessionSnapshot.data() as LiveSessionDoc;
    assertSessionIsActive(currentSession);
    if (currentSession.activeRunId !== runId) {
      throw new HttpError(409, 'Live session run changed before the event could be started.');
    }
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
      runId,
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
      runId,
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
  const runId = requiredString(session.data.activeRunId, 'activeRunId');

  const eventRef = liveSessionRef(sessionId).collection('events').doc();
  const payload = normalizeEventPayload(body.payload);
  const sessionRef = liveSessionRef(sessionId);
  await firestore.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    if (!sessionSnapshot.exists) {
      throw new HttpError(404, 'Live session not found.');
    }
    const currentSession = sessionSnapshot.data() as LiveSessionDoc;
    assertSessionIsActive(currentSession);
    if (currentSession.activeRunId !== runId) {
      throw new HttpError(409, 'Live session run changed before the event could be started.');
    }

    transaction.set(eventRef, {
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid ?? source,
      cueId: stringValue(body.cueId) ?? null,
      mode,
      payload,
      runId,
      source,
      status: 'active',
      type,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(sessionRef, {
      currentEventId: eventRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  logger.info('live event triggered', { eventId: eventRef.id, sessionId, source, type });
  if (type === 'terror_alert') {
    await sendLiveAlertPushBurstToConnectedParticipants({
      eventId: eventRef.id,
      runId,
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
  runId,
  sessionId,
}: {
  eventId: string;
  runId: string;
  sessionId: string;
}) {
  const participantsSnapshot = await liveSessionRef(sessionId)
    .collection('participants')
    .where('connectionState', '==', 'connected')
    .where('runId', '==', runId)
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
  const failureCodeCounts = new Map<string, number>();
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
        const errorCode = result.error?.code;
        if (errorCode) {
          failureCodeCounts.set(errorCode, (failureCodeCounts.get(errorCode) ?? 0) + 1);
        }

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
    failureCodes: sortedCountRecord(failureCodeCounts),
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

function sortedCountRecord(counts: Map<string, number>) {
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scheduleLiveShowWindowTasks(windowId: string, data: LiveShowWindowDoc) {
  if (data.status !== 'scheduled' || !data.startsAt || !data.endsAt) {
    return;
  }

  const sessionId = liveSessionIdForMode(resolveMode(data.mode));
  await Promise.all([
    upsertLiveBoundaryTask({
      body: {
        action: 'start-window',
        expectedAtMs: data.startsAt.toMillis(),
        windowId,
      },
      name: liveWindowStartTaskName(windowId, data.startsAt.toMillis()),
      scheduleAt: data.startsAt,
    }),
    upsertLiveBoundaryTask({
      body: {
        action: 'close-run',
        expectedAtMs: data.endsAt.toMillis(),
        runId: windowId,
        sessionId,
      },
      name: liveRunCloseTaskName(sessionId, windowId, data.endsAt.toMillis()),
      scheduleAt: data.endsAt,
    }),
  ]);
}

async function replaceLiveShowWindowTasks(
  windowId: string,
  previous: LiveShowWindowDoc,
  next: LiveShowWindowDoc
) {
  await deleteLiveShowWindowTasks(windowId, previous);
  await scheduleLiveShowWindowTasks(windowId, next);
}

async function deleteLiveShowWindowTasks(windowId: string, data: LiveShowWindowDoc) {
  const sessionId = liveSessionIdForMode(resolveMode(data.mode));
  const names = [
    data.startsAt ? liveWindowStartTaskName(windowId, data.startsAt.toMillis()) : null,
    data.endsAt ? liveRunCloseTaskName(sessionId, windowId, data.endsAt.toMillis()) : null,
  ].filter((value): value is string => Boolean(value));
  await Promise.all(names.map(deleteLiveTaskIfExists));
}

async function scheduleLiveRunCloseTask({
  endsAt,
  runId,
  sessionId,
}: {
  endsAt: Timestamp;
  runId: string;
  sessionId: string;
}) {
  await upsertLiveBoundaryTask({
    body: {
      action: 'close-run',
      expectedAtMs: endsAt.toMillis(),
      runId,
      sessionId,
    },
    name: liveRunCloseTaskName(sessionId, runId, endsAt.toMillis()),
    scheduleAt: endsAt,
  });
}

async function upsertLiveBoundaryTask({
  body,
  name,
  scheduleAt,
}: {
  body: Record<string, unknown>;
  name: string;
  scheduleAt: Timestamp;
}) {
  const scheduleMs = Math.max(scheduleAt.toMillis(), Date.now() + LIVE_BOUNDARY_TASK_DELAY_MS);
  await deleteLiveTaskIfExists(name);
  await tasksClient.createTask({
    parent: tasksClient.queuePath(env().projectId, env().cloudTasksLocation, env().cloudTasksQueue),
    task: {
      httpRequest: {
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
        headers: {
          'Content-Type': 'application/json',
        },
        httpMethod: 'POST',
        oidcToken: {
          audience: env().releaseFunctionUrl,
          serviceAccountEmail: env().tasksServiceAccountEmail,
        },
        url: liveBoundaryTaskUrl(),
      },
      name,
      scheduleTime: {
        seconds: Math.ceil(scheduleMs / 1000),
      },
    },
  });
  logger.info('live boundary task upserted', {
    action: body.action,
    name,
    scheduleAt: new Date(scheduleMs).toISOString(),
  });
}

function liveBoundaryTaskUrl() {
  const url = new URL(env().releaseFunctionUrl);
  url.pathname = url.pathname.replace(/\/internal\/release-bundle\/?$/, '/live/internal/window-boundary');
  return url.toString();
}

function liveWindowStartTaskName(windowId: string, startsAtMs: number) {
  return liveTaskName(`live-start-${windowId}-${startsAtMs}`);
}

function liveRunCloseTaskName(sessionId: string, runId: string, endsAtMs: number) {
  return liveTaskName(`live-close-${sessionId}-${runId}-${endsAtMs}`);
}

function liveTaskName(taskId: string) {
  return tasksClient.taskPath(
    env().projectId,
    env().cloudTasksLocation,
    env().cloudTasksQueue,
    taskId.replace(/[^a-zA-Z0-9_-]/g, '-')
  );
}

async function deleteLiveTaskIfExists(name: string) {
  try {
    await tasksClient.deleteTask({ name });
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

async function verifyLiveCloudTaskInvocation(req: Request) {
  const queueNameHeader = req.headers['x-cloudtasks-queuename'];
  const queueName = Array.isArray(queueNameHeader) ? queueNameHeader[0] : queueNameHeader;
  if (!queueName || queueName !== env().cloudTasksQueue) {
    throw new HttpError(401, 'Invalid Cloud Tasks queue header.');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing Cloud Tasks OIDC token.');
  }

  let payload: unknown;
  try {
    const ticket = await oidcClient.verifyIdToken({
      audience: env().releaseFunctionUrl,
      idToken: authHeader.slice('Bearer '.length),
    });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'Failed to verify Cloud Tasks OIDC token.');
  }

  const email = payload && typeof payload === 'object'
    ? stringValue((payload as { email?: unknown }).email)
    : undefined;
  if (email !== env().tasksServiceAccountEmail) {
    throw new HttpError(401, 'Unexpected service account for Cloud Tasks invocation.');
  }
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
    await closeLiveSession(snapshot.id, 'system', stringValue(data.activeRunId));
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
  const currentSnapshot = await sessionRef.get();
  const currentSession = currentSnapshot.exists
    ? currentSnapshot.data() as LiveSessionDoc
    : null;
  if (currentSession && doesSessionMatchWindow(currentSession, window.id, window.data)) {
    return { id: sessionId, data: currentSession };
  }

  const joinToken = await ensureLiveSessionJoinToken(sessionId);
  let previousRunId: string | null = null;
  await firestore.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    const transactionSession = sessionSnapshot.exists
      ? sessionSnapshot.data() as LiveSessionDoc
      : null;
    if (transactionSession && doesSessionMatchWindow(transactionSession, window.id, window.data)) {
      return;
    }
    previousRunId = stringValue(transactionSession?.activeRunId) ?? null;
    const currentEventId = stringValue(transactionSession?.currentEventId);

    if (currentEventId && previousRunId !== window.id) {
      transaction.set(sessionRef.collection('events').doc(currentEventId), {
        clearedAt: FieldValue.serverTimestamp(),
        clearedBy: 'system',
        status: 'cleared',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    transaction.set(sessionRef, {
      ...(sessionSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      ...(sessionSnapshot.exists ? {
        closedAt: FieldValue.delete(),
        closedBy: FieldValue.delete(),
      } : {}),
      activeRunId: window.id,
      currentEventId: previousRunId === window.id ? transactionSession?.currentEventId ?? null : null,
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

  if (previousRunId && previousRunId !== window.id) {
    await markParticipantsOffline(sessionId, previousRunId);
  }
  await closeOtherActiveSessions(mode, sessionId);
  const snapshot = await sessionRef.get();
  return { id: snapshot.id, data: snapshot.data() as LiveSessionDoc };
}

async function synchronizeCurrentSession(mode: NarrativeMode) {
  const activeSession = await ensureCurrentSessionForActiveWindow(mode);
  if (activeSession) {
    return activeSession;
  }

  const sessionId = liveSessionIdForMode(mode);
  const snapshot = await liveSessionRef(sessionId).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as LiveSessionDoc;
  if (data.status === 'active' && data.sessionSource === 'schedule') {
    await closeLiveSession(sessionId, 'system', stringValue(data.activeRunId));
    return null;
  }

  return data.status === 'active' && !hasSessionEnded(data)
    ? { id: sessionId, data }
    : null;
}

function doesSessionMatchWindow(data: LiveSessionDoc, windowId: string, window: LiveShowWindowDoc) {
  return data.status === 'active'
    && data.sessionSource === 'schedule'
    && data.showWindowId === windowId
    && data.activeRunId === windowId
    && sameTimestamp(data.startsAt, window.startsAt)
    && sameTimestamp(data.endsAt, window.endsAt)
    && data.title === (window.title ?? DEFAULT_SESSION_TITLE)
    && data.venueLatitude === (window.venueLatitude ?? DEFAULT_VENUE_LATITUDE)
    && data.venueLongitude === (window.venueLongitude ?? DEFAULT_VENUE_LONGITUDE)
    && data.venueName === (window.venueName ?? DEFAULT_VENUE_NAME)
    && data.venueRadiusMeters === (window.venueRadiusMeters ?? DEFAULT_VENUE_RADIUS_METERS);
}

function sameTimestamp(left: Timestamp | undefined, right: Timestamp | undefined) {
  return left?.toMillis() === right?.toMillis();
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

  const runId = stringValue(data.activeRunId);
  const participantsSnapshot = runId
    ? await liveSessionRef(sessionId)
      .collection('participants')
      .where('connectionState', '==', 'connected')
      .where('runId', '==', runId)
      .get()
    : null;
  return {
    ...serialized,
    recentParticipantCount: participantsSnapshot?.size ?? 0,
  };
}

function serializeLiveSession(sessionId: string, data: LiveSessionDoc) {
  return {
    activeRunId: data.activeRunId ?? null,
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
  const existing = await tokenRef.get();
  const existingToken = existing.exists
    ? stringValue((existing.data() as LiveJoinTokenDoc).token)
    : undefined;
  if (existingToken) {
    return existingToken;
  }

  const token = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(tokenRef);
    const currentToken = snapshot.exists ? stringValue((snapshot.data() as LiveJoinTokenDoc).token) : undefined;
    if (currentToken) {
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

async function closeLiveSession(sessionId: string, closedBy: string, expectedRunId?: string) {
  const sessionRef = liveSessionRef(sessionId);
  const result = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sessionRef);
    if (!snapshot.exists) {
      return { activeRunId: null, closed: false };
    }

    const data = snapshot.data() as LiveSessionDoc;
    const activeRunId = stringValue(data.activeRunId) ?? null;
    if (expectedRunId && activeRunId !== expectedRunId) {
      return { activeRunId, closed: false };
    }

    const currentEventId = stringValue(data.currentEventId);
    transaction.set(sessionRef, {
      activeRunId: null,
      closedAt: FieldValue.serverTimestamp(),
      closedBy,
      currentEventId: null,
      status: 'closed',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (currentEventId) {
      transaction.set(sessionRef.collection('events').doc(currentEventId), {
        clearedAt: FieldValue.serverTimestamp(),
        clearedBy: closedBy,
        status: 'cleared',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return { activeRunId, closed: true };
  });

  if (result.closed && result.activeRunId) {
    await markParticipantsOffline(sessionId, result.activeRunId);
  }
  return result.closed;
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

  await Promise.all(staleSessions.map((doc) => {
    const data = doc.data() as LiveSessionDoc;
    return closeLiveSession(doc.id, 'system', stringValue(data.activeRunId));
  }));
}

async function markParticipantsOffline(sessionId: string, runId: string) {
  const snapshot = await liveSessionRef(sessionId)
    .collection('participants')
    .where('connectionState', '==', 'connected')
    .where('runId', '==', runId)
    .get();

  if (snapshot.empty) {
    return;
  }

  for (const docs of chunkArray(snapshot.docs, 450)) {
    const batch = firestore.batch();
    for (const doc of docs) {
      batch.set(doc.ref, {
        connectionState: 'offline',
        lastSeenAt: FieldValue.serverTimestamp(),
        leftAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }
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
