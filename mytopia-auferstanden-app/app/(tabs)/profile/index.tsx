import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link, Stack } from 'expo-router';

import { theme } from '@/src/shared/ui/theme';
import { useSession } from '@/src/core/session/SessionContext';
import { BadgesSummaryCard } from '@/components/profile/BadgesSummaryCard';
import { LatestMissionsCard } from '@/components/profile/LatestMissionsCard';
import { ProgressCard } from '@/components/profile/ProgressCard';
import { RankingSummaryCard } from '@/components/profile/RankingSummaryCard';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { useProfileMissionData } from '@/src/features/tasks/data/useProfileMissionData';
import { SettingsBold } from '@/components/ui/SolarTabIcons';

export default function ProfileScreen() {
  const { selectedMode, user } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const insets = useSafeAreaInsets();
  const profileData = useProfileMissionData(user?.id, selectedMode, refreshTrigger);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!profileData.isLoading) {
      setRefreshing(false);
    }
  }, [profileData.isLoading]);

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
        <SectionCard bodyStyle={styles.sectionBody} cardStyle={styles.sectionCard} title="Keine aktive Sitzung">
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

      {profileData.error ? (
        <SectionCard bodyStyle={styles.sectionBody} cardStyle={styles.sectionCard} title="Missionen">
          <Text style={styles.body}>{profileData.error}</Text>
        </SectionCard>
      ) : (
        <>
          <View style={styles.topCards}>
            <RankingSummaryCard
              totalPoints={profileData.totalPoints}
            />
            <ProgressCard
              missions={profileData.overviewItems}
              streakCount={profileData.streakCount}
              streakThreshold={profileData.streakThreshold}
            />
          </View>
          <BadgesSummaryCard badges={profileData.badges} />
          <LatestMissionsCard
            activeMissions={profileData.activeMissions}
            completedMissions={profileData.completedMissions}
            pendingMissions={profileData.pendingMissions}
          />
        </>
      )}
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
  topCards: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionBody: {
    gap: 12,
  },
  sectionCard: {
    gap: 12,
    padding: 20,
  },
  body: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
