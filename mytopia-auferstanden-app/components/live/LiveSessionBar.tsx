import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useLiveSession } from '@/src/features/live/data/LiveSessionContext';
import { theme } from '@/src/shared/ui/theme';

function useShouldShowLiveBar() {
  const { activeEvent, connectionStatus, isJoined, session } = useLiveSession();
  return isJoined && Boolean(session) && connectionStatus !== 'offline' && !activeEvent;
}

function LiveSessionBarContent({
  placement,
  transparent = true,
}: {
  placement: 'regular' | 'inline';
  transparent?: boolean;
}) {
  const router = useRouter();
  const { connectionStatus } = useLiveSession();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const isConnected = connectionStatus === 'connected';

  return (
    <Pressable
      accessibilityLabel="Live-Session öffnen"
      accessibilityRole="button"
      onPress={() => router.push('/live/session')}
      onPressIn={() => {
        scale.value = withSpring(0.985, { damping: 38, mass: 0.45, stiffness: 700 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 38, mass: 0.45, stiffness: 700 });
      }}
      style={styles.pressable}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.container,
            transparent ? styles.nativeContainer : styles.fallbackContainer,
            placement === 'inline' ? styles.inlineContainer : null,
            animatedStyle,
            pressed ? styles.pressed : null,
          ]}
        >
          <View style={[styles.statusDot, isConnected ? styles.statusConnected : styles.statusConnecting]} />
          <View style={styles.textBlock}>
            <Text numberOfLines={1} style={styles.title}>
              {isConnected ? 'Live verbunden' : 'Verbinde...'}
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {isConnected ? 'Warte auf das nächste Signal' : 'Live-Verbindung wird hergestellt'}
            </Text>
          </View>
          <MaterialIcons color="rgba(255, 255, 255, 0.7)" name="chevron-right" size={22} />
        </Animated.View>
      )}
    </Pressable>
  );
}

export function NativeLiveSessionBar() {
  const shouldShow = useShouldShowLiveBar();
  const placement = NativeTabs.BottomAccessory.usePlacement();

  if (!shouldShow) return null;

  return <LiveSessionBarContent placement={placement} />;
}

export function FallbackLiveSessionBar() {
  const shouldShow = useShouldShowLiveBar();
  const insets = useSafeAreaInsets();

  if (!shouldShow) return null;

  const fallbackBottomOffset = insets.bottom + (Platform.OS === 'android' ? 78 : 56);

  return (
    <View pointerEvents="box-none" style={[styles.manualFallbackWrapper, { bottom: fallbackBottomOffset }]}>
      <LiveSessionBarContent placement="regular" transparent={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  fallbackContainer: {
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderColor: 'rgba(34, 197, 94, 0.38)',
    borderRadius: 22,
    borderWidth: 1,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
  },
  inlineContainer: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  manualFallbackWrapper: {
    left: 8,
    position: 'absolute',
    right: 8,
    zIndex: 99,
  },
  nativeContainer: {
    backgroundColor: 'rgba(15, 23, 42, 0.74)',
    borderTopColor: 'rgba(34, 197, 94, 0.28)',
    borderTopWidth: 1,
  },
  pressed: {
    opacity: 0.9,
  },
  pressable: {
    width: '100%',
  },
  statusConnected: {
    backgroundColor: '#22c55e',
  },
  statusConnecting: {
    backgroundColor: '#f59e0b',
  },
  statusDot: {
    borderColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: 999,
    borderWidth: 2,
    height: 14,
    width: 14,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.66)',
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontFamily: theme.typography.button.fontFamily,
    fontSize: 14,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
});
