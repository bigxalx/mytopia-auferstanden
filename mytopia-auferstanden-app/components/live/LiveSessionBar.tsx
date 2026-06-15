import { useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { AltArrowRightLinear } from '@/components/ui/SolarTabIcons';
import { useLiveSession } from '@/src/features/live/data/LiveSessionContext';
import { theme } from '@/src/shared/ui/theme';

function useShouldShowLiveBar() {
  const { activeEvent, availableSession, connectionStatus, isJoined, session } = useLiveSession();
  return !activeEvent && (
    (isJoined && Boolean(session) && connectionStatus !== 'offline')
    || Boolean(availableSession)
  );
}

function LiveSessionBarContent({
  placement,
  transparent = true,
}: {
  placement: 'regular' | 'inline';
  transparent?: boolean;
}) {
  const router = useRouter();
  const { availableSession, connectionStatus, isGpsBypassEnabled, isJoined } = useLiveSession();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const isConnected = connectionStatus === 'connected';
  const isJoinPrompt = !isJoined && Boolean(availableSession);

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
              {isJoinPrompt ? 'Jetzt Live' : isConnected ? 'Live verbunden' : 'Live wird verbunden'}
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {isJoinPrompt
                ? isGpsBypassEnabled
                  ? 'Testmodus: GPS-Prüfung aus'
                  : 'Vor Ort beitreten oder jetzt nicht'
                : isConnected
                  ? 'Warteraum ist geöffnet'
                  : 'Live-Verbindung wird hergestellt'}
            </Text>
          </View>
          <View style={styles.arrowSlot}>
            <AltArrowRightLinear color="rgba(255, 255, 255, 0.72)" size={19} />
          </View>
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
    justifyContent: 'flex-start',
    minHeight: 56,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  arrowSlot: {
    alignItems: 'center',
    alignSelf: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  fallbackContainer: {
    backgroundColor: 'rgba(37, 43, 48, 0.96)',
    borderColor: 'rgba(177, 194, 210, 0.32)',
    borderRadius: 16,
    borderWidth: 1,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
  },
  inlineContainer: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  manualFallbackWrapper: {
    left: 8,
    position: 'absolute',
    right: 8,
    zIndex: 99,
  },
  nativeContainer: {
    backgroundColor: 'rgba(37, 43, 48, 0.82)',
    borderTopColor: 'rgba(177, 194, 210, 0.2)',
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
    borderRadius: 999,
    height: 9,
    width: 9,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.66)',
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#fff',
    fontFamily: theme.typography.button.fontFamily,
    fontSize: 14,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
});
