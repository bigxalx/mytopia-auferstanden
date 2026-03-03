import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';

export function WelcomeBackScreen() {
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
    <Screen
      title="Welcome back to Mytopia"
      subtitle="We found your legacy progress and imported a continuity snapshot."
    >
      <SectionCard
        title="Legacy summary"
        description="This snapshot is for continuity and does not affect the new season ranking."
      >
        <View style={styles.row}>
          <Text style={styles.label}>Legacy total points</Text>
          <Text style={styles.value}>{user.legacySummary.totalPoints}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Legacy rank snapshot</Text>
          <Text style={styles.value}>{rankText}</Text>
        </View>
      </SectionCard>

      <SectionCard title="What happens next">
        <Text style={styles.body}>
          Your old score is stored as context only. All competition in this app starts from the new v2 season data.
        </Text>
        <Pressable accessibilityRole="button" onPress={continueToFeed} style={styles.button}>
          <Text style={styles.buttonText}>Continue to feed</Text>
        </Pressable>
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: '#1f2937',
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#101828',
    borderRadius: 10,
    marginTop: 6,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  label: {
    color: '#5d6979',
    flex: 1,
    fontSize: 13,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  value: {
    color: '#101828',
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
});
