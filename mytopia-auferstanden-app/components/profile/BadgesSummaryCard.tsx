import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ProfileBadgeItem } from '@/src/features/tasks/data/useProfileMissionData';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { theme } from '@/src/shared/ui/theme';

type BadgesSummaryCardProps = {
  badges: ProfileBadgeItem[];
};

export function BadgesSummaryCard({ badges }: BadgesSummaryCardProps) {
  return (
    <SectionCard
      bodyStyle={styles.sectionBody}
      cardStyle={styles.sectionCard}
      title="Abzeichen"
      titleStyle={styles.sectionTitle}
    >
      {badges.length === 0 ? (
        <Text style={styles.empty}>Noch keine Abzeichen freigeschaltet.</Text>
      ) : (
        <View style={styles.list}>
          {badges.map((badge) => (
            <Link
              asChild
              href={{
                pathname: '/(modals)/profile/badges/[badgeId]',
                params: { badgeId: badge.id },
              }}
              key={badge.id}
            >
              <Pressable style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}>
                <View style={styles.badgeMain}>
                  <View style={styles.iconWrap}>
                    <MaterialIcons color={theme.colors.orange} name="workspace-premium" size={30} />
                  </View>
                  <Text numberOfLines={2} style={styles.title}>{badge.title}</Text>
                </View>
                {badge.awardCount > 1 ? <Text style={styles.count}>x{badge.awardCount}</Text> : null}
              </Pressable>
            </Link>
          ))}
        </View>
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  badgeMain: {
    alignItems: 'center',
    flex: 1,
    gap: 8,
    justifyContent: 'center',
    width: '100%',
  },
  count: {
    color: theme.colors.orange,
    fontFamily: 'Nunito_700Bold',
    fontSize: 12,
    lineHeight: 16,
    minWidth: 28,
    textAlign: 'center',
  },
  empty: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: theme.colors.orangeSoft,
    borderRadius: 999,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  item: {
    alignItems: 'center',
    backgroundColor: theme.colors.cardSubtleBackground,
    borderColor: theme.colors.cardBorder,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    height: 130,
    justifyContent: 'space-between',
    padding: 12,
    width: 108,
  },
  itemPressed: {
    opacity: 0.75,
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sectionBody: {
    gap: 6,
  },
  sectionCard: {
    gap: 6,
    padding: 20,
  },
  sectionTitle: {
    marginBottom: 0,
  },
  title: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'Nunito_700Bold',
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center',
  },
});
