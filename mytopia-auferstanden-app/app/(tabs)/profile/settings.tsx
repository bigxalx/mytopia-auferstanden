import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';

import { deleteCurrentUserAccount } from '@/src/core/firebase/accountDeletionClient';
import { PrivacyManager } from '@/src/core/firebase/privacyManager';
import { useSession } from '@/src/core/session/SessionContext';
import { getExpoRuntimeVersion } from '@/src/core/updates/expoUpdatesClient';
import { AppButton } from '@/src/shared/ui/AppButton';
import { Screen } from '@/src/shared/ui/Screen';
import { SurfaceCard } from '@/src/shared/ui/SurfaceCard';
import { theme } from '@/src/shared/ui/theme';

export default function SettingsScreen() {
  const { canUseDevMode, selectedMode, setSelectedMode, signOut, user } = useSession();
  const [accountFeedback, setAccountFeedback] = useState<{ message: string; tone: 'error' | 'success' } | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [telemetryEnabled, setTelemetryEnabled] = useState(false);
  const runtimeVersion = getExpoRuntimeVersion();
  const otaVersion = Constants.expoConfig?.extra?.otaVersion ?? Constants.expoConfig?.version ?? 'Unavailable';

  useEffect(() => {
    void PrivacyManager.getConsent().then(setTelemetryEnabled);
  }, []);

  if (!user) {
    return (
      <Screen title="Einstellungen" headerShown={false}>
        <SurfaceCard>
          <Text style={styles.emptyTitle}>Keine aktive Sitzung</Text>
          <Text style={styles.body}>Melde dich an, um auf die Einstellungen zuzugreifen.</Text>
        </SurfaceCard>
      </Screen>
    );
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

  function handleDeleteAccount() {
    Alert.alert(
      'Konto löschen',
      'Dein Konto und alle zugeordneten Daten werden dauerhaft gelöscht. Dieser Schritt kann nicht rückgängig gemacht werden.',
      [
        { style: 'cancel', text: 'Abbrechen' },
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
    <Screen title="Einstellungen" headerShown={false}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>
        <SurfaceCard style={styles.accountCard}>
          <View style={styles.accountContent}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>E-Mail</Text>
              <Text numberOfLines={1} style={styles.rowValue}>
                {user.email}
              </Text>
            </View>

            {accountFeedback ? (
              <Text style={accountFeedback.tone === 'error' ? styles.errorText : styles.successText}>
                {accountFeedback.message}
              </Text>
            ) : null}
          </View>

          <View style={styles.separator} />
          <ActionRow
            label="Abmelden"
            onPress={() => {
              void signOut();
            }}
          />
          <View style={styles.separator} />
          <ActionRow
            danger
            disabled={isDeletingAccount}
            label={isDeletingAccount ? 'Konto wird gelöscht...' : 'Konto löschen'}
            onPress={handleDeleteAccount}
          />
        </SurfaceCard>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Crashberichte & Diagnose</Text>
        <SurfaceCard>
          <View style={styles.switchRow}>
            <View style={styles.switchTextContainer}>
              <Text style={styles.switchTitle}>Crashberichte & Diagnose</Text>
              <Text style={styles.body}>
                Hilf uns, die App zu verbessern, indem du anonyme Berichte bei App-Abstürzen teilst.
              </Text>
            </View>
            <Switch
              onValueChange={handleToggleTelemetry}
              thumbColor="#fff"
              trackColor={{ false: 'rgba(255,255,255,0.16)', true: theme.colors.orange }}
              value={telemetryEnabled}
            />
          </View>
        </SurfaceCard>
      </View>

      {canUseDevMode ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Mode</Text>
          <SurfaceCard>
            <View style={styles.modeRow}>
              <AppButton
                fullWidth
                label="Production"
                onPress={() => setSelectedMode('production')}
                style={styles.modeButton}
                variant={selectedMode === 'production' ? 'primary' : 'secondary'}
              />
              <AppButton
                fullWidth
                label="Dev"
                onPress={() => setSelectedMode('dev')}
                style={styles.modeButton}
                variant={selectedMode === 'dev' ? 'primary' : 'secondary'}
              />
            </View>
          </SurfaceCard>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Hilfe und Support</Text>
        <SurfaceCard style={styles.supportCard}>
          <SupportRow label="Datenschutz" onPress={() => Linking.openURL('https://mytopia.world/privacy')} />
          <View style={styles.separator} />
          <SupportRow label="Impressum" onPress={() => Linking.openURL('https://mytopia.world')} />
        </SurfaceCard>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>Über</Text>
        <Text style={styles.footerMeta}>
          {runtimeVersion ?? 'Unavailable'} | {otaVersion}
        </Text>
        <Text style={styles.footerText}>
          Designed und entwickelt von{' '}
          <Text style={styles.footerLink} onPress={() => Linking.openURL('https://arminluschin.com')}>
            Armin Luschin
          </Text>{' '}
          im Auftrag des{' '}
          <Text style={styles.footerLink} onPress={() => Linking.openURL('https://theater-altenburg-gera.de/')}>
            Theater Altenburg Gera
          </Text>
        </Text>
      </View>
    </Screen>
  );
}

function SupportRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.supportRow, pressed && styles.supportRowPressed]}>
      <Text style={styles.supportLabel}>{label}</Text>
      <MaterialIcons color={theme.colors.textSecondary} name="open-in-new" size={18} />
    </Pressable>
  );
}

function ActionRow({
  danger = false,
  disabled = false,
  label,
  onPress,
}: {
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.supportRow,
        pressed && !disabled ? styles.supportRowPressed : null,
        disabled ? styles.rowDisabled : null,
      ]}
    >
      <Text style={[styles.supportLabel, danger ? styles.dangerLabel : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  accountCard: {
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  accountContent: {
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  body: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  dangerLabel: {
    color: theme.colors.destructiveBorder,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 18,
  },
  errorText: {
    color: '#fca5a5',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 13,
  },
  footer: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingTop: 8,
  },
  footerLabel: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  footerLink: {
    color: theme.colors.textPrimary,
    textDecorationLine: 'underline',
  },
  footerMeta: {
    color: theme.colors.textPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 14,
    textAlign: 'center',
  },
  footerText: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  modeButton: {
    flex: 1,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowLabel: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
    textTransform: 'uppercase',
    width: 64,
  },
  rowValue: {
    color: theme.colors.textPrimary,
    flex: 1,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 15,
    textAlign: 'right',
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  separator: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    height: StyleSheet.hairlineWidth,
  },
  successText: {
    color: '#86efac',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 13,
  },
  supportCard: {
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  supportLabel: {
    color: theme.colors.textPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 15,
  },
  supportRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  supportRowPressed: {
    opacity: 0.9,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  switchTextContainer: {
    flex: 1,
    gap: 4,
  },
  switchTitle: {
    color: theme.colors.textPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 15,
  },
});
