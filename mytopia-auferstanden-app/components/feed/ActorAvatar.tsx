import React from 'react';
import { View, Text, StyleSheet, type TextStyle, type ViewStyle, type ImageStyle } from 'react-native';
import { theme } from '@/src/shared/ui/theme';
import { AppImage } from '@/src/shared/ui/AppImage';

export function ActorAvatar({ actor }: { actor: { avatarUrl?: string; name: string } }) {
  if (actor.avatarUrl) {
    return (
      <AppImage
        uri={actor.avatarUrl}
        style={styles.avatarImage}
        contentFit="cover"
        showErrorState={false}
      />
    );
  }
  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarFallbackLabel}>{actor.name.slice(0, 1).toUpperCase()}</Text>
    </View>
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
});
