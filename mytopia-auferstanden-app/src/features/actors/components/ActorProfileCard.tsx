import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { ActorAvatar } from '@/components/feed/ActorAvatar';
import { AppButton } from '@/src/shared/ui/AppButton';
import { SurfaceCard } from '@/src/shared/ui/SurfaceCard';
import { theme } from '@/src/shared/ui/theme';

type ActorProfileCardProps = {
  actor: {
    avatarUrl?: string;
    name: string;
    role?: string;
  };
  channelLoading?: boolean;
  onChannelPress?: () => void;
  onInfoPress?: () => void;
  showChannelButton?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ActorProfileCard({
  actor,
  channelLoading = false,
  onChannelPress,
  onInfoPress,
  showChannelButton = true,
  style,
}: ActorProfileCardProps) {
  const description = actor.role?.trim() ? actor.role : 'Privater Missionskanal';
  const shouldShowChannelButton = showChannelButton && Boolean(onChannelPress);
  const shouldShowInfoButton = Boolean(onInfoPress);

  return (
    <SurfaceCard style={style}>
      <View style={styles.content}>
        <ActorAvatar actor={actor} size={72} />
        <Text style={styles.name}>{actor.name}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {shouldShowChannelButton || shouldShowInfoButton ? (
        <View style={styles.buttonRow}>
          {shouldShowChannelButton ? (
            <AppButton
              label="Kanal"
              loading={channelLoading}
              onPress={onChannelPress}
              style={styles.button}
              variant="primary"
            />
          ) : null}
          {shouldShowInfoButton ? (
            <AppButton
              label="Info"
              onPress={onInfoPress}
              style={styles.button}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
  } as ViewStyle,
  name: {
    color: theme.colors.textPrimary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 22,
    marginTop: 12,
    textAlign: 'center',
  } as TextStyle,
  description: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  } as TextStyle,
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  } as ViewStyle,
  button: {
    flex: 1,
  } as ViewStyle,
});
