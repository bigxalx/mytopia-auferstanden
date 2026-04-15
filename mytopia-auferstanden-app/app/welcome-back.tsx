import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import { AppButton } from '@/src/shared/ui/AppButton';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { theme } from '@/src/shared/ui/theme';

export default function WelcomeBackScreen() {
  const router = useRouter();
  const { dismissWelcomeBack, user } = useSession();

  if (!user || !user.legacySummary) {
    return null;
  }

  const rankText = user.legacySummary.rankSnapshot > 0 ? `#${user.legacySummary.rankSnapshot}` : 'n/a';

  function continueToFeed() {
    dismissWelcomeBack();
    router.replace('/(tabs)/feed');
  }

  return (
    <Screen title="Willkommen zurück bei Mytopia">
      <SectionCard
        title="Frühere Zusammenfassung"
        description="Diese Übersicht dient der Kontinuität und hat keinen Einfluss auf die Rangliste der neuen Saison."
      >
        <View style={styles.row}>
          <Text style={styles.label}>Frühere Gesamtpunktzahl</Text>
          <Text style={styles.value}>{user.legacySummary.totalPoints}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Früherer Rang</Text>
          <Text style={styles.value}>{rankText}</Text>
        </View>
      </SectionCard>

      <SectionCard title="Wie es weitergeht">
        <Text style={styles.body}>
          Deine alte Punktzahl wird nur als Referenz gespeichert. Alle Wettbewerbe in dieser App basieren auf den neuen v2-Saisondaten.
        </Text>
        <AppButton fullWidth label="Weiter zum Feed" onPress={continueToFeed} variant="primary" />
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    color: theme.colors.cardTextSecondary,
    flex: 1,
    fontSize: 13,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  value: {
    color: theme.colors.cardTextPrimary,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
});
