import { useLayoutEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import { ActorAvatar } from '@/components/feed/ActorAvatar';
import { useChannels } from '@/src/features/channels/data/ChannelContext';
import { useSession } from '@/src/core/session/SessionContext';
import { theme } from '@/src/shared/ui/theme';

export function ChannelListScreen() {
  const navigation = useNavigation<any>();
  const router = useRouter();
  const { actorChannels, hubUnreadCount } = useChannels();
  const { selectedMode } = useSession();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        selectedMode === 'dev' ? (
          <Text style={styles.modeBadge}>Dev Mode</Text>
        ) : null,
      title: 'Kanäle',
    });
  }, [navigation, selectedMode]);

  const actorItems = useMemo(
    () => [...actorChannels].sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs),
    [actorChannels]
  );

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text style={styles.sectionLabel}>Deine Kanäle</Text>

      <ChannelRow
        preview={hubUnreadCount > 0 ? `${hubUnreadCount} ungelesene Nachrichten` : 'Story-Nachrichten und Missionen'}
        title="Notfallkanal"
        unreadCount={hubUnreadCount}
        onPress={() => router.push('/(tabs)/feed/hub')}
      />

      {actorItems.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Figuren</Text>
          {actorItems.map((channel) => (
            <ChannelRow
              key={channel.channelId}
              avatarUrl={channel.avatarUrl}
              preview={channel.lastPreview || 'Kanal geöffnet'}
              subtitle={formatTimestamp(channel.lastMessageAtMs)}
              title={channel.title}
              unreadCount={channel.unreadCount}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/feed/[channelId]',
                  params: { channelId: channel.channelId },
                })
              }
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ChannelRow({
  avatarUrl,
  onPress,
  preview,
  subtitle,
  title,
  unreadCount,
}: {
  avatarUrl?: string;
  onPress: () => void;
  preview: string;
  subtitle?: string;
  title: string;
  unreadCount: number;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.avatarWrap}>
        <ActorAvatar actor={{ ...(avatarUrl ? { avatarUrl } : {}), name: title }} />
      </View>
      <View style={styles.body}>
        <View style={styles.header}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Text numberOfLines={2} style={styles.preview}>
          {preview}
        </Text>
      </View>
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{String(unreadCount)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function formatTimestamp(timestampMs: number) {
  if (!timestampMs) {
    return '';
  }

  const date = new Date(timestampMs);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
  });
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: theme.colors.background,
  } as ViewStyle,
  content: {
    padding: 20,
    gap: 14,
  } as ViewStyle,
  section: {
    gap: 10,
  } as ViewStyle,
  sectionLabel: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  } as TextStyle,
  row: {
    alignItems: 'center',
    backgroundColor: theme.colors.headerBackground,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
  } as ViewStyle,
  rowPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  } as ViewStyle,
  avatarWrap: {
    width: 48,
  } as ViewStyle,
  body: {
    flex: 1,
    gap: 4,
  } as ViewStyle,
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  } as ViewStyle,
  title: {
    color: theme.colors.textPrimary,
    flex: 1,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 16,
  } as TextStyle,
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 12,
  } as TextStyle,
  preview: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 14,
    lineHeight: 18,
  } as TextStyle,
  badge: {
    alignItems: 'center',
    backgroundColor: theme.colors.blue,
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 5,
  } as ViewStyle,
  badgeText: {
    color: theme.colors.textPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
  } as TextStyle,
  modeBadge: {
    color: theme.colors.orange,
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textTransform: 'uppercase',
  } as TextStyle,
});
