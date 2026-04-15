import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSession } from '@/src/core/session/SessionContext';
import {
  fetchNarrativeFeedPage,
  type NarrativeBundleDto,
} from '@/src/features/feed/data/narrativeFeedClient';
import { useNarrativeSignal } from '@/src/features/feed/data/NarrativeSignalContext';
import { buildPlaybackMessages } from '@/src/features/feed/utils/playback';
import {
  reconcileLatestBundles,
  type ThreadTypingState,
} from '@/src/features/thread/data/threadMessages';

const FEED_CACHE_VERSION = 1;
const FEED_CACHE_LIMIT = 80;

type FeedCachePayload = {
  bundles: NarrativeBundleDto[];
  nextCursor: string | null;
  savedAt: number;
  version: number;
};

type HubThreadSnapshot = {
  bundles: NarrativeBundleDto[];
  cacheKey: string;
  nextCursor: string | null;
};

let hubThreadSnapshot: HubThreadSnapshot | null = null;

export function useHubThread() {
  const { selectedMode, user } = useSession();
  const { markAsRead, pulse, refreshKey } = useNarrativeSignal();
  const isFocused = useIsFocused();
  const cacheKey = user ? `mytopia_feed_cache:${user.id}:${selectedMode}` : null;
  const snapshot =
    cacheKey && hubThreadSnapshot?.cacheKey === cacheKey ? hubThreadSnapshot : null;

  const requestVersionRef = useRef(0);
  const bootstrappedCacheKeyRef = useRef<string | null>(null);
  const lastPulseTokenRef = useRef<string | null>(null);
  const lastRefreshKeyRef = useRef(0);

  const [bundles, setBundles] = useState<NarrativeBundleDto[]>(() => snapshot?.bundles ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(() => snapshot?.nextCursor ?? null);
  const [isHydrated, setIsHydrated] = useState(() => Boolean(snapshot));
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [clockMs, setClockMs] = useState(() => Date.now());

  const loadFirstPage = useCallback(
    async (mode: 'initial' | 'silent') => {
      if (!user) {
        return;
      }

      const requestVersion = requestVersionRef.current + 1;
      requestVersionRef.current = requestVersion;

      if (mode === 'initial') {
        setIsHydrated(false);
      }

      try {
        const page = await fetchNarrativeFeedPage({ limit: 40, mode: selectedMode });
        if (requestVersion !== requestVersionRef.current) {
          return;
        }
        setBundles((current) => reconcileLatestBundles(current, page.bundles));
        setNextCursor(page.nextCursor);
      } finally {
        if (requestVersion === requestVersionRef.current) {
          setIsHydrated(true);
          setClockMs(Date.now());
        }
      }
    },
    [selectedMode, user]
  );

  const loadMore = useCallback(async () => {
    if (!user || !nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const page = await fetchNarrativeFeedPage({
        cursor: nextCursor,
        limit: 20,
        mode: selectedMode,
      });
      setBundles((current) => mergeOlderBundles(current, page.bundles));
      setNextCursor(page.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextCursor, selectedMode, user]);

  useEffect(() => {
    if (!user || !cacheKey) {
      setBundles([]);
      setNextCursor(null);
      setIsHydrated(false);
      hubThreadSnapshot = null;
      bootstrappedCacheKeyRef.current = null;
      return;
    }

    if (bootstrappedCacheKeyRef.current === cacheKey) {
      return;
    }
    bootstrappedCacheKeyRef.current = cacheKey;

    if (snapshot) {
      setBundles(snapshot.bundles);
      setNextCursor(snapshot.nextCursor);
      setIsHydrated(true);
      void loadFirstPage('silent');
      return;
    }

    let isCancelled = false;
    AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        if (isCancelled || !raw) {
          return;
        }
        const parsed = JSON.parse(raw) as FeedCachePayload;
        if (parsed.version !== FEED_CACHE_VERSION || !Array.isArray(parsed.bundles)) {
          return;
        }
        setBundles(parsed.bundles);
        setNextCursor(typeof parsed.nextCursor === 'string' ? parsed.nextCursor : null);
        setIsHydrated(true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!isCancelled) {
          void loadFirstPage('silent');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [cacheKey, loadFirstPage, snapshot, user]);

  useEffect(() => {
    if (!cacheKey) {
      return;
    }

    hubThreadSnapshot = {
      bundles,
      cacheKey,
      nextCursor,
    };

    const payload: FeedCachePayload = {
      bundles: bundles.slice(-FEED_CACHE_LIMIT),
      nextCursor,
      savedAt: Date.now(),
      version: FEED_CACHE_VERSION,
    };
    AsyncStorage.setItem(cacheKey, JSON.stringify(payload)).catch(() => undefined);
  }, [bundles, cacheKey, nextCursor]);

  useEffect(() => {
    setClockMs(Date.now());
  }, [bundles, isFocused]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let shouldRefresh = false;
    if (pulse?.token && pulse.token !== lastPulseTokenRef.current) {
      lastPulseTokenRef.current = pulse.token;
      shouldRefresh = true;
    }

    if (refreshKey !== lastRefreshKeyRef.current) {
      lastRefreshKeyRef.current = refreshKey;
      shouldRefresh = true;
    }

    if (shouldRefresh) {
      void loadFirstPage('silent');
    }
  }, [loadFirstPage, pulse?.token, refreshKey, user]);

  const scheduledMessages = useMemo(
    () => buildPlaybackMessages(bundles),
    [bundles]
  );

  const effectiveClockMs = isFocused ? clockMs : Date.now();
  const items = useMemo(
    () => scheduledMessages.filter((item) => item.revealAtMs <= effectiveClockMs),
    [effectiveClockMs, scheduledMessages]
  );

  const typingState = useMemo<ThreadTypingState | null>(() => {
    if (!isFocused) {
      return null;
    }
    const nextMessage = scheduledMessages.find((item) => item.revealAtMs > clockMs);
    if (!nextMessage) {
      return null;
    }

    return {
      actor: nextMessage.message.actor,
      upcomingKey: nextMessage.key,
    };
  }, [clockMs, isFocused, scheduledMessages]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const nextReveal = scheduledMessages.find((item) => item.revealAtMs > clockMs);
    if (!nextReveal) {
      return;
    }

    const timeoutMs = Math.max(25, nextReveal.revealAtMs - clockMs + 25);
    const timer = setTimeout(() => setClockMs(Date.now()), timeoutMs);
    return () => clearTimeout(timer);
  }, [clockMs, isFocused, scheduledMessages]);

  return {
    canLoadMore: Boolean(nextCursor),
    isHydrated,
    isLoadingMore,
    items,
    loadMore,
    markRead: markAsRead,
    typingState,
  };
}

function mergeOlderBundles(current: NarrativeBundleDto[], incoming: NarrativeBundleDto[]) {
  const map = new Map(current.map((bundle) => [bundle._id, bundle]));
  for (const bundle of incoming) {
    if (!map.has(bundle._id)) {
      map.set(bundle._id, bundle);
    }
  }
  return Array.from(map.values()).sort((a, b) => Date.parse(a.releaseAt) - Date.parse(b.releaseAt));
}
