import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import { RankingSummaryCard } from '@/src/features/profile/components/RankingSummaryCard';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';

export function ProfileScreen() {
  const { canUseDevMode, selectedMode, setSelectedMode, signOut, user } = useSession();

  if (!user) {
    return (
      <Screen title="Profile" subtitle="Not signed in">
        <SectionCard title="No active session">
          <Text style={styles.body}>Use the sign-in flow to access profile and ranking views.</Text>
        </SectionCard>
      </Screen>
    );
  }

  return (
    <Screen
      title="Profile & Ranking"
      subtitle={
        selectedMode === 'dev'
          ? 'DEV MODE ACTIVE'
          : 'Feature baseline for private profile and season ranking view.'
      }>
      <SectionCard title="Account">
        <View style={styles.row}>
          <Text style={styles.label}>Display name</Text>
          <Text style={styles.value}>{user.displayName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user.email}</Text>
        </View>
      </SectionCard>
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
      <RankingSummaryCard user={user} />
      <Pressable onPress={signOut} style={styles.signOutButton}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: '#1f2937',
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    color: '#5d6979',
    flex: 1,
    fontSize: 13,
  },
  modeButton: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#d8dee8',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  modeButtonActive: {
    backgroundColor: '#f97316',
    borderColor: '#f97316',
  },
  modeButtonLabel: {
    color: '#364152',
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
  },
  signOutButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#d8dee8',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
  },
  signOutText: {
    color: '#a12b2b',
    fontSize: 15,
    fontWeight: '600',
  },
  value: {
    color: '#101828',
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
});
