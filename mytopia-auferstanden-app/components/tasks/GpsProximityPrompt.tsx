import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
  type ViewStyle,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  buildFeedChannelHref,
  useChannels,
} from '@/src/features/channels/data/ChannelContext';
import {
  useActiveMission,
  useActiveMissionBarVisible,
} from '@/src/features/tasks/context/ActiveMissionContext';
import { type MissionListItem } from '@/src/features/tasks/data/missionRepository';
import { getForegroundLocationPermissionStatus } from '@/src/core/location/locationPermissionClient';
import { theme } from '@/src/shared/ui/theme';

const PERMISSION_RECHECK_INTERVAL_MS = 15000;

type GpsMission = MissionListItem & {
  gpsConfig: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
};

type NearbyGpsMission = {
  distanceMeters: number;
  mission: GpsMission;
};

export function GpsProximityPrompt() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { ensureActorMissionChannel, queueMissionNavigationIntent } = useChannels();
  const {
    activeChannel,
    availableMissions,
    focusedMissionChannel,
    focusedMissionId,
    missionSessions,
  } = useActiveMission();
  const missionBar = useActiveMissionBarVisible();
  const nearby = useNearbyGpsMission(availableMissions);
  const [isNavigating, setIsNavigating] = useState(false);

  const isFocusedMissionVisible =
    nearby &&
    focusedMissionId === nearby.mission._id &&
    isMissionChannelPath(pathname, focusedMissionChannel);

  const bottomOffset =
    insets.bottom +
    (Platform.OS === 'android' ? 86 : 64) +
    (missionBar.isVisible ? (missionBar.isNative ? 42 : 76) : 0);

  const handleOpenCheckIn = useCallback(async () => {
    if (!nearby || isNavigating) {
      return;
    }

    const { mission } = nearby;
    setIsNavigating(true);

    try {
      const actor =
        mission.actorId && mission.actorName
          ? {
              ...(mission.actorAvatarUrl ? { avatarUrl: mission.actorAvatarUrl } : {}),
              actorId: mission.actorId,
              name: mission.actorName,
              ...(mission.actorRole ? { role: mission.actorRole } : {}),
            }
          : undefined;

      let targetChannelId = 'hub';
      let targetChannelType: 'actor' | 'hub' = 'hub';

      if (actor) {
        targetChannelId = await ensureActorMissionChannel({
          ...(actor.avatarUrl ? { actorAvatarUrl: actor.avatarUrl } : {}),
          actorId: actor.actorId,
          actorName: actor.name,
          ...(actor.role ? { actorRole: actor.role } : {}),
        });
        targetChannelType = 'actor';
      }

      const existingSession = missionSessions[mission._id];
      queueMissionNavigationIntent({
        action: existingSession || focusedMissionId === mission._id ? 'open' : 'start',
        ...(actor ? { actor } : {}),
        data: {
          description: mission.description,
          gpsConfig: mission.gpsConfig,
          imageUrl: mission.imageUrl,
          title: mission.title,
        },
        kind: 'gps',
        missionId: mission._id,
        returnTarget: activeChannel.channelType === 'hub' ? 'hub' : 'channel-list',
        targetChannelId,
        targetChannelType,
      });

      router.navigate(buildFeedChannelHref(targetChannelId));
    } catch (error) {
      console.warn('[GpsProximityPrompt] Failed to open GPS mission:', error);
      Alert.alert('Fehler', 'Einchecken konnte nicht geöffnet werden.');
    } finally {
      setIsNavigating(false);
    }
  }, [
    activeChannel.channelType,
    ensureActorMissionChannel,
    focusedMissionId,
    isNavigating,
    missionSessions,
    nearby,
    queueMissionNavigationIntent,
    router,
  ]);

  if (!nearby || isFocusedMissionVisible) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: bottomOffset }]}>
      <Pressable
        accessibilityRole="button"
        disabled={isNavigating}
        onPress={() => {
          void handleOpenCheckIn();
        }}
        style={({ pressed }) => [
          styles.prompt,
          pressed && !isNavigating ? styles.promptPressed : null,
          isNavigating ? styles.promptDisabled : null,
        ]}
      >
        <View style={styles.iconCircle}>
          <MaterialIcons color="#fff" name="location-on" size={22} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.eyebrow}>Du bist bei</Text>
          <Text numberOfLines={1} style={styles.title}>
            {nearby.mission.title}
          </Text>
        </View>
        <View style={styles.cta}>
          {isNavigating ? (
            <ActivityIndicator color={theme.colors.cardTextPrimary} size="small" />
          ) : (
            <>
              <Text style={styles.ctaText}>Zum Einchecken</Text>
              <MaterialIcons color={theme.colors.cardTextPrimary} name="arrow-forward" size={18} />
            </>
          )}
        </View>
      </Pressable>
    </View>
  );
}

function useNearbyGpsMission(availableMissions: MissionListItem[]): NearbyGpsMission | null {
  const gpsMissions = useMemo(
    () => availableMissions.filter(isGpsMissionWithTarget),
    [availableMissions]
  );
  const [appState, setAppState] = useState<AppStateStatus>(() => AppState.currentState);
  const [permissionStatus, setPermissionStatus] = useState<'denied' | 'granted' | 'undetermined'>('undetermined');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const isAppActive = appState === 'active';

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isAppActive || gpsMissions.length === 0) {
      setCoords(null);
      return;
    }

    let isCancelled = false;

    async function checkPermission() {
      const status = await getForegroundLocationPermissionStatus();
      if (!isCancelled) {
        setPermissionStatus(status);
      }
    }

    void checkPermission();
    const interval = setInterval(() => {
      void checkPermission();
    }, PERMISSION_RECHECK_INTERVAL_MS);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [gpsMissions.length, isAppActive]);

  useEffect(() => {
    if (!isAppActive || permissionStatus !== 'granted' || gpsMissions.length === 0) {
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
    };

    async function startWatching() {
      try {
        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        applyLocation(currentLocation);
      } catch {
        // The live watcher below may still produce a location shortly after.
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
          console.warn('[GpsProximityPrompt] Failed to watch location:', error);
        }
      }
    }

    void startWatching();

    return () => {
      isActive = false;
      subscription?.remove();
    };
  }, [gpsMissions.length, isAppActive, permissionStatus]);

  return useMemo(() => {
    if (!coords) {
      return null;
    }

    return gpsMissions.reduce<NearbyGpsMission | null>((nearest, mission) => {
      const distanceMeters = getDistanceMeters(
        coords.latitude,
        coords.longitude,
        mission.gpsConfig.latitude,
        mission.gpsConfig.longitude
      );

      if (distanceMeters > mission.gpsConfig.radiusMeters) {
        return nearest;
      }

      if (!nearest || distanceMeters < nearest.distanceMeters) {
        return { distanceMeters, mission };
      }

      return nearest;
    }, null);
  }, [coords, gpsMissions]);
}

function isGpsMissionWithTarget(mission: MissionListItem): mission is GpsMission {
  const gpsConfig = mission.gpsConfig;
  return (
    mission.kind === 'gps' &&
    gpsConfig !== undefined &&
    Number.isFinite(gpsConfig.latitude) &&
    Number.isFinite(gpsConfig.longitude) &&
    Number.isFinite(gpsConfig.radiusMeters) &&
    gpsConfig.radiusMeters > 0
  );
}

function isMissionChannelPath(
  pathname: string,
  channel: { channelId: string; channelType: 'actor' | 'hub' } | null
) {
  if (!channel) {
    return false;
  }

  if (channel.channelType === 'hub') {
    return pathname === '/feed/hub' || pathname.endsWith('/feed/hub');
  }

  const rawPath = `/feed/${channel.channelId}`;
  const encodedPath = `/feed/${encodeURIComponent(channel.channelId)}`;
  return (
    pathname === rawPath ||
    pathname.endsWith(rawPath) ||
    pathname === encodedPath ||
    pathname.endsWith(encodedPath)
  );
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

const styles = StyleSheet.create({
  wrapper: {
    left: 10,
    position: 'absolute',
    right: 10,
    zIndex: 180,
  } as ViewStyle,
  prompt: {
    alignItems: 'center',
    backgroundColor: 'rgba(237, 236, 224, 0.98)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 18,
    borderWidth: 1,
    elevation: 12,
    flexDirection: 'row',
    gap: 10,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
  } as ViewStyle,
  promptDisabled: {
    opacity: 0.82,
  } as ViewStyle,
  promptPressed: {
    transform: [{ scale: 0.99 }],
  } as ViewStyle,
  iconCircle: {
    alignItems: 'center',
    backgroundColor: theme.colors.orange,
    borderRadius: 999,
    height: 42,
    justifyContent: 'center',
    width: 42,
  } as ViewStyle,
  textBlock: {
    flex: 1,
    minWidth: 0,
  } as ViewStyle,
  eyebrow: {
    color: theme.colors.cardTextMuted,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
  },
  title: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 16,
    lineHeight: 20,
  },
  cta: {
    alignItems: 'center',
    backgroundColor: 'rgba(249, 115, 22, 0.14)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 118,
    paddingHorizontal: 12,
  } as ViewStyle,
  ctaText: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 13,
  },
});
