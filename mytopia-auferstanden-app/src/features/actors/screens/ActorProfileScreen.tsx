import { useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';

import { ActorAvatar } from '@/components/feed/ActorAvatar';
import { fetchNarrativeActorProfile, type NarrativeActorProfileDto } from '@/src/features/actors/data/actorProfileClient';
import { readActorRouteParam } from '@/src/features/actors/navigation';
import { buildFeedChannelHref, useChannels } from '@/src/features/channels/data/ChannelContext';
import { useSession } from '@/src/core/session/SessionContext';
import { AppButton } from '@/src/shared/ui/AppButton';
import { Screen } from '@/src/shared/ui/Screen';
import { SurfaceCard } from '@/src/shared/ui/SurfaceCard';
import { theme } from '@/src/shared/ui/theme';

export function ActorProfileScreen() {
  const params = useLocalSearchParams<{
    actorAvatarUrl?: string | string[];
    actorId?: string | string[];
    actorName?: string | string[];
    actorRole?: string | string[];
  }>();
  const actorId = readActorRouteParam(params.actorId) ?? '';
  const actorName = readActorRouteParam(params.actorName);
  const actorAvatarUrl = readActorRouteParam(params.actorAvatarUrl);
  const actorRole = readActorRouteParam(params.actorRole);
  const { selectedMode } = useSession();
  const navigation = useNavigation<any>();
  const router = useRouter();
  const { ensureActorMissionChannel } = useChannels();
  const initialActor = useMemo<NarrativeActorProfileDto | null>(
    () =>
      actorId || actorName
        ? {
            actorId,
            ...(actorAvatarUrl ? { avatarUrl: actorAvatarUrl } : {}),
            name: actorName ?? 'Profil',
            ...(actorRole ? { role: actorRole } : {}),
          }
        : null,
    [actorAvatarUrl, actorId, actorName, actorRole]
  );
  const [actor, setActor] = useState<NarrativeActorProfileDto | null>(initialActor);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(actorId));
  const [isOpeningChannel, setIsOpeningChannel] = useState(false);

  useEffect(() => {
    setActor(initialActor);
  }, [initialActor]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: actor?.name ?? actorName ?? 'Info',
    });
  }, [actor?.name, actorName, navigation]);

  useEffect(() => {
    if (!actorId) {
      setIsLoading(false);
      setErrorMessage('Profil konnte nicht geladen werden.');
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    void fetchNarrativeActorProfile({
      actorId,
      mode: selectedMode,
    })
      .then((nextActor) => {
        if (isCancelled) {
          return;
        }

        if (!nextActor) {
          if (!initialActor) {
            setErrorMessage('Profil konnte nicht geladen werden.');
          }
          return;
        }

        setActor(nextActor);
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }

        if (!initialActor) {
          setErrorMessage(error instanceof Error ? error.message : 'Profil konnte nicht geladen werden.');
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [actorId, initialActor, selectedMode]);

  const roleLabel = actor?.role?.trim() ? actor.role : null;
  const bioLabel = actor?.bio?.trim() ? actor.bio : null;
  const canOpenChannel = Boolean(actorId && (actor?.name ?? actorName));

  const handleOpenChannel = useCallback(async () => {
    const resolvedName = actor?.name ?? actorName;
    if (!actorId || !resolvedName) {
      return;
    }

    setIsOpeningChannel(true);
    try {
      const channelId = await ensureActorMissionChannel({
        ...(actor?.avatarUrl ? { actorAvatarUrl: actor.avatarUrl } : actorAvatarUrl ? { actorAvatarUrl } : {}),
        actorId,
        actorName: resolvedName,
        ...(actor?.role ? { actorRole: actor.role } : actorRole ? { actorRole } : {}),
      });

      router.push(buildFeedChannelHref(channelId));
    } finally {
      setIsOpeningChannel(false);
    }
  }, [actor?.avatarUrl, actor?.name, actor?.role, actorAvatarUrl, actorId, actorName, actorRole, ensureActorMissionChannel, router]);

  return (
    <Screen headerShown={false} scrollable title={actor?.name ?? 'Info'}>
      <SurfaceCard>
        <View style={styles.summary}>
          <ActorAvatar
            actor={{
              ...(actor?.avatarUrl ? { avatarUrl: actor.avatarUrl } : {}),
              name: actor?.name ?? actorName ?? 'Profil',
            }}
            size={88}
          />
          <Text style={styles.name}>{actor?.name ?? actorName ?? 'Profil'}</Text>
          {roleLabel ? <Text style={styles.role}>{roleLabel}</Text> : null}
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.colors.orange} size="small" />
              <Text style={styles.loadingLabel}>Profil wird geladen...</Text>
            </View>
          ) : null}
        </View>
      </SurfaceCard>

      {bioLabel ? (
        <SurfaceCard>
          <Text style={styles.sectionLabel}>Bio</Text>
          <Text style={styles.body}>{bioLabel}</Text>
        </SurfaceCard>
      ) : null}

      {errorMessage && !actor ? (
        <SurfaceCard style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </SurfaceCard>
      ) : null}

      {canOpenChannel ? (
        <AppButton
          fullWidth
          label="Kanal"
          loading={isOpeningChannel}
          onPress={handleOpenChannel}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: {
    alignItems: 'center',
    gap: 10,
  } as ViewStyle,
  name: {
    color: theme.colors.textPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 26,
    textAlign: 'center',
  } as TextStyle,
  role: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  } as TextStyle,
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  } as ViewStyle,
  loadingLabel: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 13,
  } as TextStyle,
  sectionLabel: {
    color: theme.colors.textPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  } as TextStyle,
  body: {
    color: theme.colors.textPrimary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 16,
    lineHeight: 24,
  } as TextStyle,
  errorCard: {
    backgroundColor: theme.colors.errorSurface,
    borderColor: theme.colors.errorBorder,
  } as ViewStyle,
  errorText: {
    color: theme.colors.errorText,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
  } as TextStyle,
});
