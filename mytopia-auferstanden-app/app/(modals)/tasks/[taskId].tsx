import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import Svg, { Path } from 'react-native-svg';

import {
  buildFeedChannelHref,
  useChannels,
} from '@/src/features/channels/data/ChannelContext';
import { AppButton } from '@/src/shared/ui/AppButton';
import { useSession } from '@/src/core/session/SessionContext';
import { AppImage } from '@/src/shared/ui/AppImage';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { theme } from '@/src/shared/ui/theme';
import { getLocationUnavailableMessage } from '@/src/core/location/locationErrors';
import {
  getForegroundLocationPermissionStatus,
  requestForegroundLocationPermission,
} from '@/src/core/location/locationPermissionClient';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import {
  fetchSettings,
  fetchMissions,
  getCachedMissions,
  type MissionListItem,
  MISSION_KIND_METADATA,
  type MissionKind,
  type MissionSettings,
} from '@/src/features/tasks/data/missionRepository';
import {
  formatMissionCountdown,
  formatMissionDeadline,
  getMissionLifecycleStatus,
  type MissionLifecycleStatus,
} from '@/src/features/tasks/data/missionStatus';
import { formatTimeBonusText, getRewardBreakdownRows } from '@/src/features/tasks/data/rewardFormatting';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';
import { useMissionSubmissions } from '@/src/features/tasks/data/useMissionSubmissions';
import { GpsMap } from '@/src/features/tasks/components/GpsMap';

export default function TaskDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { user, selectedMode } = useSession();
  const { ensureActorMissionChannel, queueMissionNavigationIntent } = useChannels();
  const { activeChannel, focusedMissionChannel, focusedMissionId, missionSessions, persistedSessions } = useActiveMission();
  const completedMissions = useCompletedMissions(user?.id, selectedMode);
  const submissionStates = useMissionSubmissionStates(user?.id, selectedMode);
  const missionSubmissions = useMissionSubmissions(user?.id, selectedMode);
  const [missions, setMissions] = useState<MissionListItem[]>(() => getCachedMissions(selectedMode) ?? []);
  const [isLoading, setIsLoading] = useState(() => !getCachedMissions(selectedMode));
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<MissionSettings | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetchSettings(selectedMode)
      .then(setSettings)
      .catch((err) => console.warn('[TaskDetailScreen] Failed to load settings:', err));
  }, [selectedMode]);

  useEffect(() => {
    let active = true;
    const cached = getCachedMissions(selectedMode);
    setError(null);

    if (cached) {
      setMissions(cached);
      setIsLoading(false);
    } else {
      setMissions([]);
      setIsLoading(true);
    }

    async function load() {
      try {
        const nextMissions = await fetchMissions({ mode: selectedMode });
        if (!active) {
          return;
        }
        setError(null);
        setMissions(nextMissions);
      } catch (err) {
        if (!active || cached) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load mission.');
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [selectedMode]);

  const mission = missions.find((candidate) => candidate._id === taskId) ?? null;
  const missionStatus = mission
    ? getMissionLifecycleStatus(mission, completedMissions, submissionStates)
    : null;
  const missionReward = useMemo(
    () =>
      mission?._id
        ? missionSubmissions.find(
            (submission) => submission.sourceId === mission._id && submission.status === 'approved',
          ) ?? null
        : null,
    [mission?._id, missionSubmissions],
  );
  const isMissionInProgress = focusedMissionId === taskId;
  const isQuizInProgress = mission?.kind === 'quiz' && Boolean(taskId && persistedSessions[taskId]);
  const missionSession = taskId ? missionSessions[taskId] : undefined;
  const canOpenInThread = missionStatus === 'available' || missionStatus === 'rejected';
  const actionLabel = isMissionInProgress || isQuizInProgress || missionSession ? 'Mission fortsetzen' : 'Mission starten';
  const bottomInset = Math.max(insets.bottom, 20);
  const ctaInset = bottomInset + 16;

  const groupMissions = useMemo(() => {
    if (!mission?.groupId) {
      return [];
    }

    return missions
      .filter((candidate) => candidate.groupId === mission.groupId)
      .sort((left, right) => {
        const leftIsCurrent = left._id === mission._id;
        const rightIsCurrent = right._id === mission._id;

        if (leftIsCurrent === rightIsCurrent) {
          return left.title.localeCompare(right.title, 'de');
        }

        return leftIsCurrent ? -1 : 1;
      });
  }, [mission, missions]);

  useEffect(() => {
    if (!mission?.expiresAt) {
      return;
    }

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => clearInterval(interval);
  }, [mission?.expiresAt]);

  if (isLoading) {
    return (
      <Screen title="Mission" subtitle="Wird geladen…" headerShown={false}>
        <SectionCard title="Laden">
          <Text style={styles.body}>Mission wird geladen…</Text>
        </SectionCard>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Fehler" subtitle="Mission konnte nicht geladen werden." headerShown={false}>
        <SectionCard title="Fehler">
          <Text style={styles.errorText}>{error}</Text>
        </SectionCard>
      </Screen>
    );
  }

  if (!mission || !missionStatus) {
    return (
      <Screen title="Nicht gefunden" subtitle="Diese Mission existiert nicht." headerShown={false}>
        <SectionCard title="Unbekannte Mission">
          <Text style={styles.body}>Mission-ID: {String(taskId)}</Text>
        </SectionCard>
      </Screen>
    );
  }

  const missionMeta = MISSION_KIND_METADATA[mission.kind];
  const statusText = getStatusText(missionStatus);
  const countdownText = formatMissionCountdown(mission.expiresAt, now);
  const missionTypeLabel = getMissionTypeLabel(mission.kind);
  const timeBonuses = [...(mission.timeBonuses ?? [])].sort((left, right) => left.minutesLimit - right.minutesLimit || right.bonusPoints - left.bonusPoints);
  const customAchievementCount = settings?.customAchievementCount ?? 0;
  const earnedRewardRows = getRewardBreakdownRows(
    missionReward?.rewardBreakdown,
    missionReward?.streakSummary,
  );
  const earnedBadges = missionReward?.rewardBreakdown?.customAchievements ?? [];

  const handleOpenMission = async () => {
    setLaunchError(null);
    setIsLaunching(true);

    try {
      const activeActor =
        activeChannel.channelType === 'actor' &&
          activeChannel.actorId &&
          activeChannel.actorName
          ? {
            ...(activeChannel.actorAvatarUrl ? { avatarUrl: activeChannel.actorAvatarUrl } : {}),
            actorId: activeChannel.actorId,
            name: activeChannel.actorName,
            ...(activeChannel.actorRole ? { role: activeChannel.actorRole } : {}),
          }
          : null;

      const resumeSession =
        isMissionInProgress && focusedMissionChannel
          ? {
              ...(missionSession?.actor ? { actor: missionSession.actor } : {}),
              channel: focusedMissionChannel,
            }
          : missionSession ?? null;

      const missionActor =
        mission.actorId && mission.actorName
          ? {
              ...(mission.actorAvatarUrl ? { avatarUrl: mission.actorAvatarUrl } : {}),
              actorId: mission.actorId,
              name: mission.actorName,
              ...(mission.actorRole ? { role: mission.actorRole } : {}),
            }
          : null;

      const actor = resumeSession?.actor ?? activeActor ?? missionActor;
      let channelId = resumeSession?.channel.channelId ?? null;
      let channelType = resumeSession?.channel.channelType ?? null;

      if (!channelId && actor?.actorId) {
        channelId = await ensureActorMissionChannel({
          ...(actor.avatarUrl ? { actorAvatarUrl: actor.avatarUrl } : {}),
          actorId: actor.actorId,
          actorName: actor.name,
          ...(actor.role ? { actorRole: actor.role } : {}),
        });
        channelType = 'actor';
      }

      if (!channelId) {
        if (mission.kind === 'quiz' && !isMissionInProgress) {
          throw new Error('Quiz konnte keinem Kanal zugeordnet werden.');
        }
        channelId = 'hub';
        channelType = 'hub';
      }

      const shouldOpenExistingSession = Boolean(resumeSession) || isMissionInProgress;
      queueMissionNavigationIntent({
        action: shouldOpenExistingSession ? 'open' : 'start',
        ...(actor?.actorId
          ? {
              actor: {
                ...actor,
                actorId: actor.actorId,
              },
            }
          : {}),
        data: {
          description: mission.description,
          ...(mission.gpsConfig ? { gpsConfig: mission.gpsConfig } : {}),
          imageUrl: mission.imageUrl,
          ...(mission.questions ? { questions: mission.questions } : {}),
          title: mission.title,
        },
        kind: mission.kind,
        missionId: mission._id,
        returnTarget: 'channel-list',
        targetChannelId: channelId,
        targetChannelType: channelType === 'actor' ? 'actor' : 'hub',
      });

      router.dismissTo(buildFeedChannelHref(channelId));
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Mission konnte nicht geöffnet werden.');
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Screen
        bottomInset={false}
        headerShown={false}
        subtitle={missionMeta ? `${missionMeta.emoji} ${missionMeta.label}` : 'Mission'}
        title="Mission"
      >
        <SectionCard title={mission.title} titleStyle={styles.cardTitle}>
          <Text style={styles.type}>{missionTypeLabel}</Text>

          {mission.imageUrl ? (
            <AppImage
              uri={mission.imageUrl}
              style={styles.image}
              contentFit="cover"
            />
          ) : null}

          <Text style={styles.body}>
            {mission.description?.trim() || 'Für diese Mission gibt es keine zusätzliche Beschreibung.'}
          </Text>
        </SectionCard>

        {mission.kind === 'gps' && mission.gpsConfig ? (
          <GpsMissionPreviewCard target={mission.gpsConfig} />
        ) : null}

        <View style={styles.infoCard}>
          <Text style={styles.pointsValue}>
            {(missionStatus === 'completed'
              ? missionReward?.earnedPoints ?? missionReward?.rewardBreakdown?.totalPoints
              : mission.points) ?? mission.points}{' '}
            Punkte
          </Text>

          {timeBonuses.length > 0 ? (
            <View style={styles.infoBlock}>
              {timeBonuses.map((timeBonus) => (
                <View key={`${timeBonus.minutesLimit}-${timeBonus.bonusPoints}`} style={styles.rewardRow}>
                  <TimeBonusIcon />
                  <Text style={styles.rewardText}>{formatTimeBonusText(timeBonus)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {missionStatus === 'completed' ? (
            earnedBadges.length > 0 ? (
              <View style={styles.infoBlock}>
                <Text style={styles.infoLabel}>Erhaltene Abzeichen</Text>
                {earnedBadges.map((achievement) => (
                  <View key={achievement.id} style={styles.rewardRow}>
                    <CustomBadgeIcon />
                    <Text style={styles.rewardText}>
                      {achievement.title}
                      {achievement.bonusPoints > 0 ? ` · +${achievement.bonusPoints}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null
          ) : customAchievementCount > 0 ? (
            <View style={styles.infoBlock}>
              <View style={styles.rewardRow}>
                <CustomBadgeIcon />
                <Text style={styles.rewardText}>{customAchievementCount} mögliche Abzeichen</Text>
              </View>
            </View>
          ) : null}

          {mission.groupId && mission.groupCompletionBonusPoints ? (
            <View style={styles.infoBlock}>
              <Text style={styles.rewardText}>
                Sammelaufgabe komplett: +{mission.groupCompletionBonusPoints} Bonus-Punkte. Wird erst vergeben, wenn alle Missionen dieser Sammelaufgabe veröffentlicht und erfolgreich abgeschlossen sind.
              </Text>
            </View>
          ) : null}

          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>{statusText}</Text>
            {missionStatus === 'rejected' && submissionStates[mission._id]?.moderatorNote ? (
              <Text style={styles.infoMeta}>Hinweis: {submissionStates[mission._id]?.moderatorNote}</Text>
            ) : null}
          </View>

          {missionStatus === 'completed' && missionReward ? (
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Erhalten</Text>
              <Text style={styles.infoValue}>
                +{missionReward.earnedPoints ?? missionReward.rewardBreakdown?.totalPoints ?? 0} Punkte
              </Text>
              {earnedRewardRows.map((row, index) => (
                <Text key={`${index}:${row}`} style={styles.rewardText}>
                  {row}
                </Text>
              ))}
            </View>
          ) : null}

          {mission.expiresAt ? (
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Deadline</Text>
              <Text style={styles.infoValue}>{formatMissionDeadline(mission.expiresAt)}</Text>
              {countdownText ? <Text style={styles.infoMeta}>{countdownText}</Text> : null}
            </View>
          ) : null}

          {groupMissions.length > 0 ? (
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Teil einer Sammelaufgabe</Text>
              {mission.groupTitle ? <Text style={styles.infoMeta}>{mission.groupTitle}</Text> : null}
              <View style={styles.groupList}>
                {groupMissions.map((groupMission) => (
                  <View key={groupMission._id} style={styles.groupRow}>
                    <GroupMissionIcon
                      status={resolveGroupMissionStatus(
                        groupMission,
                        mission,
                        completedMissions,
                        submissionStates
                      )}
                    />
                    <Text
                      style={[
                        styles.groupTitle,
                        groupMission._id === mission._id ? styles.groupTitleCurrent : null,
                      ]}
                    >
                      {groupMission.title}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {canOpenInThread ? <View style={{ height: 112 + ctaInset }} /> : null}
      </Screen>

      {canOpenInThread ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={[styles.ctaWrap, { paddingBottom: ctaInset }]}>
            {launchError ? <Text style={styles.launchError}>{launchError}</Text> : null}
            <Pressable
              disabled={isLaunching}
              onPress={handleOpenMission}
              style={({ pressed }) => [
                styles.startButton,
                pressed && !isLaunching ? styles.startButtonPressed : null,
                isLaunching ? styles.startButtonDisabled : null,
              ]}
            >
              {isLaunching ? (
                <ActivityIndicator color={styles.startButtonText.color} size="small" />
              ) : (
                <Text style={styles.startButtonText}>{actionLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function GpsMissionPreviewCard({
  target,
}: {
  target: NonNullable<MissionListItem['gpsConfig']>;
}) {
  const [permissionStatus, setPermissionStatus] = useState<'denied' | 'granted' | 'undetermined'>('undetermined');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    void getForegroundLocationPermissionStatus().then((status) => {
      if (isActive) {
        setPermissionStatus(status);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (permissionStatus !== 'granted') {
      setCoords(null);
      return;
    }

    let isActive = true;
    let subscription: Location.LocationSubscription | null = null;

    const applyLocation = (location: Location.LocationObject) => {
      if (!isActive) {
        return;
      }

      setCoords({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      setLocationError(null);
    };

    async function startWatching() {
      try {
        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        applyLocation(currentLocation);
      } catch (error) {
        if (isActive) {
          setLocationError(getLocationUnavailableMessage(error));
        }
      }

      try {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
            timeInterval: 5000,
          },
          applyLocation
        );
      } catch (error) {
        if (isActive) {
          setLocationError(getLocationUnavailableMessage(error));
        }
      }
    }

    void startWatching();

    return () => {
      isActive = false;
      subscription?.remove();
    };
  }, [permissionStatus, target.latitude, target.longitude]);

  const distance = coords
    ? Math.round(getDistanceMeters(
        coords.latitude,
        coords.longitude,
        target.latitude,
        target.longitude
      ))
    : null;
  const isInRange = distance !== null && distance <= target.radiusMeters;
  const permissionCopy =
    permissionStatus === 'undetermined'
      ? {
          body: 'Gib deinen Standort frei, um Entfernung und Zielgebiet vor dem Starten der Mission zu prüfen.',
          button: 'Standort freigeben',
        }
      : {
          body: 'Diese Vorschau benötigt Zugriff auf deinen Standort.',
          button: 'Einstellungen öffnen',
        };

  return (
    <SectionCard title="Standort prüfen" titleStyle={styles.cardTitle}>
      <View style={styles.gpsPreview}>
        <GpsMap
          radiusMeters={target.radiusMeters}
          targetLatitude={target.latitude}
          targetLongitude={target.longitude}
          userLatitude={coords?.latitude}
          userLongitude={coords?.longitude}
        />

        {permissionStatus === 'granted' ? (
          <View style={styles.gpsStatusBlock}>
            <Text style={styles.gpsDistanceValue}>
              {distance !== null ? formatDistance(distance) : 'Standort wird ermittelt...'}
            </Text>
            <Text style={styles.gpsDistanceLabel}>Entfernung zum Ziel</Text>
            {distance !== null ? (
              <View style={isInRange ? styles.gpsInRangeBadge : styles.gpsOutOfRangeBadge}>
                <Text style={isInRange ? styles.gpsInRangeText : styles.gpsOutOfRangeText}>
                  {isInRange ? 'Im Zielgebiet' : `Zielgebiet: ${formatDistance(target.radiusMeters)}`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.gpsStatusBlock}>
            <Text style={styles.body}>{permissionCopy.body}</Text>
            <AppButton
              fullWidth
              label={permissionCopy.button}
              onPress={() => {
                if (permissionStatus === 'undetermined') {
                  void requestForegroundLocationPermission().then(setPermissionStatus);
                  return;
                }

                void Linking.openSettings();
              }}
              variant={permissionStatus === 'undetermined' ? 'primary' : 'secondary'}
            />
          </View>
        )}

        {locationError ? <Text style={styles.errorText}>{locationError}</Text> : null}
      </View>
    </SectionCard>
  );
}

function getStatusText(status: MissionLifecycleStatus) {
  if (status === 'completed') {
    return 'Du hast diese Aufgabe erfolgreich abgeschlossen.';
  }

  if (status === 'pending') {
    return 'Dein Beitrag wurde eingereicht und wird gerade geprüft. Sobald er freigegeben ist, erhältst du deine Punkte.';
  }

  if (status === 'rejected') {
    return 'Du kannst diese Mission erneut im Chat versuchen.';
  }

  if (status === 'expired') {
    return 'Diese Mission ist abgelaufen und kann nicht mehr erledigt werden.';
  }

  return 'Diese Mission ist aktiv und kann jetzt im Chat gestartet werden.';
}

function getMissionTypeLabel(kind: MissionKind) {
  if (kind === 'gps') {
    return 'GPS-Aufgabe';
  }

  if (kind === 'photo') {
    return 'Foto-Aufgabe';
  }

  if (kind === 'text') {
    return 'Text-Aufgabe';
  }

  return 'Quiz-Aufgabe';
}

function formatDistance(meters: number) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }

  return `${meters} m`;
}

function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const radius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function resolveGroupMissionStatus(
  groupMission: MissionListItem,
  currentMission: MissionListItem,
  completedMissions: string[],
  submissionStates: Record<string, { moderatorNote?: string; status: 'approved' | 'draft' | 'pending' | 'rejected' }>,
): 'completed' | 'current' | 'incomplete' {
  if (groupMission._id === currentMission._id) {
    return 'current';
  }

  const status = getMissionLifecycleStatus(groupMission, completedMissions, submissionStates);
  if (status === 'completed') {
    return 'completed';
  }

  return 'incomplete';
}

function TimeBonusIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        fill="#020202"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 22C16.9706 22 21 17.9706 21 13C21 8.02944 16.9706 4 12 4C7.02944 4 3 8.02944 3 13C3 17.9706 7.02944 22 12 22ZM12 8.25C12.4142 8.25 12.75 8.58579 12.75 9V13C12.75 13.4142 12.4142 13.75 12 13.75C11.5858 13.75 11.25 13.4142 11.25 13V9C11.25 8.58579 11.5858 8.25 12 8.25Z"
      />
      <Path
        fill="#020202"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.25 2C9.25 1.58579 9.58579 1.25 10 1.25H14C14.4142 1.25 14.75 1.58579 14.75 2C14.75 2.41421 14.4142 2.75 14 2.75H10C9.58579 2.75 9.25 2.41421 9.25 2Z"
      />
    </Svg>
  );
}

function CustomBadgeIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        fill="#020202"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 16C15.866 16 19 12.866 19 9C19 5.13401 15.866 2 12 2C8.13401 2 5 5.13401 5 9C5 12.866 8.13401 16 12 16ZM12 6C11.7159 6 11.5259 6.34084 11.1459 7.02251L11.0476 7.19887C10.9397 7.39258 10.8857 7.48944 10.8015 7.55334C10.7173 7.61725 10.6125 7.64097 10.4028 7.68841L10.2119 7.73161C9.47396 7.89857 9.10501 7.98205 9.01723 8.26432C8.92945 8.54659 9.18097 8.84072 9.68403 9.42898L9.81418 9.58117C9.95713 9.74833 10.0286 9.83191 10.0608 9.93531C10.0929 10.0387 10.0821 10.1502 10.0605 10.3733L10.0408 10.5763C9.96476 11.3612 9.92674 11.7536 10.1565 11.9281C10.3864 12.1025 10.7318 11.9435 11.4227 11.6254L11.6014 11.5431C11.7978 11.4527 11.8959 11.4075 12 11.4075C12.1041 11.4075 12.2022 11.4527 12.3986 11.5431L12.5773 11.6254C13.2682 11.9435 13.6136 12.1025 13.8435 11.9281C14.0733 11.7536 14.0352 11.3612 13.9592 10.5763L13.9395 10.3733C13.9179 10.1502 13.9071 10.0387 13.9392 9.93531C13.9714 9.83191 14.0429 9.74833 14.1858 9.58118L14.316 9.42898C14.819 8.84072 15.0706 8.54659 14.9828 8.26432C14.895 7.98205 14.526 7.89857 13.7881 7.73161L13.5972 7.68841C13.3875 7.64097 13.2827 7.61725 13.1985 7.55334C13.1143 7.48944 13.0603 7.39258 12.9524 7.19887L12.8541 7.02251C12.4741 6.34084 12.2841 6 12 6Z"
      />
      <Path
        fill="#020202"
        d="M7.09301 15.9414L6.71424 17.323C6.0859 19.6148 5.77173 20.7607 6.19097 21.3881C6.3379 21.6079 6.535 21.7844 6.76372 21.9008C7.41634 22.2331 8.424 21.7081 10.4393 20.658C11.1099 20.3086 11.4452 20.1339 11.8014 20.0959C11.9335 20.0818 12.0665 20.0818 12.1986 20.0959C12.5548 20.1339 12.8901 20.3086 13.5607 20.658C15.576 21.7081 16.5837 22.2331 17.2363 21.9008C17.465 21.7844 17.6621 21.6079 17.809 21.3881C18.2283 20.7607 17.9141 19.6148 17.2858 17.323L16.907 15.9414C15.5208 16.9231 13.8278 17.5 12 17.5C10.1722 17.5 8.47915 16.9231 7.09301 15.9414Z"
      />
    </Svg>
  );
}

function GroupMissionIcon({ status }: { status: 'completed' | 'current' | 'incomplete' }) {
  if (status === 'completed') {
    return (
      <Svg width={19} height={19} viewBox="0 0 19 19" fill="none">
        <Path
          fill="#016AD3"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M19 9.5C19 14.7467 14.7467 19 9.5 19C4.25329 19 0 14.7467 0 9.5C0 4.25329 4.25329 0 9.5 0C14.7467 0 19 4.25329 19 9.5ZM13.3288 6.62119C13.607 6.89943 13.607 7.35057 13.3288 7.62879L8.57878 12.3788C8.30053 12.657 7.84947 12.657 7.57119 12.3788L5.67119 10.4788C5.39294 10.2005 5.39294 9.74947 5.67119 9.47121C5.94943 9.19296 6.40057 9.19296 6.67881 9.47121L8.075 10.8673L10.1981 8.74428L12.3212 6.62119C12.5995 6.34294 13.0505 6.34294 13.3288 6.62119Z"
        />
      </Svg>
    );
  }

  if (status === 'incomplete') {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" color="#D64545" fill="none">
        <Path
          d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
          fill="currentColor"
          opacity="0.18"
        />
        <Path
          d="M8.96967 8.96967C9.26256 8.67678 9.73744 8.67678 10.0303 8.96967L12 10.9394L13.9697 8.96969C14.2626 8.6768 14.7374 8.6768 15.0303 8.96969C15.3232 9.26258 15.3232 9.73746 15.0303 10.0304L13.0607 12L15.0303 13.9696C15.3232 14.2625 15.3232 14.7374 15.0303 15.0303C14.7374 15.3232 14.2625 15.3232 13.9696 15.0303L12 13.0607L10.0304 15.0303C9.73746 15.3232 9.26258 15.3232 8.96969 15.0303C8.6768 14.7374 8.6768 14.2626 8.96969 13.9697L10.9394 12L8.96967 10.0303C8.67678 9.73744 8.67678 9.26256 8.96967 8.96967Z"
          fill="currentColor"
        />
      </Svg>
    );
  }

  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        fill="#F67641"
        d="M4.79175 0.833374C5.13692 0.833374 5.41675 1.1132 5.41675 1.45837V3.00004L6.85064 2.71327C8.22608 2.43817 9.65183 2.56907 10.9542 3.09002L11.1239 3.1579C12.4248 3.67828 13.8567 3.77547 15.2161 3.43562C15.8472 3.27787 16.4584 3.75515 16.4584 4.40562V10.5448C16.4584 11.0817 16.093 11.5497 15.5721 11.68L15.3934 11.7246C13.9187 12.0933 12.3655 11.9879 10.9542 11.4234C9.65183 10.9024 8.22608 10.7715 6.85064 11.0466L5.41675 11.3334V18.125C5.41675 18.4702 5.13692 18.75 4.79175 18.75C4.44657 18.75 4.16675 18.4702 4.16675 18.125V1.45837C4.16675 1.1132 4.44657 0.833374 4.79175 0.833374Z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  body: {
    color: theme.colors.cardTextPrimary,
    fontSize: 16,
    lineHeight: 24,
  },
  cardTitle: {
    color: theme.colors.cardTextPrimary,
  },
  ctaWrap: {
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    ...StyleSheet.absoluteFillObject,
  },
  errorText: {
    color: theme.colors.errorText,
    fontSize: 14,
    lineHeight: 20,
  },
  groupList: {
    gap: 10,
  },
  groupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  groupTitle: {
    color: theme.colors.cardTextPrimary,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  groupTitleCurrent: {
    fontWeight: '800',
  },
  image: {
    borderRadius: 12,
    height: 200,
    width: '100%',
  },
  gpsDistanceLabel: {
    color: theme.colors.cardTextSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  gpsDistanceValue: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 22,
    lineHeight: 28,
  },
  gpsInRangeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(22, 101, 52, 0.12)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  gpsInRangeText: {
    color: theme.colors.successText,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 13,
  },
  gpsOutOfRangeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.orangeSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  gpsOutOfRangeText: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 13,
  },
  gpsPreview: {
    gap: 14,
  },
  gpsStatusBlock: {
    gap: 8,
  },
  infoBlock: {
    gap: 8,
  },
  infoCard: {
    backgroundColor: '#DDEAF8',
    borderRadius: 20,
    gap: 16,
    marginTop: 8,
    padding: 24,
  },
  infoLabel: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    textTransform: 'uppercase',
  },
  infoMeta: {
    color: theme.colors.cardTextPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  infoValue: {
    color: theme.colors.cardTextPrimary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  launchError: {
    color: theme.colors.errorText,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
  },
  pointsValue: {
    ...theme.typography.h1,
    color: theme.colors.cardTextPrimary,
    marginBottom: 0,
    textAlign: 'left',
  },
  rewardRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  rewardText: {
    color: theme.colors.cardTextPrimary,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  screen: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  startButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.orange,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 60,
    justifyContent: 'center',
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
  },
  startButtonDisabled: {
    opacity: 0.8,
  },
  startButtonPressed: {
    transform: [{ translateY: 1 }],
  },
  startButtonText: {
    color: '#020202',
    textTransform: 'uppercase',
    fontFamily: 'Nunito_700Bold',
    fontSize: 18,
  },
  type: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
    textAlign: 'center',
  },
});
