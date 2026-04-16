import { type NarrativeBundleDto } from '@/src/features/feed/data/narrativeFeedClient';

const actorThreadSnapshots = new Map<string, NarrativeBundleDto[]>();

export function getActorThreadSnapshot(key: string) {
  return actorThreadSnapshots.get(key);
}

export function setActorThreadSnapshot(key: string, bundles: NarrativeBundleDto[]) {
  actorThreadSnapshots.set(key, bundles);
}

export function clearActorThreadSnapshots() {
  actorThreadSnapshots.clear();
}
