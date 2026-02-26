import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import { RankingSummaryCard } from '@/src/features/profile/components/RankingSummaryCard';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';

export function ProfileScreen() {
  const { signOut, user } = useSession();

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
    <Screen title="Profile & Ranking" subtitle="Feature baseline for private profile and season ranking view.">
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
