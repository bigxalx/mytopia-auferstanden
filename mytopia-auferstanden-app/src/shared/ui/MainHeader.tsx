import React from 'react';
import { StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from './theme';

type MainHeaderProps = {
  subtitle?: string;
  title: string;
};

export function MainHeader({ subtitle, title }: MainHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <GlassView colorScheme="dark" style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomWidth: 1,
  } as ViewStyle,
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    width: '100%',
  } as ViewStyle,
  title: {
    ...(theme.typography.title as object),
    width: '100%',
  } as TextStyle,
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  } as TextStyle,
});
