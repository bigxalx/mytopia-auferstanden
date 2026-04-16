import { type NarrativeBundleDto } from '@/src/features/feed/data/narrativeFeedClient';

type HubThreadSnapshot = {
  bundles: NarrativeBundleDto[];
  cacheKey: string;
  nextCursor: string | null;
};

let hubThreadSnapshot: HubThreadSnapshot | null = null;

export function getHubThreadSnapshot() {
  return hubThreadSnapshot;
}

export function setHubThreadSnapshot(snapshot: HubThreadSnapshot | null) {
  hubThreadSnapshot = snapshot;
}

export function clearHubThreadSnapshot() {
  hubThreadSnapshot = null;
}
