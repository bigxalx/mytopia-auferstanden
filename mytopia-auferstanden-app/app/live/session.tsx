import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useSession } from '@/src/core/session/SessionContext';
import type { AppMode } from '@/src/core/session/appMode';
import { useLiveSession } from '@/src/features/live/data/LiveSessionContext';
import { AppButton } from '@/src/shared/ui/AppButton';
import { Screen } from '@/src/shared/ui/Screen';
import { theme } from '@/src/shared/ui/theme';

export default function LiveSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string;
    sessionId?: string;
    token?: string;
  }>();
  const { isHydrated, selectedMode, user } = useSession();
  const { connectionStatus, errorMessage, joinFromQr, session } = useLiveSession();
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const attemptedKeyRef = useRef<string | null>(null);
  const hadLiveSessionRef = useRef(false);

  const sessionId = firstParam(params.sessionId);
  const token = firstParam(params.token);
  const mode = normalizeMode(firstParam(params.mode)) ?? selectedMode;
  const attemptKey = useMemo(
    () => sessionId && token ? `${mode}:${sessionId}:${token}` : null,
    [mode, sessionId, token]
  );

  useEffect(() => {
    if (!isHydrated || !user || !attemptKey || !sessionId || !token) {
      return;
    }

    if (attemptedKeyRef.current === attemptKey) {
      return;
    }
    attemptedKeyRef.current = attemptKey;

    setIsJoining(true);
    setJoinError(null);
    joinFromQr({ mode, sessionId, token })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Live-Session konnte nicht geöffnet werden.';
        if (isEndedSessionError(message)) {
          router.replace('/(tabs)');
          return;
        }
        setJoinError(message);
      })
      .finally(() => setIsJoining(false));
  }, [attemptKey, isHydrated, joinFromQr, mode, router, sessionId, token, user]);

  useEffect(() => {
    if (session) {
      hadLiveSessionRef.current = true;
    }
  }, [session]);

  const visibleError = joinError ?? errorMessage;

  useEffect(() => {
    if (!isHydrated || !user || session || isJoining || visibleError) {
      return;
    }

    if (attemptKey && !hadLiveSessionRef.current) {
      return;
    }

    router.replace('/(tabs)');
  }, [attemptKey, isHydrated, isJoining, router, session, user, visibleError]);

  if (!isHydrated) {
    return (
      <Screen centerContent title="Live">
        <ActivityIndicator color={theme.colors.orange} size="large" />
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen title="Live">
        <View style={styles.card}>
          <Text style={styles.heading}>Anmeldung erforderlich</Text>
          <Text style={styles.body}>Melde dich an, um der Live-Session beizutreten.</Text>
          <AppButton label="Anmelden" onPress={() => router.replace('/(auth)/sign-in')} />
        </View>
      </Screen>
    );
  }

  if (!session && !visibleError) {
    return (
      <Screen centerContent scrollable={false} title="Live">
        <ActivityIndicator color={theme.colors.orange} size="large" />
      </Screen>
    );
  }

  return (
    <Screen centerContent scrollable={false} title="Live">
      <View style={styles.hero}>
        <View style={styles.statusShell}>
          <View style={styles.statusHalo}>
            <View style={[
              styles.statusDot,
              visibleError
                ? styles.statusOffline
                : connectionStatus === 'connected'
                ? styles.statusConnected
                : connectionStatus === 'connecting'
                  ? styles.statusConnecting
                  : styles.statusOffline,
            ]} />
          </View>
        </View>
        <Text style={[
          styles.statusText,
          visibleError
            ? styles.statusTextError
            : connectionStatus === 'connected'
              ? styles.statusTextConnected
              : styles.statusTextConnecting,
        ]}>
          {visibleError ? 'Live-Fehler' : formatConnectionStatus(connectionStatus)}
        </Text>
        <Text style={styles.heading}>{visibleError ? 'Verbindung prüfen' : session?.title ?? 'Mytopia Live'}</Text>
        <Text style={styles.body}>{getWaitingCopy({ hasError: Boolean(visibleError), isJoining, session: Boolean(session) })}</Text>
        {visibleError ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{visibleError}</Text>
          </View>
        ) : null}
        {isJoining ? <ActivityIndicator color={theme.colors.orange} style={styles.spinner} /> : null}
        {session || visibleError ? (
          <AppButton
            fullWidth
            label="Zur App"
            onPress={() => router.replace('/(tabs)')}
            style={styles.returnButton}
            variant="secondary"
          />
        ) : null}
      </View>
    </Screen>
  );
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeMode(value: string | undefined): AppMode | null {
  return value === 'dev' ? 'dev' : value === 'production' ? 'production' : null;
}

function isEndedSessionError(message: string) {
  return message.includes('Live session is not active')
    || message.includes('Live session has ended')
    || message.includes('Live session is no longer current')
    || message.includes('(404)');
}

function formatConnectionStatus(status: 'connecting' | 'connected' | 'offline') {
  if (status === 'connected') return 'Live verbunden';
  if (status === 'connecting') return 'Verbinde...';
  return 'Offline';
}

function getWaitingCopy({ hasError, isJoining, session }: { hasError: boolean; isJoining: boolean; session: boolean }) {
  if (hasError) {
    return 'Die Live-Verbindung konnte gerade nicht bestätigt werden.';
  }
  if (session) {
    return 'Du bist verbunden. Warte auf das nächste Signal oder kehre zur App zurück.';
  }
  if (isJoining) {
    return 'Live-Session wird geöffnet...';
  }
  return 'Live-Verbindung wird vorbereitet...';
}

const styles = StyleSheet.create({
  body: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 340,
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
    fontFamily: 'Nunito_700Bold',
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  hero: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: 14,
    maxWidth: 360,
    paddingHorizontal: 6,
    width: '100%',
  },
  returnButton: {
    marginTop: 8,
    width: '100%',
  },
  spinner: {
    marginTop: 2,
  },
  statusConnected: {
    backgroundColor: '#22c55e',
  },
  statusConnecting: {
    backgroundColor: '#f59e0b',
  },
  statusDot: {
    borderColor: 'rgba(255, 255, 255, 0.82)',
    borderRadius: 999,
    borderWidth: 3,
    height: 30,
    width: 30,
  },
  statusHalo: {
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderRadius: 999,
    height: 92,
    justifyContent: 'center',
    width: 92,
  },
  statusOffline: {
    backgroundColor: '#dc2626',
  },
  statusShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 999,
    borderWidth: 1,
    height: 122,
    justifyContent: 'center',
    width: 122,
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
});
