import React from 'react';
import { Pressable, View, Text, StyleSheet, type TextStyle, type ViewStyle, type ImageStyle } from 'react-native';
import { theme } from '@/src/shared/ui/theme';
import { AppImage } from '@/src/shared/ui/AppImage';

export function ActorAvatar({
  actor,
  onPress,
  size = 48,
}: {
  actor: { avatarUrl?: string; name: string };
  onPress?: () => void;
  size?: number;
}) {
  const avatarShape = {
    borderRadius: size / 2,
    height: size,
    width: size,
  };

  const content = actor.avatarUrl ? (
    <AppImage
      uri={actor.avatarUrl}
      style={[styles.avatarImage, avatarShape]}
      contentFit="cover"
      showErrorState={false}
    />
  ) : (
    <View style={[styles.avatarFallback, avatarShape]}>
      <Text style={[styles.avatarFallbackLabel, { fontSize: Math.max(14, Math.round(size * 0.38)) }]}>
        {actor.name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      hitSlop={8}
      onPress={onPress}
      onResponderTerminationRequest={() => false}
      onStartShouldSetResponder={() => true}
      pressRetentionOffset={12}
      style={({ pressed }) => pressed ? styles.avatarPressed : undefined}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatarImage: {
  } as ImageStyle,
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: theme.colors.avatarFallback,
    justifyContent: 'center',
  } as ViewStyle,
  avatarFallbackLabel: {
    color: theme.colors.avatarFallbackText,
    fontWeight: '700',
  } as TextStyle,
  avatarPressed: {
    opacity: 0.82,
  } as ViewStyle,
});
