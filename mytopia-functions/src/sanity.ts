import { isValidSignature, SIGNATURE_HEADER_NAME } from '@sanity/webhook';
import { Request } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

import {
    SANITY_API_VERSION
} from './constants.js';

import { env, resolveSanityDataset } from './config.js';

import {
    HttpError,
    readHeader
} from './utils.js';
import {
    MessageDto,
    NarrativeMode
} from './types.js';

export async function verifySanitySignature(req: Request, secret: string) {
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

export async function sanityQuery<T>(query: string, params: Record<string, unknown>, mode: NarrativeMode): Promise<T> {
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

/**
 * Append Sanity CDN image transforms to optimise bandwidth.
 * Resizes images to max 800px width, 75% quality, auto-format.
 * Only touches `cdn.sanity.io` URLs; leaves others unchanged.
 */
export function applySanityImageTransformToUrl(url: string | undefined): string | undefined {
  if (!url || !url.includes('cdn.sanity.io')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}w=800&q=75&auto=format`;
}

export function applySanityImageTransforms(msg: MessageDto): MessageDto {
  const actor = {
    ...msg.actor,
    avatarUrl: applySanityImageTransformToUrl(msg.actor.avatarUrl),
  };

  let attachment = msg.attachment;
  if (attachment) {
    if (attachment._type === 'imageAttachment') {
      attachment = { ...attachment, url: applySanityImageTransformToUrl(attachment.url)! };
    } else if (attachment._type === 'missionAttachment' && attachment.imageUrl) {
      attachment = { ...attachment, imageUrl: applySanityImageTransformToUrl(attachment.imageUrl)! };
    }
  }

  return { ...msg, actor, attachment };
}

export function getRawBody(req: Request): Buffer {
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
