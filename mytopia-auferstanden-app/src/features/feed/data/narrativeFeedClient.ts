/** Lazy-loader for Firebase Auth utils */
import { env, hasConfiguredFeedApi } from '@/src/config/env';
import { getCurrentFirebaseUser } from '@/src/core/firebase/authClient';
import { type AppMode } from '@/src/core/session/appMode';
import * as authUtils from '@react-native-firebase/auth';

const { getIdToken } = authUtils;

const FEED_REQUEST_TIMEOUT_MS = 15000;

export type NarrativeAttachmentDto =
  | {
    _type: 'systemAttachment';
    kind: 'neutral' | 'prominent';
  }
  | {
    _type: 'imageAttachment';
    caption?: string;
    url: string;
  }
  | {
    _type: 'audioAttachment';
    extension?: string;
    mimeType?: string;
    originalFilename?: string;
    title?: string;
    url: string;
  }
  | {
    _type: 'videoAttachment';
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
    imageUrl?: string;
    questions?: {
      questionText: string;
      options: { text: string; isCorrect: boolean }[];
    }[];
    feedbackCorrect?: string;
    feedbackIncorrect?: string;
    gpsConfig?: {
      latitude: number;
      longitude: number;
      radiusMeters: number;
    };
  }
  | {
    _type: 'submissionAttachment';
    submissionId: string;
    status: 'sending' | 'pending' | 'approved' | 'rejected' | 'error';
    kind: 'gps' | 'quiz' | 'text' | 'photo';
    payload: any;
    missionTitle: string;
    missionId?: string;
    moderatorNote?: string;
  }
  | {
    _type: 'scorecardAttachment';
    correct: number;
    total: number;
  }
  | {
    _type: 'missionResultAttachment';
    missionId: string;
    missionTitle: string;
    kind: string;
    payload: any;
    earnedPoints?: number;
  };

export type NarrativeMessageDto = {
  actor: {
    avatarUrl?: string;
    name: string;
    nameColor?: string;
    role?: string;
  };
  attachment?: NarrativeAttachmentDto;
  messageId: string;
  text?: string;
  isUser?: boolean;
};

export type NarrativeBundleDto = {
  _id: string;
  messages: NarrativeMessageDto[];
  pushBody?: string;
  pushTitle?: string;
  releaseAt: string;
  title: string;
  isUser?: boolean;
};

export type NarrativeFeedPageDto = {
  bundles: NarrativeBundleDto[];
  nextCursor: string | null;
};

export async function fetchNarrativeFeedPage({
  cursor,
  limit = 20,
  mode = 'production',
}: {
  cursor?: string | null;
  limit?: number;
  mode?: AppMode;
} = {}): Promise<NarrativeFeedPageDto> {
  if (!hasConfiguredFeedApi()) {
    throw new Error('EXPO_PUBLIC_FEED_API_BASE_URL is not configured.');
  }

  const firebaseUser = getCurrentFirebaseUser();
  if (!firebaseUser) {
    throw new Error('No authenticated Firebase user available for feed request.');
  }

  const idToken = await getIdToken(firebaseUser);
  const requestUrl = createFeedUrl({
    baseUrl: env.feedApiBaseUrl,
    cursor,
    limit,
    mode,
  });

  debugFeedClient('request:start', {
    cursor: cursor ?? null,
    limit,
    requestUrl,
  });

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, FEED_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      method: 'GET',
      signal: abortController.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        `Feed API request timed out after ${FEED_REQUEST_TIMEOUT_MS}ms. Check EXPO_PUBLIC_FEED_API_BASE_URL, function deploy status, and network access.`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  debugFeedClient('request:response', {
    status: response.status,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Feed API request failed with ${response.status}: ${body}`);
  }

  const payload = (await response.json()) as {
    bundles?: unknown;
    nextCursor?: unknown;
  };

  const bundles = Array.isArray(payload.bundles)
    ? payload.bundles
      .map((bundle) => normalizeBundle(bundle))
      .filter((bundle): bundle is NarrativeBundleDto => bundle !== null)
    : [];

  debugFeedClient('request:parsed', {
    bundles: bundles.length,
    nextCursor:
      typeof payload.nextCursor === 'string' && payload.nextCursor.length > 0 ? 'set' : 'none',
  });

  return {
    bundles,
    nextCursor:
      typeof payload.nextCursor === 'string' && payload.nextCursor.length > 0
        ? payload.nextCursor
        : null,
  };
}

function createFeedUrl({
  baseUrl,
  cursor,
  limit,
  mode,
}: {
  baseUrl: string;
  cursor?: string | null;
  limit: number;
  mode: AppMode;
}) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL('feed', normalizedBase);

  url.searchParams.set('limit', String(clampLimit(limit)));
  if (mode === 'dev') {
    url.searchParams.set('mode', 'dev');
  }

  if (cursor && cursor.length > 0) {
    url.searchParams.set('cursor', cursor);
  }

  return url.toString();
}

function clampLimit(value: number) {
  if (!Number.isFinite(value)) {
    return 20;
  }

  return Math.max(1, Math.min(50, Math.round(value)));
}

function normalizeBundle(value: unknown): NarrativeBundleDto | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;

  const id = asNonEmptyString(raw._id);
  const releaseAt = asNonEmptyString(raw.releaseAt);
  const title = asNonEmptyString(raw.title) ?? 'Notfallkanal';

  if (!id || !releaseAt) {
    return null;
  }

  const rawMessages = Array.isArray(raw.messages) ? raw.messages : [];

  return {
    _id: id,
    messages: rawMessages
      .map((message) => normalizeMessage(message))
      .filter((message): message is NarrativeMessageDto => message !== null),
    ...(typeof raw.pushBody === 'string' ? { pushBody: raw.pushBody } : {}),
    ...(typeof raw.pushTitle === 'string' ? { pushTitle: raw.pushTitle } : {}),
    releaseAt,
    title,
    isUser: typeof raw.isUser === 'boolean' ? raw.isUser : false,
  };
}

function normalizeMessage(value: unknown): NarrativeMessageDto | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const messageId = asNonEmptyString(raw.messageId);
  const actor = normalizeActor(raw.actor);
  const text = typeof raw.text === 'string' && raw.text.trim().length > 0 ? raw.text : undefined;
  const attachment = normalizeAttachment(raw.attachment);
  const isUser = typeof raw.isUser === 'boolean' ? raw.isUser : false;

  if (!messageId || !actor || (!text && !attachment)) {
    return null;
  }

  return {
    actor,
    ...(attachment ? { attachment } : {}),
    messageId,
    ...(text ? { text } : {}),
    isUser,
  };
}

function normalizeActor(value: unknown): NarrativeMessageDto['actor'] | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const name = asNonEmptyString(raw.name);

  if (!name) {
    return null;
  }

  return {
    ...(typeof raw.avatarUrl === 'string' && raw.avatarUrl.length > 0
      ? { avatarUrl: raw.avatarUrl }
      : {}),
    name,
    ...(typeof raw.nameColor === 'string' && raw.nameColor.length > 0
      ? { nameColor: raw.nameColor }
      : {}),
    ...(typeof raw.role === 'string' && raw.role.length > 0 ? { role: raw.role } : {}),
  };
}

function normalizeAttachment(value: unknown): NarrativeAttachmentDto | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Record<string, unknown>;

  if (raw._type === 'systemAttachment') {
    return {
      _type: 'systemAttachment',
      kind: raw.kind === 'prominent' ? 'prominent' : 'neutral',
    };
  }

  if (raw._type === 'imageAttachment') {
    const url = asNonEmptyString(raw.url);
    if (!url) {
      return undefined;
    }

    return {
      _type: 'imageAttachment',
      ...(typeof raw.caption === 'string' && raw.caption.length > 0
        ? { caption: raw.caption }
        : {}),
      url,
    };
  }

  if (raw._type === 'audioAttachment' || raw._type === 'videoAttachment') {
    const url = asNonEmptyString(raw.url);
    if (!url) {
      return undefined;
    }

    return {
      _type: raw._type,
      ...(typeof raw.extension === 'string' && raw.extension.length > 0
        ? { extension: raw.extension }
        : {}),
      ...(typeof raw.mimeType === 'string' && raw.mimeType.length > 0
        ? { mimeType: raw.mimeType }
        : {}),
      ...(typeof raw.originalFilename === 'string' && raw.originalFilename.length > 0
        ? { originalFilename: raw.originalFilename }
        : {}),
      ...(typeof raw.title === 'string' && raw.title.length > 0 ? { title: raw.title } : {}),
      url,
    };
  }

  if (raw._type === 'missionAttachment') {
    const missionId = asNonEmptyString(raw.missionId);
    if (!missionId) {
      return undefined;
    }

    return {
      _type: 'missionAttachment',
      ...(typeof raw.excerpt === 'string' && raw.excerpt.length > 0
        ? { excerpt: raw.excerpt }
        : {}),
      missionId,
      ...(typeof raw.missionKind === 'string' ? { missionKind: raw.missionKind } : {}),
      ...(typeof raw.missionPoints === 'number' ? { missionPoints: raw.missionPoints } : {}),
      ...(typeof raw.missionTitle === 'string' ? { missionTitle: raw.missionTitle } : {}),
      ...(typeof raw.title === 'string' && raw.title.length > 0 ? { title: raw.title } : {}),
      ...(typeof raw.imageUrl === 'string' && raw.imageUrl.length > 0 ? { imageUrl: raw.imageUrl } : {}),
      ...(Array.isArray(raw.questions) ? { questions: raw.questions } : {}),
      ...(raw.gpsConfig && typeof raw.gpsConfig === 'object' ? { gpsConfig: raw.gpsConfig as any } : {}),
    };
  }

  if (raw._type === 'submissionAttachment') {
    const submissionId = asNonEmptyString(raw.submissionId);
    if (!submissionId) {
      return undefined;
    }

    return {
      _type: 'submissionAttachment',
      submissionId,
      status: raw.status as any,
      kind: raw.kind as any,
      payload: raw.payload,
      missionTitle: asNonEmptyString(raw.missionTitle) ?? '',
      missionId: asNonEmptyString(raw.missionId) ?? undefined,
      moderatorNote: asNonEmptyString(raw.moderatorNote) ?? undefined,
    };
  }

  if (raw._type === 'scorecardAttachment') {
    return {
      _type: 'scorecardAttachment',
      correct: typeof raw.correct === 'number' ? raw.correct : 0,
      total: typeof raw.total === 'number' ? raw.total : 0,
    };
  }

  if (raw._type === 'missionResultAttachment') {
    return {
      _type: 'missionResultAttachment',
      missionId: asNonEmptyString(raw.missionId) ?? '',
      missionTitle: asNonEmptyString(raw.missionTitle) ?? '',
      kind: asNonEmptyString(raw.kind) ?? '',
      payload: raw.payload,
      earnedPoints: typeof raw.earnedPoints === 'number' ? raw.earnedPoints : undefined,
    };
  }

  return undefined;
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isAbortError(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

function debugFeedClient(message: string, payload: Record<string, unknown>) {
  // Debug logging disabled
}
