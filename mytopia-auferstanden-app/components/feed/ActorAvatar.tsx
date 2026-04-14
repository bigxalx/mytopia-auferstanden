import React from 'react';
import { Pressable, View, Text, StyleSheet, type TextStyle, type ViewStyle, type ImageStyle } from 'react-native';
import { theme } from '@/src/shared/ui/theme';
import { AppImage } from '@/src/shared/ui/AppImage';

export function ActorAvatar({
  actor,
  onPress,
}: {
  actor: { avatarUrl?: string; name: string };
  onPress?: () => void;
}) {
  const content = actor.avatarUrl ? (
    <AppImage
      uri={actor.avatarUrl}
      style={styles.avatarImage}
      contentFit="cover"
      showErrorState={false}
    />
  ) : (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarFallbackLabel}>{actor.name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable hitSlop={8} onPress={onPress} style={({ pressed }) => pressed ? styles.avatarPressed : undefined}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatarImage: { 
    borderRadius: 24, 
    height: 48, 
    width: 48 
  } as ImageStyle,
  avatarFallback: { 
    alignItems: 'center', 
    backgroundColor: theme.colors.avatarFallback, 
    borderRadius: 24, 
    height: 48, 
    justifyContent: 'center', 
    width: 48 
  } as ViewStyle,
  avatarFallbackLabel: { 
    color: theme.colors.avatarFallbackText, 
    fontSize: 18, 
    fontWeight: '700' 
  } as TextStyle,
  avatarPressed: {
    opacity: 0.82,
  } as ViewStyle,
});
