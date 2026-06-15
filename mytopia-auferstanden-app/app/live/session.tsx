import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AltArrowDownLinear } from '@/components/ui/SolarTabIcons';
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
  const hadLiveSessionRef = useRef(false);

  const sessionId = firstParam(params.sessionId);
  const token = firstParam(params.token);
  const requestedMode = firstParam(params.mode);
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
      requestedMode,
    });
  }, [attemptKey, params, requestedMode, sessionId, token]);

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
          hadLiveSessionRef.current = true;
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
      hadLiveSessionRef.current = true;
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
      hadLiveSession: hadLiveSessionRef.current,
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
        hadLiveSessionRef.current = true;
        setInactiveState(null);
        setPreviewSession(result.session);
        return;
      }
      if (result.state === 'needs-location-permission') {
        setJoinError('Bitte erlaube den Standortzugriff, damit wir den Live-Zugang vor Ort freischalten können. Alternativ kannst du den QR-Code im Theater scannen.');
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
      <Screen centerContent headerShown={false} scrollable={false} title="">
        <ActivityIndicator color={theme.colors.orange} size="large" />
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen headerShown={false} title="" topInset>
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
      <Screen centerContent headerShown={false} scrollable={false} title="">
        <ActivityIndicator color={theme.colors.orange} size="large" />
      </Screen>
    );
  }

  return (
    <Screen headerShown={false} title="" topInset>
      <View style={styles.modalContent}>
        <View style={styles.dismissRow}>
          <Pressable
            accessibilityLabel="Live-Warteraum schließen"
            accessibilityRole="button"
            hitSlop={10}
            onPress={dismissModal}
            style={({ pressed }) => [
              styles.dismissButton,
              pressed ? styles.dismissButtonPressed : null,
            ]}
          >
            <AltArrowDownLinear color="rgba(255, 255, 255, 0.82)" size={22} />
          </Pressable>
        </View>

        {!isConnectedSession ? (
          <LiveSignalModule
            detail={getSignalDetail({
              hasError: Boolean(visibleError),
              inactiveState,
              isJoining,
              isPromptSession,
            })}
            label={getVisualLabel({
              hasError: Boolean(visibleError),
              inactiveState,
              isConnectedSession,
              isJoining,
              isPromptSession,
            })}
          />
        ) : null}
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
                isJoining,
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

          {isJoining ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.colors.orange} />
              <Text style={styles.loadingText}>Live-Zugang wird geprüft…</Text>
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
                  style={styles.secondaryAction}
                  variant="secondary"
                />
              </>
            ) : isConnectedSession ? (
              <AppButton
                disabled={isJoining}
                fullWidth
                label="Verbindung trennen"
                loading={isDisconnecting}
                onPress={() => {
                  void handleDisconnectLiveSession();
                }}
                style={styles.secondaryAction}
                tone="danger"
                variant="secondary"
              />
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
        GPS-Prüfung ist deaktiviert. In Production erscheint dieser Live-Zugang nur vor Ort.
      </Text>
    </View>
  );
}

function LiveSignalModule({ detail, label }: { detail: string; label: string }) {
  return (
    <View style={styles.signalCard}>
      <View style={styles.signalMark}>
        <View style={styles.signalRing}>
          <View style={styles.signalDot} />
        </View>
      </View>
      <View style={styles.signalTextBlock}>
        <Text style={styles.signalLabel}>{label}</Text>
        <Text style={styles.signalDetail}>{detail}</Text>
      </View>
      <View style={styles.signalMeta}>
        <Text style={styles.signalMetaText}>Live</Text>
      </View>
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
  if (status === 'connected') return 'Live verbunden';
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
  if (inactiveState) {
    return 'Nicht verbunden';
  }
  return formatConnectionStatus(connectionStatus);
}

function getVisualLabel({
  hasError,
  inactiveState,
  isConnectedSession,
  isJoining,
  isPromptSession,
}: {
  hasError: boolean;
  inactiveState: { nextWindow?: LiveAvailabilityDto['nextWindow'] | null; state: 'upcoming' | 'unavailable' } | null;
  isConnectedSession: boolean;
  isJoining: boolean;
  isPromptSession: boolean;
}) {
  if (hasError) {
    return 'Live-Zugang';
  }
  if (inactiveState?.state === 'upcoming') {
    return 'Nächstes Zeitfenster';
  }
  if (inactiveState) {
    return 'Zurzeit geschlossen';
  }
  if (isConnectedSession) {
    return 'Live-Warteraum';
  }
  if (isJoining) {
    return 'Prüfung läuft';
  }
  if (isPromptSession) {
    return 'Jetzt Live';
  }
  return 'Mytopia Live';
}

function getSignalDetail({
  hasError,
  inactiveState,
  isJoining,
  isPromptSession,
}: {
  hasError: boolean;
  inactiveState: { nextWindow?: LiveAvailabilityDto['nextWindow'] | null; state: 'upcoming' | 'unavailable' } | null;
  isJoining: boolean;
  isPromptSession: boolean;
}) {
  if (hasError) {
    return 'Live-Zugang im Theater';
  }
  if (inactiveState?.state === 'upcoming') {
    return 'Das nächste Zeitfenster wird automatisch geprüft.';
  }
  if (inactiveState) {
    return 'Zurzeit ist kein Live-Zugang geöffnet.';
  }
  if (isJoining) {
    return 'Zeitfenster und Standort werden geprüft.';
  }
  if (isPromptSession) {
    return 'Live-Zugang im Theater';
  }
  return 'Live-Verbindung wird vorbereitet.';
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
  isJoining,
  isPromptSession,
  session,
}: {
  hasError: boolean;
  inactiveState: { nextWindow?: LiveAvailabilityDto['nextWindow'] | null; state: 'upcoming' | 'unavailable' } | null;
  isJoining: boolean;
  isPromptSession: boolean;
  session: boolean;
}) {
  if (isPromptSession && hasError) {
    return 'Schließe dieses Fenster ruhig. Die Live-Leiste bleibt während des Zeitfensters sichtbar, sobald du vor Ort bist.';
  }
  if (isPromptSession) {
    return 'Wenn du gerade im Theater bist, kannst du dich mit der laufenden Vorstellung verbinden. Du kannst dieses Fenster schließen und jederzeit zurückkehren.';
  }
  if (inactiveState?.state === 'upcoming' && inactiveState.nextWindow?.startsAt) {
    return `Die nächste Live-Interaktion ist ab ${formatWindowTime(inactiveState.nextWindow.startsAt)} möglich.`;
  }
  if (inactiveState) {
    return 'Im Moment ist keine Live-Interaktion verfügbar. Du kannst die App normal weiter nutzen.';
  }
  if (hasError) {
    return 'Die Live-Verbindung konnte gerade nicht bestätigt werden. Bitte versuche es vor Ort noch einmal.';
  }
  if (session) {
    return 'Du bist im Live-Warteraum. Sobald die Bühne ein Signal sendet, erscheint es automatisch in der App.';
  }
  if (isJoining) {
    return 'Wir prüfen kurz das Zeitfenster und deinen Standort.';
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

function logLiveSessionDebug(message: string, details?: Record<string, unknown>) {
  if (__DEV__) {
    console.info(`[live/session] ${message}`, details ?? {});
  }
}

const styles = StyleSheet.create({
  actions: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 4,
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
    backgroundColor: theme.colors.cardSubtleBackground,
    borderColor: theme.colors.cardBorder,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 20,
  },
  copyBlock: {
    alignItems: 'center',
    gap: 12,
  },
  devNotice: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    borderColor: 'rgba(249, 115, 22, 0.32)',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  devNoticeText: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  devNoticeTitle: {
    color: theme.colors.orange,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  dismissButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.08)',
    borderColor: 'rgba(216, 222, 232, 0.18)',
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  dismissButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  dismissRow: {
    alignItems: 'flex-end',
    alignSelf: 'stretch',
  },
  error: {
    color: theme.colors.destructiveText,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 14,
    textAlign: 'center',
  },
  errorBox: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.destructiveSurface,
    borderColor: theme.colors.destructiveBorder,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  heading: {
    color: theme.colors.textPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
  modalContent: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: 14,
    maxWidth: 360,
    width: '100%',
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 30,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 13,
  },
  panel: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(248, 250, 252, 0.06)',
    borderColor: 'rgba(216, 222, 232, 0.14)',
    borderRadius: 8,
    borderWidth: 1,
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  returnButton: {
    width: '100%',
  },
  secondaryAction: {
    width: '100%',
  },
  signalCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(248, 250, 252, 0.06)',
    borderColor: 'rgba(216, 222, 232, 0.14)',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 104,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  signalDetail: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  signalDot: {
    backgroundColor: theme.colors.orange,
    borderRadius: 999,
    height: 13,
    shadowColor: theme.colors.orange,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    width: 13,
  },
  signalLabel: {
    color: theme.colors.textPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 18,
    lineHeight: 23,
  },
  signalMark: {
    alignItems: 'center',
    backgroundColor: 'rgba(249, 115, 22, 0.08)',
    borderColor: 'rgba(249, 115, 22, 0.25)',
    borderRadius: 999,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  signalMeta: {
    alignItems: 'center',
    backgroundColor: 'rgba(177, 194, 210, 0.1)',
    borderColor: 'rgba(177, 194, 210, 0.18)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  signalMetaText: {
    color: theme.colors.accent,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 11,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  signalRing: {
    alignItems: 'center',
    backgroundColor: 'rgba(249, 115, 22, 0.14)',
    borderColor: 'rgba(249, 115, 22, 0.36)',
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  signalTextBlock: {
    flex: 1,
    gap: 3,
    minWidth: 0,
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
    backgroundColor: '#f59e0b',
  },
  statusDotError: {
    backgroundColor: theme.colors.destructiveText,
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
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderColor: 'rgba(34, 197, 94, 0.28)',
  },
  statusPillConnecting: {
    backgroundColor: 'rgba(249, 115, 22, 0.08)',
    borderColor: 'rgba(249, 115, 22, 0.3)',
  },
  statusPillError: {
    backgroundColor: 'rgba(254, 242, 242, 0.08)',
    borderColor: 'rgba(252, 165, 165, 0.3)',
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
    color: '#22c55e',
  },
  statusTextConnecting: {
    color: '#f59e0b',
  },
  statusTextError: {
    color: theme.colors.destructiveText,
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
