import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

import { useSession } from '@/src/core/session/SessionContext';
import { subscribeToForegroundNarrativeMessages } from '@/src/core/firebase/messagingClient';
import {
  fetchNarrativeFeedPage,
} from '@/src/features/feed/data/narrativeFeedClient';
import {
  subscribeNarrativeSignal,
  type NarrativeStatePulse,
} from '@/src/features/feed/data/narrativeSignalClient';

interface NarrativeSignalContextValue {
  hasUnreadNarrative: boolean;
  unreadCount: number;
  markAsRead: () => Promise<void>;
  pulse: NarrativeStatePulse | null;
  refreshKey: number;
  lastSeenTime: number;
}

const NarrativeSignalContext = createContext<NarrativeSignalContextValue>({
  hasUnreadNarrative: false,
  unreadCount: 0,
  markAsRead: async () => {},
  pulse: null,
  refreshKey: 0,
  lastSeenTime: 0,
});

export const useNarrativeSignal = () => useContext(NarrativeSignalContext);

const LAST_SEEN_TOKEN_KEY_BASE = 'mytopia_last_seen_narrative_token';
const LAST_SEEN_TIME_KEY_BASE = 'mytopia_last_seen_narrative_time';

function getPersistenceKey(base: string, userId: string, mode: string) {
  return `${base}:${userId}:${mode}`;
}

export const NarrativeSignalProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isHydrated, selectedMode, shouldShowWelcomeBack, user } = useSession();
  const [pulse, setPulse] = useState<NarrativeStatePulse | null>(null);
  const [lastSeenToken, setLastSeenToken] = useState<string | null>(null);
  const [lastSeenTime, setLastSeenTime] = useState<number>(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load persistence when user/mode changes
  useEffect(() => {
    if (!user) return;

    const tokenKey = getPersistenceKey(LAST_SEEN_TOKEN_KEY_BASE, user.id, selectedMode);
    const timeKey = getPersistenceKey(LAST_SEEN_TIME_KEY_BASE, user.id, selectedMode);

    Promise.all([
      AsyncStorage.getItem(tokenKey),
      AsyncStorage.getItem(timeKey),
    ]).then(([token, timeStr]) => {
      setLastSeenToken(token);
      setLastSeenTime(parseInt(timeStr || '0', 10) || 0);
    });
  }, [user, selectedMode]);

  // Firestore signal listener
  useEffect(() => {
    if (!isHydrated || !user || shouldShowWelcomeBack) return;

    const unsubscribe = subscribeNarrativeSignal({
      listener: (newPulse) => {
        setPulse(newPulse);
      },
      mode: selectedMode,
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isHydrated, user, shouldShowWelcomeBack, selectedMode]);

  // FCM foreground message listener
  useEffect(() => {
    if (!isHydrated || !user || shouldShowWelcomeBack) return;

    const unsubscribe = subscribeToForegroundNarrativeMessages(() => {
      setRefreshKey((k) => k + 1);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isHydrated, user, shouldShowWelcomeBack]);

  // Update unread count when pulse or lastSeenTime changes
  useEffect(() => {
    if (!isHydrated || !user || shouldShowWelcomeBack || !pulse) return;

    // If the pulse token matches our last seen perfectly, count is definitely 0
    if (pulse.token === lastSeenToken) {
      setUnreadCount(0);
      return;
    }

    // Otherwise, fetch the current state to count unread messages
    let isCancelled = false;

    fetchNarrativeFeedPage({ limit: 20, mode: selectedMode })
      .then((page) => {
        if (isCancelled) return;

        // Count messages released after lastSeenTime
        let count = 0;
        for (const bundle of page.bundles) {
          const bundleTime = Date.parse(bundle.releaseAt);
          if (isNaN(bundleTime)) continue;

          // If entire bundle is older than last seen, skip
          if (bundleTime <= lastSeenTime) continue;

          // If child messages have their own delay logic, strictly we should
          // respect buildPlaybackMessages, but for badge count,
          // "bundle is newer" is usually sufficient and more robust.
          count += bundle.messages.length;
        }
        setUnreadCount(count);
      })
      .catch((err) => {
        console.warn('[NarrativeSignal] Failed to fetch unread count', err);
      });

    return () => { isCancelled = true; };
  }, [pulse, lastSeenToken, lastSeenTime, isHydrated, user, shouldShowWelcomeBack, selectedMode]);

  const hasUnreadNarrative = unreadCount > 0 || (pulse !== null && pulse.token !== lastSeenToken);

  const markAsRead = async () => {
    if (!user) return;
    const now = Date.now();
    const token = pulse?.token;

    setLastSeenTime(now);
    setUnreadCount(0);
    if (token) {
      setLastSeenToken(token);
    }

    const tokenKey = getPersistenceKey(LAST_SEEN_TOKEN_KEY_BASE, user.id, selectedMode);
    const timeKey = getPersistenceKey(LAST_SEEN_TIME_KEY_BASE, user.id, selectedMode);

    await Promise.all([
      AsyncStorage.setItem(timeKey, now.toString()),
      token ? AsyncStorage.setItem(tokenKey, token) : Promise.resolve(),
    ]);
  };

  return (
    <NarrativeSignalContext.Provider value={{
      hasUnreadNarrative,
      unreadCount,
      markAsRead,
      pulse,
      refreshKey,
      lastSeenTime,
    }}>
      {children}
    </NarrativeSignalContext.Provider>
  );
};
