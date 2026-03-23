import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

import { useSession } from '@/src/core/session/SessionContext';
import {
  subscribeNarrativeSignal,
  type NarrativeStatePulse,
} from '@/src/features/feed/data/narrativeSignalClient';

interface NarrativeSignalContextValue {
  hasUnreadNarrative: boolean;
  markAsRead: () => Promise<void>;
  pulse: NarrativeStatePulse | null;
}

const NarrativeSignalContext = createContext<NarrativeSignalContextValue>({
  hasUnreadNarrative: false,
  markAsRead: async () => {},
  pulse: null,
});

export const useNarrativeSignal = () => useContext(NarrativeSignalContext);

const LAST_SEEN_TOKEN_KEY = 'mytopia_last_seen_narrative_token';

export const NarrativeSignalProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isHydrated, selectedMode, shouldShowWelcomeBack, user } = useSession();
  const [pulse, setPulse] = useState<NarrativeStatePulse | null>(null);
  const [lastSeenToken, setLastSeenToken] = useState<string | null>(null);

  useEffect(() => {
    // Load last seen token
    AsyncStorage.getItem(LAST_SEEN_TOKEN_KEY).then((token) => {
      if (token) setLastSeenToken(token);
    });
  }, []);

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

  const hasUnreadNarrative = pulse !== null && pulse.token !== lastSeenToken;

  const markAsRead = async () => {
    if (pulse?.token && pulse.token !== lastSeenToken) {
      setLastSeenToken(pulse.token);
      await AsyncStorage.setItem(LAST_SEEN_TOKEN_KEY, pulse.token);
    }
  };

  return (
    <NarrativeSignalContext.Provider value={{ hasUnreadNarrative, markAsRead, pulse }}>
      {children}
    </NarrativeSignalContext.Provider>
  );
};
