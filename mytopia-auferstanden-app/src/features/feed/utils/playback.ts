import {
  type NarrativeBundleDto,
  type NarrativeMessageDto,
} from '@/src/features/feed/data/narrativeFeedClient';

export type PlaybackMessage = {
  bundleId: string;
  bundleTitle: string;
  key: string;
  message: NarrativeMessageDto;
  revealAtMs: number;
};

const TEXT_DELAY_FACTOR_MS = 45;
const TEXT_DELAY_MIN_MS = 1500;
const TEXT_DELAY_MAX_MS = 12000;
const ATTACHMENT_ONLY_DELAY_MS = 3500;

/**
 * Builds a list of flat PlaybackMessage items from a nested NarrativeBundleDto array,
 * scheduling each message based on its delay factors.
 */
export function buildPlaybackMessages(bundles: NarrativeBundleDto[]): PlaybackMessage[] {
  const sorted = [...bundles].sort((a, b) => getBundleReleaseMs(a) - getBundleReleaseMs(b));
  const items: PlaybackMessage[] = [];
  for (const bundle of sorted) {
    let cursorMs = getBundleReleaseMs(bundle);
    for (const msg of bundle.messages) {
      cursorMs += resolveMessageDelayMs(msg);
      items.push({
        bundleId: bundle._id,
        bundleTitle: bundle.title,
        key: `${bundle._id}:${msg.messageId}`,
        message: msg,
        revealAtMs: cursorMs,
      });
    }
  }
  return items;
}

/**
 * Resolves the delay for a single narrative message based on its text length
 * or presence of an attachment.
 */
export function resolveMessageDelayMs(message: NarrativeMessageDto) {
  const textLength = message.text?.trim().length ?? 0;
  if (textLength > 0) {
    return Math.max(
      TEXT_DELAY_MIN_MS,
      Math.min(TEXT_DELAY_MAX_MS, textLength * TEXT_DELAY_FACTOR_MS),
    );
  }

  return message.attachment ? ATTACHMENT_ONLY_DELAY_MS : TEXT_DELAY_MIN_MS;
}

/**
 * Parses a bundle's release timestamp or defaults to now if invalid.
 */
export function getBundleReleaseMs(bundle: NarrativeBundleDto) {
  const parsed = Date.parse(bundle.releaseAt);
  return Number.isFinite(parsed) ? parsed : Date.now();
}
