import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ActorProfileCard } from '@/src/features/actors/components/ActorProfileCard';
import { buildActorProfileHref, readActorRouteParam } from '@/src/features/actors/navigation';
import { buildFeedChannelHref, useChannels } from '@/src/features/channels/data/ChannelContext';
import { theme } from '@/src/shared/ui/theme';

export function ActorProfileActionsScreen() {
  const params = useLocalSearchParams<{
    actorAvatarUrl?: string | string[];
    actorId?: string | string[];
    actorName?: string | string[];
    actorRole?: string | string[];
  }>();
  const actorId = readActorRouteParam(params.actorId) ?? '';
  const actorName = readActorRouteParam(params.actorName) ?? 'Profil';
  const actorAvatarUrl = readActorRouteParam(params.actorAvatarUrl);
  const actorRole = readActorRouteParam(params.actorRole);
  const router = useRouter();
  const { ensureActorMissionChannel } = useChannels();
  const [isOpeningChannel, setIsOpeningChannel] = useState(false);

  const actor = useMemo(
    () => ({
      ...(actorAvatarUrl ? { avatarUrl: actorAvatarUrl } : {}),
      name: actorName,
      ...(actorRole ? { role: actorRole } : {}),
    }),
    [actorAvatarUrl, actorName, actorRole]
  );

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.dismissTo('/(tabs)/feed');
  }, [router]);

  const handleOpenChannel = useCallback(async () => {
    if (!actorId || !actorName) {
      return;
    }

    setIsOpeningChannel(true);
    try {
      const channelId = await ensureActorMissionChannel({
        ...(actorAvatarUrl ? { actorAvatarUrl } : {}),
        actorId,
        actorName,
        ...(actorRole ? { actorRole } : {}),
      });
      router.push(buildFeedChannelHref(channelId));
    } finally {
      setIsOpeningChannel(false);
    }
  }, [actorAvatarUrl, actorId, actorName, actorRole, ensureActorMissionChannel, router]);

  const handleOpenInfo = useCallback(() => {
    if (!actorId) {
      return;
    }

    router.replace(
      buildActorProfileHref({
        ...(actorAvatarUrl ? { actorAvatarUrl } : {}),
        actorId,
        actorName,
        ...(actorRole ? { actorRole } : {}),
      })
    );
  }, [actorAvatarUrl, actorId, actorName, actorRole, router]);

  return (
    <View style={styles.screen}>
      <Pressable accessibilityLabel="Profil schließen" onPress={handleClose} style={StyleSheet.absoluteFill} />
      <View style={styles.cardWrap}>
        <ActorProfileCard
          actor={actor}
          channelLoading={isOpeningChannel}
          onChannelPress={actorId ? handleOpenChannel : undefined}
          onInfoPress={actorId ? handleOpenInfo : undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: theme.colors.overlayStrong,
    justifyContent: 'center',
    padding: 20,
  } as ViewStyle,
  cardWrap: {
    maxWidth: 420,
    width: '100%',
  } as ViewStyle,
});
