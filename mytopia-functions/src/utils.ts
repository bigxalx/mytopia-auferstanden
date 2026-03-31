import { Timestamp } from 'firebase-admin/firestore';
import { type Request } from 'firebase-functions/v2/https';
import {
    BundleDto,
    FeedCursor,
    FirebaseResponse
} from './types.js';

export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function sendError(res: FirebaseResponse, error: unknown) {
  if (isHttpError(error)) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: formatError(error) });
}

export function readQueryParam(req: Request, key: string): string | null {
  const value = req.query[key];
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null;
  }

  return typeof value === 'string' ? value : null;
}

export function normalizeRequestPath(pathValue: string | undefined) {
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

export function clampLimit(input: unknown) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return 20;
  }

  return Math.max(1, Math.min(50, Math.round(parsed)));
}

export function parseCursor(cursorValue: unknown): FeedCursor | null {
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

export function readHeader(req: Request, key: string): string | null {
  const value = req.headers[key];
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null;
  }

  return typeof value === 'string' ? value : null;
}

export function toTimestamp(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return Timestamp.fromMillis(parsed);
}

export function createNextCursor(bundle: BundleDto): string | null {
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
