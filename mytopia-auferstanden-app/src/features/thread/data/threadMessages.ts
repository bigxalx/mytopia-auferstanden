import { type NarrativeBundleDto } from '@/src/features/feed/data/narrativeFeedClient';
import { type PlaybackMessage } from '@/src/features/feed/utils/playback';

export type ThreadTypingState = {
  actor: PlaybackMessage['message']['actor'];
  upcomingKey: string;
};

export function flattenBundlesToMessages(bundles: NarrativeBundleDto[]): PlaybackMessage[] {
  const sortedBundles = [...bundles].sort((a, b) => Date.parse(a.releaseAt) - Date.parse(b.releaseAt));
  const items: PlaybackMessage[] = [];

  for (const bundle of sortedBundles) {
    const bundleReleaseMs = parseTimestamp(bundle.releaseAt);
    for (const message of bundle.messages) {
      items.push({
        bundleId: bundle._id,
        bundleTitle: bundle.title,
        key: `${bundle._id}:${message.messageId}`,
        message: { ...message, isUser: bundle.isUser ?? message.isUser },
        revealAtMs: bundleReleaseMs,
      });
    }
  }

  return items;
}

export function mergeBundles(current: NarrativeBundleDto[], incoming: NarrativeBundleDto[]) {
  const map = new Map<string, NarrativeBundleDto>();
  for (const bundle of current) {
    map.set(bundle._id, bundle);
  }
  for (const bundle of incoming) {
    map.set(bundle._id, bundle);
  }
  return Array.from(map.values()).sort((a, b) => Date.parse(a.releaseAt) - Date.parse(b.releaseAt));
}

export function reconcileLatestBundles(current: NarrativeBundleDto[], incoming: NarrativeBundleDto[]) {
  if (current.length === 0) {
    return incoming;
  }
  if (incoming.length === 0) {
    return [];
  }

  const oldestIncomingReleaseMs = incoming.reduce((oldest, bundle) => {
    const releaseMs = Date.parse(bundle.releaseAt);
    return Number.isFinite(releaseMs) ? Math.min(oldest, releaseMs) : oldest;
  }, Number.POSITIVE_INFINITY);

  const incomingIds = new Set(incoming.map((bundle) => bundle._id));
  const preservedOlderBundles = current.filter((bundle) => {
    if (incomingIds.has(bundle._id)) {
      return false;
    }
    const releaseMs = Date.parse(bundle.releaseAt);
    if (!Number.isFinite(releaseMs)) {
      return false;
    }
    return releaseMs < oldestIncomingReleaseMs;
  });

  return [...preservedOlderBundles, ...incoming].sort(
    (a, b) => Date.parse(a.releaseAt) - Date.parse(b.releaseAt)
  );
}

function parseTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}
