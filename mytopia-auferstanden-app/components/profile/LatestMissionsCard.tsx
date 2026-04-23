import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MISSION_KIND_METADATA } from '@/src/features/tasks/data/missionRepository';
import type { ProfileMissionOverviewItem } from '@/src/features/tasks/data/useProfileMissionData';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { theme } from '@/src/shared/ui/theme';

type LatestMissionsCardProps = {
  activeMissions: ProfileMissionOverviewItem[];
  completedMissions: ProfileMissionOverviewItem[];
  pendingMissions: ProfileMissionOverviewItem[];
};

const PREVIEW_COUNT = 3;

export function LatestMissionsCard({
  activeMissions,
  completedMissions,
  pendingMissions,
}: LatestMissionsCardProps) {
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const hasAnyMission = activeMissions.length > 0 || pendingMissions.length > 0 || completedMissions.length > 0;
  const recentPendingMissions = getRecentItems(pendingMissions);
  const recentCompletedMissions = getRecentItems(completedMissions);

  return (
    <SectionCard bodyStyle={styles.sectionBody} cardStyle={styles.sectionCard} title="Missionen">
      {!hasAnyMission ? (
        <Text style={styles.empty}>Noch keine Missionen freigeschaltet.</Text>
      ) : (
        <>
          <MissionSection
            items={activeMissions}
            showAll
            title="Aktiv"
          />
          <MissionSection
            expanded={pendingExpanded}
            items={recentPendingMissions}
            onToggleExpanded={() => setPendingExpanded((value) => !value)}
            title="In Prüfung"
            withDivider={activeMissions.length > 0}
          />
          <MissionSection
            expanded={completedExpanded}
            items={recentCompletedMissions}
            onToggleExpanded={() => setCompletedExpanded((value) => !value)}
            title="Abgeschlossen"
            withDivider={activeMissions.length > 0 || pendingMissions.length > 0}
          />
        </>
      )}

      {activeMissions.length > 0 && completedMissions.length === 0 ? (
        <Text style={styles.empty}>Erledige deine erste Mission, um Punkte und Fortschritt zu sammeln.</Text>
      ) : null}
    </SectionCard>
  );
}

function MissionSection({
  expanded = false,
  items,
  onToggleExpanded,
  showAll = false,
  title,
  withDivider = false,
}: {
  expanded?: boolean;
  items: ProfileMissionOverviewItem[];
  onToggleExpanded?: () => void;
  showAll?: boolean;
  title: string;
  withDivider?: boolean;
}) {
  if (items.length === 0) {
    return null;
  }

  const visibleItems = showAll || expanded ? items : items.slice(0, PREVIEW_COUNT);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <View style={[styles.section, withDivider ? styles.sectionDivider : null]}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.list}>
        {visibleItems.map((item) => {
          const status = getStatusMeta(item);
          const asideText = getAsideText(item);
          const metaText = getMetaText(item);

          return (
            <Link
              asChild
              href={`/(modals)/tasks/${item.mission._id}`}
              key={item.mission._id}
            >
              <Pressable style={({ pressed }) => [styles.rowPressable, pressed ? styles.rowPressed : null]}>
                <View style={styles.row}>
                  <View style={styles.iconColumn}>
                    <View style={[styles.statusIcon, { backgroundColor: status.backgroundColor }]}>
                      <MaterialIcons color={status.color} name={status.iconName} size={17} />
                    </View>
                  </View>
                  <View style={styles.rowContent}>
                    <View style={styles.rowHeader}>
                      <Text numberOfLines={1} style={styles.title}>{item.mission.title}</Text>
                      {asideText ? (
                        <Text style={[styles.asideText, { color: status.color }]}>{asideText}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.meta}>{metaText}</Text>
                  </View>
                </View>
              </Pressable>
            </Link>
          );
        })}
      </View>
      {hiddenCount > 0 || (expanded && !showAll) ? (
        <Pressable
          accessibilityRole="button"
          onPress={onToggleExpanded}
          style={({ pressed }) => [styles.expandButton, pressed ? styles.rowPressed : null]}
        >
          <Text style={styles.expandButtonText}>
            {expanded ? 'Weniger anzeigen' : 'Alles anzeigen'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function getMetaText(item: ProfileMissionOverviewItem) {
  const kindLabel = MISSION_KIND_METADATA[item.mission.kind]?.label ?? item.mission.kind;

  if (item.status === 'completed') {
    return kindLabel;
  }

  return `${kindLabel} · ${item.mission.points} Punkte`;
}

function getAsideText(item: ProfileMissionOverviewItem) {
  if (item.status === 'available') {
    return null;
  }

  if (item.status === 'completed') {
    return `${item.earnedPoints ?? item.mission.points} Punkte`;
  }

  if (item.status === 'pending') {
    return 'Prüfung';
  }

  if (item.status === 'rejected') {
    return 'Nicht bestätigt';
  }

  if (item.status === 'expired') {
    return 'Abgelaufen';
  }

  return null;
}

function getRecentItems(items: ProfileMissionOverviewItem[]) {
  return [...items].sort((left, right) => getRecencyMs(right) - getRecencyMs(left));
}

function getRecencyMs(item: ProfileMissionOverviewItem) {
  if (item.submission?.resolvedAtMs) {
    return item.submission.resolvedAtMs;
  }

  if (item.submission?.createdAtMs) {
    return item.submission.createdAtMs;
  }

  const expiresAtMs = item.mission.expiresAt ? Date.parse(item.mission.expiresAt) : NaN;
  return Number.isFinite(expiresAtMs) ? expiresAtMs : 0;
}

function getStatusMeta(item: ProfileMissionOverviewItem) {
  if (item.status === 'completed') {
    return {
      backgroundColor: theme.colors.successSurface,
      color: theme.colors.successText,
      iconName: 'check' as const,
    };
  }

  if (item.status === 'pending') {
    return {
      backgroundColor: theme.colors.blueAlpha,
      color: theme.colors.blue,
      iconName: 'schedule' as const,
    };
  }

  if (item.status === 'rejected') {
    return {
      backgroundColor: theme.colors.destructiveSurface,
      color: theme.colors.destructiveText,
      iconName: 'close' as const,
    };
  }

  if (item.status === 'expired') {
    return {
      backgroundColor: theme.colors.cardSubtleBackground,
      color: theme.colors.cardTextMuted,
      iconName: 'schedule' as const,
    };
  }

  return {
    backgroundColor: theme.colors.orangeSoft,
    color: theme.colors.orange,
    iconName: 'flag' as const,
  };
}

const styles = StyleSheet.create({
  asideText: {
    color: theme.colors.cardTextMuted,
    fontFamily: 'Nunito_700Bold',
    fontSize: 12,
    lineHeight: 16,
  },
  empty: {
    color: theme.colors.cardTextSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  expandButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: theme.colors.cardSubtleBackground,
    borderColor: theme.colors.cardBorder,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
  },
  expandButtonText: {
    color: theme.colors.cardTextHeading,
    fontFamily: 'Nunito_700Bold',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  iconColumn: {
    alignItems: 'center',
    flexShrink: 0,
    paddingTop: 1,
    width: 36,
  },
  list: {
    gap: 8,
  },
  meta: {
    color: theme.colors.cardTextSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  rowPressable: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.cardSubtleBackground,
    borderColor: theme.colors.cardBorder,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    width: '100%',
  },
  rowContent: {
    alignSelf: 'stretch',
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  rowPressed: {
    opacity: 0.75,
  },
  rowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  section: {
    gap: 10,
  },
  sectionBody: {
    gap: 14,
  },
  sectionCard: {
    gap: 12,
    padding: 20,
  },
  sectionDivider: {
    borderTopColor: theme.colors.cardBorder,
    borderTopWidth: 1,
    paddingTop: 14,
  },
  sectionLabel: {
    color: theme.colors.cardTextMuted,
    fontFamily: 'Nunito_700Bold',
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  statusIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  title: {
    color: theme.colors.cardTextPrimary,
    flex: 1,
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
    lineHeight: 20,
    minWidth: 0,
  },
});
