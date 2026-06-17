import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, LayoutAnimation, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useSession } from '@/src/core/session/SessionContext';
import type { AppMode } from '@/src/core/session/appMode';
import { useLiveSession } from '@/src/features/live/data/LiveSessionContext';
import type { LiveAvailabilityDto } from '@/src/features/live/data/liveSessionClient';
import { AppButton } from '@/src/shared/ui/AppButton';
import { Screen } from '@/src/shared/ui/Screen';
import { theme } from '@/src/shared/ui/theme';

const LIVE_SESSION_MODE: AppMode = 'production';
const PARAM_GRACE_MS = 2500;

export default function LiveSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string;
    sessionId?: string;
    token?: string;
  }>();
  const { isHydrated, user } = useSession();
  const {
    activeEvent,
    availableSession,
    connectionStatus,
    disconnectLiveSession,
    errorMessage,
    isGpsBypassEnabled,
    joinAvailableSession,
    joinFromQr,
    session,
  } = useLiveSession();
  const [inactiveState, setInactiveState] = useState<{
    nextWindow?: LiveAvailabilityDto['nextWindow'] | null;
    state: 'upcoming' | 'unavailable';
  } | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [paramGraceElapsed, setParamGraceElapsed] = useState(false);
  const [previewSession, setPreviewSession] = useState<LiveAvailabilityDto['session'] | null>(null);
  const attemptedKeyRef = useRef<string | null>(null);

  const sessionId = firstParam(params.sessionId);
  const token = firstParam(params.token);
  const attemptKey = useMemo(
    () => sessionId && token ? `${LIVE_SESSION_MODE}:${sessionId}:${token}` : null,
    [sessionId, token]
  );

  useEffect(() => {
    logLiveSessionDebug('route render', {
      hasAttemptKey: Boolean(attemptKey),
      hasSessionId: Boolean(sessionId),
      hasToken: Boolean(token),
      liveMode: LIVE_SESSION_MODE,
      paramKeys: Object.keys(params),
    });
  }, [attemptKey, params, sessionId, token]);

  useEffect(() => {
    setParamGraceElapsed(false);
    const timeout = setTimeout(() => {
      logLiveSessionDebug('param grace elapsed', {
        hasAttemptKey: Boolean(attemptKey),
        hasSessionId: Boolean(sessionId),
        hasToken: Boolean(token),
      });
      setParamGraceElapsed(true);
    }, PARAM_GRACE_MS);
    return () => clearTimeout(timeout);
  }, [attemptKey, sessionId, token]);

  const attemptJoin = useCallback((options?: { background?: boolean }) => {
    if (!isHydrated || !user || !attemptKey || !sessionId || !token) {
      logLiveSessionDebug('join skipped', {
        hasAttemptKey: Boolean(attemptKey),
        hasSessionId: Boolean(sessionId),
        hasToken: Boolean(token),
        isHydrated,
        user: Boolean(user),
      });
      return Promise.resolve();
    }

    logLiveSessionDebug('join attempt start', {
      background: Boolean(options?.background),
      liveMode: LIVE_SESSION_MODE,
      sessionId,
      tokenLength: token.length,
    });
    if (!options?.background) {
      setIsJoining(true);
    }
    setJoinError(null);
    return joinFromQr({ mode: LIVE_SESSION_MODE, sessionId, token })
      .then((result) => {
        logLiveSessionDebug('join attempt result', {
          hasNextWindow: result.state === 'upcoming' && Boolean(result.nextWindow),
          sessionId: result.state === 'joined' ? result.session.sessionId : undefined,
          state: result.state,
        });
        if (result.state === 'joined') {
          animateSheetTransition();
          setInactiveState(null);
          setPreviewSession(result.session);
          return;
        }
        if (result.state === 'upcoming') {
          setInactiveState({ nextWindow: result.nextWindow, state: 'upcoming' });
        } else if (result.state === 'unavailable') {
          setInactiveState({ state: 'unavailable' });
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Live-Session konnte nicht geöffnet werden.';
        logLiveSessionDebug('join attempt failed', { message });
        if (isEndedSessionError(message)) {
          setInactiveState({ state: 'unavailable' });
          return;
        }
        setJoinError(message);
      })
      .finally(() => {
        if (!options?.background) {
          setIsJoining(false);
        }
      });
  }, [attemptKey, isHydrated, joinFromQr, sessionId, token, user]);

  useEffect(() => {
    if (!attemptKey || !isHydrated || !user || attemptedKeyRef.current === attemptKey) {
      return;
    }
    attemptedKeyRef.current = attemptKey;
    void attemptJoin();
  }, [attemptJoin, attemptKey, isHydrated, user]);

  useEffect(() => {
    if (session) {
      logLiveSessionDebug('context session visible', {
        currentEventId: session.currentEventId,
        endsAt: session.endsAt,
        sessionId: session.sessionId,
        status: session.status,
      });
      setPreviewSession(null);
    }
  }, [session]);

  useEffect(() => {
    if (!inactiveState || !attemptKey || !sessionId || !token || !user) {
      return;
    }

    let cancelled = false;
    const retry = () => {
      if (!cancelled) {
        void attemptJoin({ background: true });
      }
    };
    const interval = setInterval(retry, 10_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        retry();
      }
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.remove();
    };
  }, [attemptJoin, attemptKey, inactiveState, sessionId, token, user]);

  const visibleError = joinError ?? errorMessage;
  const visibleSession = session ?? previewSession ?? null;
  const isPromptSession = !attemptKey && Boolean(availableSession) && !visibleSession && !inactiveState;
  const isConnectedSession = Boolean(visibleSession) && !inactiveState && !isPromptSession;

  useEffect(() => {
    if (!isHydrated || !user || visibleSession || availableSession || isJoining || visibleError || inactiveState || attemptKey) {
      return;
    }

    if (!paramGraceElapsed) {
      return;
    }

    logLiveSessionDebug('showing unavailable state after missing params', {
      hasAvailableSession: Boolean(availableSession),
    });
    setInactiveState({ state: 'unavailable' });
  }, [attemptKey, availableSession, inactiveState, isHydrated, isJoining, paramGraceElapsed, user, visibleError, visibleSession]);

  const dismissModal = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  }, [router]);

  useEffect(() => {
    if (Platform.OS === 'ios' && activeEvent && isConnectedSession) {
      dismissModal();
    }
  }, [activeEvent, dismissModal, isConnectedSession]);

  const handleJoinAvailableSession = useCallback(async () => {
    if (isJoining) {
      return;
    }

    setIsJoining(true);
    setJoinError(null);
    try {
      const result = await joinAvailableSession();
      if (result.state === 'joined') {
        animateSheetTransition();
        setInactiveState(null);
        setPreviewSession(result.session);
        return;
      }
      if (result.state === 'outside-venue') {
        setJoinError('Du scheinst gerade nicht im Theater zu sein. Der Live-Zugang erscheint wieder, sobald du vor Ort bist und das Zeitfenster läuft.');
        return;
      }
      if (result.state === 'unavailable') {
        setInactiveState({ state: 'unavailable' });
        return;
      }
      setJoinError(result.message);
    } finally {
      setIsJoining(false);
    }
  }, [isJoining, joinAvailableSession]);

  const handleIgnoreAvailableSession = useCallback(() => {
    dismissModal();
  }, [dismissModal]);

  const handleDisconnectLiveSession = useCallback(async () => {
    if (isDisconnecting) {
      return;
    }

    setIsDisconnecting(true);
    setJoinError(null);
    try {
      await disconnectLiveSession();
      setInactiveState(null);
      setPreviewSession(null);
      dismissModal();
    } catch (error) {
      const message = error instanceof Error && error.message.trim().length > 0
        ? error.message
        : 'Live-Verbindung konnte nicht getrennt werden.';
      setJoinError(message);
    } finally {
      setIsDisconnecting(false);
    }
  }, [disconnectLiveSession, dismissModal, isDisconnecting]);

  if (!isHydrated) {
    return (
      <Screen
        backgroundColor={theme.colors.background}
        centerContent
        headerShown={false}
        scrollable={false}
        title=""
      >
        <ActivityIndicator color={theme.colors.orange} size="large" />
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen backgroundColor={theme.colors.background} headerShown={false} title="">
        <View style={styles.card}>
          <Text style={styles.heading}>Anmeldung erforderlich</Text>
          <Text style={styles.body}>Melde dich an, um der Live-Interaktion beizutreten.</Text>
          <AppButton label="Anmelden" onPress={() => router.replace('/(auth)/sign-in')} />
        </View>
      </Screen>
    );
  }

  if (!visibleSession && !visibleError && !inactiveState && !availableSession) {
    return (
      <Screen
        backgroundColor={theme.colors.background}
        centerContent
        headerShown={false}
        scrollable={false}
        title=""
      >
        <ActivityIndicator color={theme.colors.orange} size="large" />
      </Screen>
    );
  }

  return (
    <Screen backgroundColor={theme.colors.background} bottomInset={false} headerShown={false} noPadding title="">
      <View style={styles.modalContent}>
        <View style={styles.panel}>
          <View style={styles.copyBlock}>
            <View style={[
              styles.statusPill,
              visibleError
                ? styles.statusPillError
                : inactiveState
                  ? styles.statusPillNeutral
                  : connectionStatus === 'connected'
                    ? styles.statusPillConnected
                    : styles.statusPillConnecting,
            ]}>
              <View style={[
                styles.statusDot,
                visibleError
                  ? styles.statusDotError
                  : inactiveState
                    ? styles.statusDotNeutral
                    : connectionStatus === 'connected'
                      ? styles.statusDotConnected
                      : styles.statusDotConnecting,
              ]} />
              <Text style={[
                styles.statusText,
                visibleError
                  ? styles.statusTextError
                  : inactiveState
                    ? styles.statusTextNeutral
                    : connectionStatus === 'connected'
                      ? styles.statusTextConnected
                      : styles.statusTextConnecting,
              ]}>
                {getStatusLabel({
                  connectionStatus,
                  hasError: Boolean(visibleError),
                  inactiveState,
                  isPromptSession,
                })}
              </Text>
            </View>
            <Text style={styles.heading}>
              {getLiveTitle({
                hasError: Boolean(visibleError),
                inactiveState,
                isConnectedSession,
                isPromptSession,
                visibleSessionTitle: visibleSession?.title,
              })}
            </Text>
            <Text style={styles.body}>
              {getLiveCopy({
                hasError: Boolean(visibleError),
                inactiveState,
                isPromptSession,
                session: Boolean(visibleSession),
              })}
            </Text>
          </View>

          {isGpsBypassEnabled ? <DevGpsNotice /> : null}

          {inactiveState?.state === 'upcoming' && inactiveState.nextWindow?.startsAt ? (
            <Text style={styles.timeText}>
              Freischaltung ab {formatWindowTime(inactiveState.nextWindow.startsAt)}
            </Text>
          ) : null}

          {visibleError ? (
            <View style={styles.errorBox}>
              <Text style={styles.error}>{visibleError}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            {isPromptSession ? (
              <>
                <AppButton
                  fullWidth
                  label="Jetzt beitreten"
                  loading={isJoining}
                  onPress={() => {
                    void handleJoinAvailableSession();
                  }}
                  style={styles.returnButton}
                />
                <AppButton
                  disabled={isJoining}
                  fullWidth
                  label="Jetzt nicht"
                  onPress={() => {
                    handleIgnoreAvailableSession();
                  }}
                  style={styles.returnButton}
                  variant="secondary"
                />
              </>
            ) : isConnectedSession ? (
              <>
                <AppButton
                  fullWidth
                  label="Okay"
                  onPress={dismissModal}
                  style={styles.returnButton}
                />
                <Pressable
                  accessibilityLabel="Live-Verbindung trennen"
                  accessibilityRole="button"
                  disabled={isJoining || isDisconnecting}
                  onPress={() => {
                    void handleDisconnectLiveSession();
                  }}
                  style={({ pressed }) => [
                    styles.disconnectAction,
                    pressed && !isDisconnecting ? styles.disconnectActionPressed : null,
                    isJoining || isDisconnecting ? styles.disconnectActionDisabled : null,
                  ]}
                >
                  {isDisconnecting ? <ActivityIndicator color={theme.colors.destructiveBorder} size="small" /> : null}
                  <Text style={styles.disconnectActionText}>
                    {isDisconnecting ? 'Verbindung wird getrennt…' : 'Verbindung trennen'}
                  </Text>
                </Pressable>
              </>
            ) : visibleError || inactiveState ? (
              <AppButton
                fullWidth
                label="Schließen"
                onPress={dismissModal}
                style={styles.returnButton}
                variant="secondary"
              />
            ) : null}
          </View>
        </View>
      </View>
    </Screen>
  );
}

function DevGpsNotice() {
  return (
    <View style={styles.devNotice}>
      <Text style={styles.devNoticeTitle}>Testmodus</Text>
      <Text style={styles.devNoticeText}>
        GPS-Prüfung ist in Dev deaktiviert. In Production wird dein Standort geprüft, wenn du ihn freigegeben hast.
      </Text>
    </View>
  );
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isEndedSessionError(message: string) {
  return message.includes('Live session is not active')
    || message.includes('Live session has ended')
    || message.includes('Live session is no longer current')
    || message.includes('(404)');
}

function formatConnectionStatus(status: 'connecting' | 'connected' | 'offline') {
  if (status === 'connected') return 'Live';
  if (status === 'connecting') return 'Verbinde…';
  return 'Nicht verbunden';
}

function getStatusLabel({
  connectionStatus,
  hasError,
  inactiveState,
  isPromptSession,
}: {
  connectionStatus: 'connecting' | 'connected' | 'offline';
  hasError: boolean;
  inactiveState: { nextWindow?: LiveAvailabilityDto['nextWindow'] | null; state: 'upcoming' | 'unavailable' } | null;
  isPromptSession: boolean;
}) {
  if (hasError) {
    return 'Hinweis';
  }
  if (isPromptSession) {
    return 'Jetzt Live';
  }
  if (inactiveState?.state === 'upcoming') {
    return 'Nächstes Zeitfenster';
  }
  if (inactiveState) {
    return 'Kein Zeitfenster';
  }
  return formatConnectionStatus(connectionStatus);
}

function getLiveTitle({
  hasError,
  inactiveState,
  isConnectedSession,
  isPromptSession,
  visibleSessionTitle,
}: {
  hasError: boolean;
  inactiveState: { nextWindow?: LiveAvailabilityDto['nextWindow'] | null; state: 'upcoming' | 'unavailable' } | null;
  isConnectedSession: boolean;
  isPromptSession: boolean;
  visibleSessionTitle?: string;
}) {
  if (isPromptSession && hasError) {
    return 'Noch nicht verbunden';
  }
  if (isPromptSession) {
    return 'Live im Theater';
  }
  if (hasError) {
    return 'Verbindung prüfen';
  }
  if (inactiveState?.state === 'upcoming') {
    return 'Das Zeitfenster startet bald';
  }
  if (inactiveState) {
    return 'Derzeit nicht live';
  }
  if (isConnectedSession) {
    return 'Du bist verbunden';
  }
  return visibleSessionTitle ?? 'Mytopia Live';
}

function getLiveCopy({
  hasError,
  inactiveState,
  isPromptSession,
  session,
}: {
  hasError: boolean;
  inactiveState: { nextWindow?: LiveAvailabilityDto['nextWindow'] | null; state: 'upcoming' | 'unavailable' } | null;
  isPromptSession: boolean;
  session: boolean;
}) {
  if (isPromptSession && hasError) {
    return 'Schließe dieses Fenster ruhig. Die Live-Leiste bleibt während des Zeitfensters sichtbar.';
  }
  if (isPromptSession) {
    return 'Nimm an der Live-Interaktion teil und entscheide mit, wie es weitergeht.';
  }
  if (inactiveState?.state === 'upcoming' && inactiveState.nextWindow?.startsAt) {
    return `Die nächste Live-Interaktion ist ab ${formatWindowTime(inactiveState.nextWindow.startsAt)} möglich.`;
  }
  if (inactiveState) {
    return 'Im Moment ist keine Live-Interaktion verfügbar. Du kannst die App normal weiter nutzen.';
  }
  if (hasError) {
    return 'Die Live-Verbindung konnte gerade nicht bestätigt werden. Bitte versuche es noch einmal.';
  }
  if (session) {
    return 'Signale erscheinen automatisch. Du kannst dieses Fenster schließen und bleibst verbunden.';
  }
  return 'Die Live-Verbindung wird vorbereitet.';
}

function formatWindowTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'dem nächsten Vorstellungsfenster';
  }
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function animateSheetTransition() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

function logLiveSessionDebug(message: string, details?: Record<string, unknown>) {
  if (__DEV__) {
    console.info(`[live/session] ${message}`, details ?? {});
  }
}

const styles = StyleSheet.create({
  actions: {
    alignSelf: 'stretch',
    gap: 10,
  },
  body: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 320,
    textAlign: 'center',
  },
  card: {
    alignItems: 'center',
    backgroundColor: theme.colors.headerBackground,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  copyBlock: {
    alignItems: 'center',
    gap: 12,
  },
  devNotice: {
    alignSelf: 'stretch',
    gap: 3,
    paddingHorizontal: 4,
  },
  devNoticeText: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  devNoticeTitle: {
    color: theme.colors.orange,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 11,
    letterSpacing: 0,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  disconnectAction: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  disconnectActionDisabled: {
    opacity: 0.5,
  },
  disconnectActionPressed: {
    opacity: 0.72,
  },
  disconnectActionText: {
    color: theme.colors.destructiveBorder,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 14,
  },
  error: {
    color: theme.colors.destructiveBorder,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 14,
    textAlign: 'center',
  },
  errorBox: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(252, 165, 165, 0.1)',
    borderColor: 'rgba(252, 165, 165, 0.32)',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  heading: {
    color: theme.colors.textPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 22,
    lineHeight: 28,
    maxWidth: 320,
    textAlign: 'center',
  },
  modalContent: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: 2,
    maxWidth: 360,
    paddingBottom: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
    width: '100%',
  },
  panel: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 16,
  },
  returnButton: {
    width: '100%',
  },
  statusDot: {
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  statusDotConnected: {
    backgroundColor: '#22c55e',
  },
  statusDotConnecting: {
    backgroundColor: theme.colors.orange,
  },
  statusDotError: {
    backgroundColor: theme.colors.destructiveBorder,
  },
  statusDotNeutral: {
    backgroundColor: theme.colors.textSecondary,
  },
  statusPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusPillConnected: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.32)',
  },
  statusPillConnecting: {
    backgroundColor: theme.colors.orangeSoft,
    borderColor: theme.colors.orangeStroke,
  },
  statusPillError: {
    backgroundColor: 'rgba(252, 165, 165, 0.1)',
    borderColor: 'rgba(252, 165, 165, 0.32)',
  },
  statusPillNeutral: {
    backgroundColor: 'rgba(248, 250, 252, 0.06)',
    borderColor: 'rgba(216, 222, 232, 0.18)',
  },
  statusText: {
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  statusTextConnected: {
    color: '#86efac',
  },
  statusTextConnecting: {
    color: theme.colors.orange,
  },
  statusTextError: {
    color: theme.colors.destructiveBorder,
  },
  statusTextNeutral: {
    color: theme.colors.textSecondary,
  },
  timeText: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
