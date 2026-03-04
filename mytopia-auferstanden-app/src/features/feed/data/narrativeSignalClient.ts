import firestore from '@react-native-firebase/firestore';

import { V2_COLLECTION } from '@/src/core/firestore/schema';

export type NarrativeStatePulse = {
  bundleId: string;
  eventType?: 'content_update' | 'release';
  pushState?: 'failed' | 'pending' | 'sent';
  releaseAt?: string;
  releasedAt?: string;
  token: string;
  updatedAt?: string;
  version: number;
};

export function subscribeNarrativeSignal(listener: (pulse: NarrativeStatePulse | null) => void) {
  try {
    return firestore()
      .collection(V2_COLLECTION.narrativeState)
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .onSnapshot(
        (querySnapshot) => {
          if (querySnapshot.empty) {
            listener(null);
            return;
          }

          const doc = querySnapshot.docs[0];
          const data = (doc.data() as Record<string, unknown> | undefined) ?? {};

          const version = normalizeVersion(data.version);
          const updatedAt = toIsoString(data.updatedAt);
          const releasedAt = toIsoString(data.releasedAt);
          const releaseAt = toIsoString(data.releaseAt);

          const pulse: NarrativeStatePulse = {
            bundleId: doc.id,
            ...(data.lastEventType === 'release' || data.lastEventType === 'content_update'
              ? { eventType: data.lastEventType }
              : {}),
            ...(data.pushState === 'pending' || data.pushState === 'sent' || data.pushState === 'failed'
              ? { pushState: data.pushState }
              : {}),
            ...(releaseAt ? { releaseAt } : {}),
            ...(releasedAt ? { releasedAt } : {}),
            token: `${doc.id}:${version}:${updatedAt ?? 'none'}`,
            ...(updatedAt ? { updatedAt } : {}),
            version,
          };

          listener(pulse);
        },
        (error) => {
          console.warn('[feed] Failed to subscribe to narrative state.', error);
          listener(null);
        }
      );
  } catch (error) {
    console.warn('[feed] Firestore narrative state listener could not start.', error);
    listener(null);
    return () => undefined;
  }
}

function normalizeVersion(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  return 0;
}

function toIsoString(value: unknown) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && value !== null) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === 'function') {
      try {
        const date = (toDate as (this: unknown) => Date).call(value);
        if (date instanceof Date && !Number.isNaN(date.getTime())) {
          return date.toISOString();
        }
      } catch {
        // Fall through to other timestamp shapes.
      }
    }

    const seconds = (value as { seconds?: unknown }).seconds;
    const nanoseconds = (value as { nanoseconds?: unknown }).nanoseconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      const nanos = typeof nanoseconds === 'number' && Number.isFinite(nanoseconds) ? nanoseconds : 0;
      const millis = seconds * 1000 + Math.floor(nanos / 1_000_000);
      const date = new Date(millis);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }

  return null;
}
