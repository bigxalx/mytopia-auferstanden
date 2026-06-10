import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/src/shared/ui/theme';
import type { LiveEventDto } from '@/src/features/live/data/liveSessionClient';

export function TerrorAlertOverlay({ event }: { event: LiveEventDto }) {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, { duration: 760, toValue: 1.08, useNativeDriver: true }),
          Animated.timing(pulse, { duration: 760, toValue: 1, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(glow, { duration: 760, toValue: 1, useNativeDriver: true }),
          Animated.timing(glow, { duration: 760, toValue: 0, useNativeDriver: true }),
        ]),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [glow, pulse]);

  const title = event.payload?.title ?? 'Terrorwarnung';
  const message = event.payload?.message ?? 'Angriff außerhalb der Kuppel bestätigt.';

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 28),
          paddingTop: Math.max(insets.top, 28),
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.5] }),
            transform: [{ scale: pulse }],
          },
        ]}
      />
      <View style={styles.connectionPill}>
        <View style={styles.connectionDot} />
        <Text style={styles.connectionText}>Trigger empfangen</Text>
      </View>
      <Animated.View style={[styles.mark, { transform: [{ scale: pulse }] }]}>
        <Text style={styles.markText}>!</Text>
      </Animated.View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Text style={styles.message}>Bleib im Saal. Warte auf Anweisung der Bühne.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    paddingHorizontal: 28,
    zIndex: 1000,
  },
  connectionDot: {
    backgroundColor: '#16a34a',
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  connectionPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    borderColor: 'rgba(255, 255, 255, 0.24)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 28,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  connectionText: {
    color: '#fff',
    fontFamily: theme.typography.button.fontFamily,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  glow: {
    backgroundColor: '#fff',
    borderRadius: 180,
    height: 260,
    position: 'absolute',
    width: 260,
  },
  mark: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 54,
    borderWidth: 4,
    height: 108,
    justifyContent: 'center',
    marginBottom: 26,
    width: 108,
  },
  markText: {
    color: '#fff',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 60,
    lineHeight: 64,
  },
  message: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 18,
    lineHeight: 24,
    marginTop: 18,
    maxWidth: 310,
    textAlign: 'center',
  },
  title: {
    color: '#fff',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 34,
    lineHeight: 38,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
