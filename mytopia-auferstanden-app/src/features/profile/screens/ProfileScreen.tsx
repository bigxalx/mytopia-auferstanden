import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { theme } from '@/src/shared/ui/theme';

import { deleteCurrentUserAccount } from '@/src/core/firebase/accountDeletionClient';
import { useSession } from '@/src/core/session/SessionContext';
import { getFCMToken } from '@/src/core/firebase/messagingClient';
import {
  checkAndFetchExpoUpdate,
  getExpoRuntimeVersion,
  isExpoUpdatesEnabled,
  reloadToApplyExpoUpdate,
  useExpoUpdatesState,
} from '@/src/core/updates/expoUpdatesClient';
import { resolveExpoUpdateChannel } from '@/src/core/updates/expoUpdateChannel';
import { MissionsCard } from '@/src/features/tasks/components/MissionsCard';
import { RankingSummaryCard } from '@/src/features/profile/components/RankingSummaryCard';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';

export function ProfileScreen() {
  const { canUseDevMode, selectedMode, setSelectedMode, signOut, user } = useSession();
  const [accountFeedback, setAccountFeedback] = useState<{ message: string; tone: 'error' | 'success' } | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const updatesState = useExpoUpdatesState();
  const updatesEnabled = isExpoUpdatesEnabled();
  const runtimeVersion = getExpoRuntimeVersion();
  const requestedChannel = resolveExpoUpdateChannel(selectedMode, canUseDevMode);
  const [updatesError, setUpdatesError] = useState<string | null>(null);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (selectedMode === 'dev') {
      void getFCMToken().then(setFcmToken);
    }
  }, [selectedMode]);

  if (!user) {
    return (
      <Screen title="Profil" subtitle="Nicht angemeldet" headerShown={false}>
        <SectionCard title="Keine aktive Sitzung">
          <Text style={styles.body}>Melde dich an, um auf das Profil und die Rangliste zuzugreifen.</Text>
        </SectionCard>
      </Screen>
    );
  }

  const updatesSummary = updatesEnabled
    ? updatesState.isUpdatePending
      ? 'A JS update has been downloaded and is ready to apply.'
      : updatesState.isChecking || updatesState.isDownloading
        ? 'Checking for a JS update on the selected channel.'
        : updatesState.currentlyRunning.isEmbeddedLaunch
          ? 'Running the embedded bundle from the installed native build.'
          : 'Running a downloaded JS update.'
    : 'Expo Updates are disabled in local development builds. Install a Fastlane-built TestFlight or Play build to receive JS-only updates.';

  async function handleCheckForUpdates() {
    setUpdatesError(null);

    try {
      await checkAndFetchExpoUpdate(requestedChannel);
    } catch (error) {
      setUpdatesError(formatUpdatesError(error));
    }
  }

  async function handleApplyUpdate() {
    setUpdatesError(null);

    try {
      await reloadToApplyExpoUpdate();
    } catch (error) {
      setUpdatesError(formatUpdatesError(error));
    }
  }

  async function handleCopyToken() {
    if (fcmToken) {
      await Clipboard.setStringAsync(fcmToken);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Konto löschen',
      'Dein Konto und alle zugeordneten Daten werden dauerhaft gelöscht. Dieser Schritt kann nicht rückgängig gemacht werden.',
      [
        {
          style: 'cancel',
          text: 'Abbrechen',
        },
        {
          style: 'destructive',
          text: 'Löschen',
          onPress: () => {
            void confirmDeleteAccount();
          },
        },
      ]
    );
  }

  async function confirmDeleteAccount() {
    setAccountFeedback(null);
    setIsDeletingAccount(true);

    try {
      await deleteCurrentUserAccount();
      await signOut();
    } catch (error) {
      setAccountFeedback({
        message: error instanceof Error ? error.message : 'Konto konnte nicht gelöscht werden.',
        tone: 'error',
      });
    } finally {
      setIsDeletingAccount(false);
    }
  }

  return (
    <Screen title="Profil" headerShown={false}>
      {/* Missions section — first */}
      <MissionsCard userId={user.id} mode={selectedMode} />

      <SectionCard title="Account">
        <View style={styles.row}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{user.displayName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>E‑Mail</Text>
          <Text style={styles.value}>{user.email}</Text>
        </View>
        {accountFeedback ? (
          <Text style={accountFeedback.tone === 'error' ? styles.errorText : styles.successText}>
            {accountFeedback.message}
          </Text>
        ) : null}
        <Pressable
          disabled={isDeletingAccount}
          onPress={handleDeleteAccount}
          style={[styles.deleteAccountButton, isDeletingAccount ? styles.modeButtonDisabled : null]}>
          <Text style={styles.deleteAccountText}>
            {isDeletingAccount ? 'Konto wird gelöscht...' : 'Konto löschen'}
          </Text>
        </Pressable>
      </SectionCard>

      <RankingSummaryCard user={user} />

      {canUseDevMode ? (
        <SectionCard title="Mode">
          <View style={styles.modeRow}>
            <Pressable
              onPress={() => setSelectedMode('production')}
              style={[styles.modeButton, selectedMode === 'production' ? styles.modeButtonActive : null]}>
              <Text
                style={[
                  styles.modeButtonLabel,
                  selectedMode === 'production' ? styles.modeButtonLabelActive : null,
                ]}>
                Production
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSelectedMode('dev')}
              style={[styles.modeButton, selectedMode === 'dev' ? styles.modeButtonActive : null]}>
              <Text style={[styles.modeButtonLabel, selectedMode === 'dev' ? styles.modeButtonLabelActive : null]}>
                Dev
              </Text>
            </Pressable>
          </View>
        </SectionCard>
      ) : null}

      {selectedMode === 'dev' && (
        <SectionCard title="Push registration">
          <View style={styles.row}>
            <Text style={styles.label}>FCM Token</Text>
            <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">
              {fcmToken ?? 'Fetching…'}
            </Text>
          </View>
          {fcmToken && (
            <Pressable onPress={handleCopyToken} style={[styles.modeButton, styles.copyButton]}>
              <Text style={styles.modeButtonLabel}>
                {hasCopied ? 'Copied!' : 'Copy token'}
              </Text>
            </Pressable>
          )}
        </SectionCard>
      )}

      {canUseDevMode ? (
        <SectionCard title="App update">
          <View style={styles.row}>
            <Text style={styles.label}>Requested JS channel</Text>
            <Text style={styles.value}>{requestedChannel}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Runtime version</Text>
            <Text style={styles.value}>{runtimeVersion ?? 'Unavailable'}</Text>
          </View>
          <Text style={styles.body}>{updatesSummary}</Text>
          {updatesError ? <Text style={styles.errorText}>{updatesError}</Text> : null}
          <View style={styles.modeRow}>
            <Pressable
              disabled={!updatesEnabled || updatesState.isChecking || updatesState.isDownloading || updatesState.isRestarting}
              onPress={handleCheckForUpdates}
              style={[
                styles.modeButton,
                !updatesEnabled || updatesState.isChecking || updatesState.isDownloading || updatesState.isRestarting
                  ? styles.modeButtonDisabled
                  : null,
              ]}>
              <Text style={styles.modeButtonLabel}>
                {updatesState.isChecking || updatesState.isDownloading ? 'Checking…' : 'Check now'}
              </Text>
            </Pressable>
            {updatesState.isUpdatePending ? (
              <Pressable onPress={handleApplyUpdate} style={[styles.modeButton, styles.modeButtonActive]}>
                <Text style={[styles.modeButtonLabel, styles.modeButtonLabelActive]}>Apply now</Text>
              </Pressable>
            ) : null}
          </View>
        </SectionCard>
      ) : null}

      <Pressable onPress={signOut} style={styles.signOutButton}>
        <Text style={styles.signOutText}>Abmelden</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 10,
  },
  successText: {
    color: '#86efac',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 10,
  },
  label: {
    color: theme.colors.textSecondary,
    flex: 1,
    fontSize: 13,
  },
  deleteAccountButton: {
    alignItems: 'center',
    backgroundColor: '#3f1d1d',
    borderColor: '#7f1d1d',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 10,
  },
  deleteAccountText: {
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '700',
  },
  modeButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.headerBackground,
    borderColor: theme.colors.headerBorder,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  modeButtonActive: {
    backgroundColor: theme.colors.orange,
    borderColor: theme.colors.orange,
  },
  modeButtonDisabled: {
    opacity: 0.5,
  },
  modeButtonLabel: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  modeButtonLabelActive: {
    color: '#111827',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  copyButton: {
    marginTop: 8,
  },
  signOutButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.headerBackground,
    borderColor: theme.colors.headerBorder,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
  },
  signOutText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
  value: {
    color: theme.colors.textPrimary,
    flex: 2,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
});


function formatUpdatesError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Unable to complete the update action right now.';
}
