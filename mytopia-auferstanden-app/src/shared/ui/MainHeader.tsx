import { BottomTabHeaderProps } from '@react-navigation/bottom-tabs';
import { getHeaderTitle } from '@react-navigation/elements';
import React from 'react';
import { StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from './theme';

export function MainHeader({ options, route }: BottomTabHeaderProps) {
  const insets = useSafeAreaInsets();
  const title = getHeaderTitle(options, route.name);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <Text
          style={styles.title}
        >
          {title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.headerBackground,
    borderBottomColor: theme.colors.headerBorder,
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
});

