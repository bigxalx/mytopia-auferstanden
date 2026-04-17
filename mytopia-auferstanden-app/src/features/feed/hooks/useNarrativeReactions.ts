import {
  collection,
  documentId,
  getFirestore,
  onSnapshot,
  query,
  where,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { V2_COLLECTION } from '@/src/core/firestore/schema';
import type { AppMode } from '@/src/core/session/appMode';
import { submitNarrativeReaction } from '@/src/features/feed/data/narrativeReactionClient';
import {
  applyNarrativeReactionSelection,
  buildNarrativeReactionMessageKey,
  isNarrativeReactionId,
  type NarrativeMessageReactionState,
  type NarrativeReactionCounts,
  type NarrativeReactionId,
} from '@/src/features/feed/reactions/reactionCatalog';
import type { PlaybackMessage } from '@/src/features/feed/utils/playback';

type MessageReactionMap = Record<string, NarrativeMessageReactionState>;

type OptimisticReactionEntry = NarrativeMessageReactionState & {
  requestId: number;
};

type AggregateCountsMap = Record<string, NarrativeReactionCounts>;
type ViewerReactionMap = Record<string, NarrativeReactionId>;

export function useNarrativeReactions({
  items,
  mode,
  userId,
}: {
  items: PlaybackMessage[];
  mode: AppMode;
  userId?: string;
}) {
  const bundleIds = useMemo(
    () => Array.from(new Set(items.map((item) => item.bundleId))).sort(),
    [items]
  );
  const bundleIdChunks = useMemo(() => chunkArray(bundleIds, 10), [bundleIds]);
  const [serverCounts, setServerCounts] = useState<AggregateCountsMap>({});
  const [serverViewerReactions, setServerViewerReactions] = useState<ViewerReactionMap>({});
  const [optimisticReactions, setOptimisticReactions] = useState<
    Record<string, OptimisticReactionEntry>
  >({});
  const requestIdRef = useRef(0);
  const serverCountsRef = useRef(serverCounts);
  const serverViewerReactionsRef = useRef(serverViewerReactions);
  const optimisticReactionsRef = useRef(optimisticReactions);

  useEffect(() => {
    serverCountsRef.current = serverCounts;
  }, [serverCounts]);

  useEffect(() => {
    serverViewerReactionsRef.current = serverViewerReactions;
  }, [serverViewerReactions]);

  useEffect(() => {
    optimisticReactionsRef.current = optimisticReactions;
  }, [optimisticReactions]);

  useEffect(() => {
    if (bundleIdChunks.length === 0) {
      setServerCounts({});
      return;
    }

    const db = getFirestore();
    const collectionRef = collection(db, V2_COLLECTION.narrativeReactions);
    const chunkState = new Map<string, AggregateCountsMap>();
    const unsubscribeFns = bundleIdChunks.map((chunk) => {
      const docIds = chunk.map((bundleId) => buildNarrativeReactionDocId(bundleId, mode));
      const chunkKey = docIds.join('|');
      const reactionsQuery = query(collectionRef, where(documentId(), 'in', docIds));

      return onSnapshot(
        reactionsQuery,
        (snapshot) => {
          chunkState.set(chunkKey, parseAggregateReactionSnapshot(snapshot.docs));
          setServerCounts(mergeChunkState(chunkState));
        },
        (error) => {
          console.warn('[feed] Failed to subscribe to narrative reactions.', error);
          chunkState.set(chunkKey, {});
          setServerCounts(mergeChunkState(chunkState));
        }
      );
    });

    return () => {
      unsubscribeFns.forEach((unsubscribe) => unsubscribe());
      setServerCounts({});
    };
  }, [bundleIdChunks, mode]);

  useEffect(() => {
    if (!userId || bundleIdChunks.length === 0) {
      setServerViewerReactions({});
      return;
    }

    const db = getFirestore();
    const collectionRef = collection(db, V2_COLLECTION.narrativeUserReactions);
    const chunkState = new Map<string, ViewerReactionMap>();
    const unsubscribeFns = bundleIdChunks.map((chunk) => {
      const docIds = chunk.map((bundleId) => buildNarrativeUserReactionDocId(bundleId, mode, userId));
      const chunkKey = docIds.join('|');
      const reactionsQuery = query(collectionRef, where(documentId(), 'in', docIds));

      return onSnapshot(
        reactionsQuery,
        (snapshot) => {
          chunkState.set(chunkKey, parseViewerReactionSnapshot(snapshot.docs));
          setServerViewerReactions(mergeChunkState(chunkState));
        },
        (error) => {
          console.warn('[feed] Failed to subscribe to viewer narrative reactions.', error);
          chunkState.set(chunkKey, {});
          setServerViewerReactions(mergeChunkState(chunkState));
        }
      );
    });

    return () => {
      unsubscribeFns.forEach((unsubscribe) => unsubscribe());
      setServerViewerReactions({});
    };
  }, [bundleIdChunks, mode, userId]);

  useEffect(() => {
    setOptimisticReactions((current) => {
      let didChange = false;
      const next = { ...current };

      for (const [messageKey, optimisticEntry] of Object.entries(current)) {
        const serverEntry = buildServerReactionState(messageKey, serverCounts, serverViewerReactions);
        if (reactionStatesEqual(serverEntry, optimisticEntry)) {
          delete next[messageKey];
          didChange = true;
        }
      }

      return didChange ? next : current;
    });
  }, [serverCounts, serverViewerReactions]);

  const reactionStates = useMemo<MessageReactionMap>(() => {
    const keys = new Set<string>([
      ...Object.keys(serverCounts),
      ...Object.keys(serverViewerReactions),
      ...Object.keys(optimisticReactions),
    ]);
    const next: MessageReactionMap = {};

    for (const messageKey of keys) {
      const optimisticEntry = optimisticReactions[messageKey];
      if (optimisticEntry) {
        next[messageKey] = {
          counts: { ...optimisticEntry.counts },
          viewerReaction: optimisticEntry.viewerReaction,
        };
        continue;
      }

      next[messageKey] = buildServerReactionState(
        messageKey,
        serverCounts,
        serverViewerReactions
      );
    }

    return next;
  }, [optimisticReactions, serverCounts, serverViewerReactions]);

  const getMessageReaction = useCallback(
    (bundleId: string, messageId: string) => {
      const messageKey = buildNarrativeReactionMessageKey(bundleId, messageId);
      return reactionStates[messageKey] ?? null;
    },
    [reactionStates]
  );

  const submitReaction = useCallback(
    async ({
      bundleId,
      messageId,
      reaction,
    }: {
      bundleId: string;
      messageId: string;
      reaction: NarrativeReactionId | null;
    }) => {
      const messageKey = buildNarrativeReactionMessageKey(bundleId, messageId);
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      const currentState =
        optimisticReactionsRef.current[messageKey] ??
        buildServerReactionState(
          messageKey,
          serverCountsRef.current,
          serverViewerReactionsRef.current
        );
      const nextState = applyNarrativeReactionSelection(currentState, reaction);

      setOptimisticReactions((current) => ({
        ...current,
        [messageKey]: {
          ...nextState,
          requestId,
        },
      }));

      try {
        await submitNarrativeReaction({
          bundleId,
          messageId,
          mode,
          reaction,
        });
      } catch (error) {
        setOptimisticReactions((current) => {
          const currentEntry = current[messageKey];
          if (!currentEntry || currentEntry.requestId !== requestId) {
            return current;
          }

          const next = { ...current };
          delete next[messageKey];
          return next;
        });
        console.warn('[feed] Failed to submit narrative reaction.', error);
      }
    },
    [mode]
  );

  return {
    getMessageReaction,
    reactionStates,
    submitReaction,
  };
}

function buildNarrativeReactionDocId(bundleId: string, mode: AppMode) {
  return `${mode}__${bundleId}`;
}

function buildNarrativeUserReactionDocId(bundleId: string, mode: AppMode, userId: string) {
  return `${mode}__${userId}__${bundleId}`;
}

function parseAggregateReactionSnapshot(
  docs: FirebaseFirestoreTypes.QueryDocumentSnapshot[]
): AggregateCountsMap {
  const parsed: AggregateCountsMap = {};

  for (const docSnapshot of docs) {
    const data = (docSnapshot.data() as Record<string, unknown> | undefined) ?? {};
    const bundleId = typeof data.bundleId === 'string' ? data.bundleId : null;
    const messages = data.messages;

    if (!bundleId || !messages || typeof messages !== 'object') {
      continue;
    }

    for (const [messageId, rawEntry] of Object.entries(messages as Record<string, unknown>)) {
      if (!rawEntry || typeof rawEntry !== 'object') {
        continue;
      }

      const rawCounts = (rawEntry as Record<string, unknown>).counts;
      if (!rawCounts || typeof rawCounts !== 'object') {
        continue;
      }

      const counts: NarrativeReactionCounts = {};
      for (const [reactionId, rawCount] of Object.entries(rawCounts as Record<string, unknown>)) {
        if (
          !isNarrativeReactionId(reactionId) ||
          typeof rawCount !== 'number' ||
          !Number.isFinite(rawCount) ||
          rawCount <= 0
        ) {
          continue;
        }

        counts[reactionId] = Math.floor(rawCount);
      }

      const messageKey = buildNarrativeReactionMessageKey(bundleId, messageId);
      parsed[messageKey] = counts;
    }
  }

  return parsed;
}

function parseViewerReactionSnapshot(
  docs: FirebaseFirestoreTypes.QueryDocumentSnapshot[]
): ViewerReactionMap {
  const parsed: ViewerReactionMap = {};

  for (const docSnapshot of docs) {
    const data = (docSnapshot.data() as Record<string, unknown> | undefined) ?? {};
    const bundleId = typeof data.bundleId === 'string' ? data.bundleId : null;
    const messages = data.messages;

    if (!bundleId || !messages || typeof messages !== 'object') {
      continue;
    }

    for (const [messageId, rawEntry] of Object.entries(messages as Record<string, unknown>)) {
      if (!rawEntry || typeof rawEntry !== 'object') {
        continue;
      }

      const reaction = (rawEntry as Record<string, unknown>).reaction;
      if (!isNarrativeReactionId(reaction)) {
        continue;
      }

      const messageKey = buildNarrativeReactionMessageKey(bundleId, messageId);
      parsed[messageKey] = reaction;
    }
  }

  return parsed;
}

function mergeChunkState<T extends Record<string, unknown>>(chunkState: Map<string, T>) {
  return Array.from(chunkState.values()).reduce<T>((merged, value) => {
    return {
      ...merged,
      ...value,
    };
  }, {} as T);
}

function buildServerReactionState(
  messageKey: string,
  countsMap: AggregateCountsMap,
  viewerMap: ViewerReactionMap
): NarrativeMessageReactionState {
  return {
    counts: { ...(countsMap[messageKey] ?? {}) },
    viewerReaction: viewerMap[messageKey] ?? null,
  };
}

function reactionStatesEqual(
  left: NarrativeMessageReactionState,
  right: NarrativeMessageReactionState
) {
  if (left.viewerReaction !== right.viewerReaction) {
    return false;
  }

  const reactionIds = new Set<NarrativeReactionId>([
    ...Object.keys(left.counts),
    ...Object.keys(right.counts),
  ] as NarrativeReactionId[]);

  for (const reactionId of reactionIds) {
    if ((left.counts[reactionId] ?? 0) !== (right.counts[reactionId] ?? 0)) {
      return false;
    }
  }

  return true;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
