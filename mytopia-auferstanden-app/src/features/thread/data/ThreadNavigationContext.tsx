import React, { createContext, useCallback, useContext, useMemo, useRef, useState, type PropsWithChildren } from 'react';

type ExternalThreadTarget = {
  bundleId: string;
  channelId: string;
};

type ThreadNavigationContextValue = {
  consumeExternalTarget: (channelId: string) => ExternalThreadTarget | null;
  highlightedMessageKey: string | null;
  highlightMessageKey: (messageKey: string) => void;
  queueExternalTarget: (target: ExternalThreadTarget) => void;
};

const ThreadNavigationContext = createContext<ThreadNavigationContextValue | null>(null);

export function ThreadNavigationProvider({ children }: PropsWithChildren) {
  const [pendingTarget, setPendingTarget] = useState<ExternalThreadTarget | null>(null);
  const [highlightedMessageKey, setHighlightedMessageKey] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queueExternalTarget = useCallback((target: ExternalThreadTarget) => {
    setPendingTarget(target);
  }, []);

  const consumeExternalTarget = useCallback((channelId: string) => {
    if (!pendingTarget || pendingTarget.channelId !== channelId) {
      return null;
    }

    setPendingTarget(null);
    return pendingTarget;
  }, [pendingTarget]);

  const highlightMessageKey = useCallback((messageKey: string) => {
    setHighlightedMessageKey(messageKey);

    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }

    highlightTimerRef.current = setTimeout(() => {
      setHighlightedMessageKey(null);
      highlightTimerRef.current = null;
    }, 3000);
  }, []);

  const value = useMemo<ThreadNavigationContextValue>(() => ({
    consumeExternalTarget,
    highlightedMessageKey,
    highlightMessageKey,
    queueExternalTarget,
  }), [consumeExternalTarget, highlightedMessageKey, highlightMessageKey, queueExternalTarget]);

  return (
    <ThreadNavigationContext.Provider value={value}>
      {children}
    </ThreadNavigationContext.Provider>
  );
}

export function useThreadNavigation() {
  const context = useContext(ThreadNavigationContext);
  if (!context) {
    throw new Error('useThreadNavigation must be used within ThreadNavigationProvider');
  }

  return context;
}
