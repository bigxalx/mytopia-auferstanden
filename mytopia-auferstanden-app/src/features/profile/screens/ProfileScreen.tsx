import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, Text } from 'react-native';
import { theme } from '@/src/shared/ui/theme';

import { useSession } from '@/src/core/session/SessionContext';
import { MissionsCard } from '@/src/features/tasks/components/MissionsCard';
import { RankingSummaryCard } from '@/src/features/profile/components/RankingSummaryCard';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';

export function ProfileScreen() {
  const { selectedMode, user } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleMissionsRefreshComplete = useCallback(() => {
    setRefreshing(false);
  }, []);

  if (!user) {
    return (
      <Screen title="Profil" subtitle="Nicht angemeldet" headerShown={false}>
        <SectionCard title="Keine aktive Sitzung">
          <Text style={styles.body}>Melde dich an, um auf das Profil und die Rangliste zuzugreifen.</Text>
        </SectionCard>
      </Screen>
    );
  }

  return (
    <Screen
      title="Profil"
      headerShown={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.orange}
          colors={[theme.colors.orange]}
        />
      }
    >
      {/* Missions section — first */}
      <MissionsCard
        userId={user.id}
        mode={selectedMode}
        refreshTrigger={refreshTrigger}
        onRefreshComplete={handleMissionsRefreshComplete}
      />

      <RankingSummaryCard user={user} refreshTrigger={refreshTrigger} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
