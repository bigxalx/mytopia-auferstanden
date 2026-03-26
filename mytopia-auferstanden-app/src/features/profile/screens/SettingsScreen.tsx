import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { theme } from '@/src/shared/ui/theme';
import { PrivacyManager } from '@/src/core/firebase/privacyManager';

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
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';

export function SettingsScreen() {
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
  const [telemetryEnabled, setTelemetryEnabled] = useState(false);

  useEffect(() => {
    void PrivacyManager.getConsent().then(setTelemetryEnabled);
  }, []);

  const otaVersion = Constants.expoConfig?.extra?.otaVersion ?? Constants.expoConfig?.version ?? 'Unavailable';

  useEffect(() => {
    if (selectedMode === 'dev') {
      void getFCMToken().then(setFcmToken);
    }
  }, [selectedMode]);

  if (!user) {
    return (
      <Screen title="Einstellungen" headerShown={false}>
        <SectionCard title="Keine aktive Sitzung">
          <Text style={styles.body}>Melde dich an, um auf die Einstellungen zuzugreifen.</Text>
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

  const handleToggleTelemetry = async (value: boolean) => {
    setTelemetryEnabled(value);
    await PrivacyManager.setTelemetryConsent(value);

    if (value) {
      Alert.alert(
        'Diagnose aktiviert',
        'Vielen Dank! Damit die Änderungen vollständig übernommen werden, starte die App bitte einmal neu.',
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <Screen
      title="Einstellungen"
      headerShown={false}
    >
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
          style={StyleSheet.flatten([styles.deleteAccountButton, isDeletingAccount && styles.modeButtonDisabled])}>
          <Text style={styles.deleteAccountText}>
            {isDeletingAccount ? 'Konto wird gelöscht...' : 'Konto löschen'}
          </Text>
        </Pressable>
      </SectionCard>

      <SectionCard title="Privatsphäre">
        <View style={styles.switchRow}>
          <View style={styles.switchTextContainer}>
            <Text style={styles.label}>Crashberichte & Diagnose</Text>
            <Text style={styles.body}>Hilf uns, die App zu verbessern, indem du anonyme Berichte bei App-Abstürzen teilst.</Text>
          </View>
          <Switch
            value={telemetryEnabled}
            onValueChange={handleToggleTelemetry}
            trackColor={{ false: theme.colors.cardBorder, true: theme.colors.orange }}
            thumbColor="#fff"
          />
        </View>
      </SectionCard>

      {canUseDevMode && (
        <SectionCard title="Mode">
          <View style={styles.modeRow}>
            <Pressable
              onPress={() => setSelectedMode('production')}
              style={StyleSheet.flatten([styles.modeButton, selectedMode === 'production' && styles.modeButtonActive])}>
              <Text
                style={StyleSheet.flatten([
                  styles.modeButtonLabel,
                  selectedMode === 'production' && styles.modeButtonLabelActive,
                ])}>
                Production
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSelectedMode('dev')}
              style={StyleSheet.flatten([styles.modeButton, selectedMode === 'dev' && styles.modeButtonActive])}>
              <Text style={StyleSheet.flatten([styles.modeButtonLabel, selectedMode === 'dev' && styles.modeButtonLabelActive])}>
                Dev
              </Text>
            </Pressable>
          </View>
        </SectionCard>
      )}

      {selectedMode === 'dev' && (
        <SectionCard title="Push registration">
          <View style={styles.row}>
            <Text style={styles.label}>FCM Token</Text>
            <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">
              {fcmToken ?? 'Fetching…'}
            </Text>
          </View>
          {fcmToken && (
            <Pressable onPress={handleCopyToken} style={StyleSheet.flatten([styles.modeButton, styles.copyButton])}>
              <Text style={styles.modeButtonLabel}>
                {hasCopied ? 'Copied!' : 'Copy token'}
              </Text>
            </Pressable>
          )}
        </SectionCard>
      )}

      {canUseDevMode && (
        <SectionCard title="App update">
          <View style={styles.row}>
            <Text style={styles.label}>Requested JS channel</Text>
            <Text style={styles.value}>{requestedChannel}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Runtime version</Text>
            <Text style={styles.value}>{runtimeVersion ?? 'Unavailable'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>App version (OTA)</Text>
            <Text style={styles.value}>{otaVersion}</Text>
          </View>
          <Text style={styles.body}>{updatesSummary}</Text>
          {updatesError && <Text style={styles.errorText}>{updatesError}</Text>}
          <View style={styles.modeRow}>
            <Pressable
              disabled={!updatesEnabled || updatesState.isChecking || updatesState.isDownloading || updatesState.isRestarting}
              onPress={handleCheckForUpdates}
              style={StyleSheet.flatten([
                styles.modeButton,
                (!updatesEnabled || updatesState.isChecking || updatesState.isDownloading || updatesState.isRestarting)
                  && styles.modeButtonDisabled,
              ])}>
              <Text style={styles.modeButtonLabel}>
                {updatesState.isChecking || updatesState.isDownloading ? 'Checking…' : 'Check now'}
              </Text>
            </Pressable>
            {updatesState.isUpdatePending && (
              <Pressable 
                onPress={handleApplyUpdate} 
                style={StyleSheet.flatten([styles.modeButton, styles.modeButtonActive])}
              >
                <Text style={StyleSheet.flatten([styles.modeButtonLabel, styles.modeButtonLabelActive])}>Apply now</Text>
              </Pressable>
            )}
          </View>
        </SectionCard>
      )}

      <Pressable onPress={signOut} style={styles.signOutButton}>
        <Text style={styles.signOutText}>Abmelden</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  signOutButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.headerBackground,
    borderColor: theme.colors.headerBorder,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    marginTop: 20,
  },
  signOutText: {
    color: theme.colors.destructiveBorder,
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    color: theme.colors.errorText,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 10,
  },
  successText: {
    color: theme.colors.successText,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 10,
  },
  label: {
    color: theme.colors.cardTextSecondary,
    flex: 1,
    fontSize: 13,
  },
  deleteAccountButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.destructiveSurface,
    borderColor: theme.colors.destructiveBorder,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 10,
  },
  deleteAccountText: {
    color: theme.colors.destructiveText,
    fontSize: 13,
    fontWeight: '700',
  },
  modeButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.cardSubtleBackground,
    borderColor: theme.colors.cardBorder,
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
    color: theme.colors.cardTextSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  modeButtonLabelActive: {
    color: theme.colors.cardTextPrimary,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  switchTextContainer: {
    flex: 1,
    marginRight: 15,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  copyButton: {
    marginTop: 8,
  },
  value: {
    color: theme.colors.cardTextPrimary,
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
