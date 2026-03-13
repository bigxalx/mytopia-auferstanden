import { BottomTabHeaderProps } from '@react-navigation/bottom-tabs';
import { getHeaderTitle } from '@react-navigation/elements';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function MainHeader({ options, route }: BottomTabHeaderProps) {
  const insets = useSafeAreaInsets();
  const title = getHeaderTitle(options, route.name);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeAnim.setValue(0.3); // Start slightly visible to prevent a "dead" 1-frame flash
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [title, fadeAnim]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <Animated.View style={{ opacity: fadeAnim }}>
          <Text 
            style={styles.title} 
            numberOfLines={1} 
            ellipsizeMode="tail"
          >
            {title}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#3f454a',
    borderBottomColor: '#1f2937',
    borderBottomWidth: 1,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 56, // Total content height is locked
    paddingHorizontal: 20,
  },
  title: {
    color: '#eef2ef',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
});
