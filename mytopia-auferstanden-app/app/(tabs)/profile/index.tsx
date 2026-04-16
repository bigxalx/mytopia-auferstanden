import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link, Stack } from 'expo-router';

import { theme } from '@/src/shared/ui/theme';
import { useSession } from '@/src/core/session/SessionContext';
import { MissionsCard } from '@/components/tasks/MissionsCard';
import { RankingSummaryCard } from '@/components/profile/RankingSummaryCard';
import { RewardsHistoryCard } from '@/components/profile/RewardsHistoryCard';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { SettingsBold } from '@/components/ui/SolarTabIcons';

export default function ProfileScreen() {
  const { selectedMode, user } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const insets = useSafeAreaInsets();

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleMissionsRefreshComplete = useCallback(() => {
    setRefreshing(false);
  }, []);

  const bottomPadding = Math.max(insets.bottom, 20);

  if (!user) {
    return (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Stack.Screen options={{ headerRight: () => null }} />
        <SectionCard title="Keine aktive Sitzung">
          <Text style={styles.body}>
            Melde dich an, um auf das Profil und die Rangliste zuzugreifen.
          </Text>
        </SectionCard>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.orange}
          colors={[theme.colors.orange]}
        />
      }
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/(tabs)/profile/settings" asChild>
              <Pressable hitSlop={20}>
                <SettingsBold color={theme.colors.textPrimary} size={24} />
              </Pressable>
            </Link>
          ),
        }}
      />

      <MissionsCard
        userId={user.id}
        mode={selectedMode}
        refreshTrigger={refreshTrigger}
        onRefreshComplete={handleMissionsRefreshComplete}
      />

      <RankingSummaryCard user={user} refreshTrigger={refreshTrigger} />
      <RewardsHistoryCard userId={user.id} refreshTrigger={refreshTrigger} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 20,
  },
  body: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
