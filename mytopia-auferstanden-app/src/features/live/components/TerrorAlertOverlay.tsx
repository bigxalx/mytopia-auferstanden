import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, Vibration, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DangerTriangleBold } from '@/components/ui/SolarTabIcons';
import type { LiveEventDto } from '@/src/features/live/data/liveSessionClient';

export function TerrorAlertOverlay({ event }: { event: LiveEventDto }) {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const strobe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, {
            duration: 360,
            easing: Easing.out(Easing.cubic),
            toValue: 1.12,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            duration: 520,
            easing: Easing.in(Easing.cubic),
            toValue: 1,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(glow, { duration: 360, toValue: 1, useNativeDriver: true }),
          Animated.timing(glow, { duration: 520, toValue: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(strobe, { duration: 90, toValue: 1, useNativeDriver: true }),
          Animated.timing(strobe, { duration: 280, toValue: 0, useNativeDriver: true }),
        ]),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [glow, pulse, strobe]);

  useEffect(() => {
    Vibration.vibrate([0, 420, 160, 420, 160, 820, 220, 420], true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);

    return () => {
      Vibration.cancel();
    };
  }, []);

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
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.34] }),
            transform: [{ scale: pulse }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.strobe,
          {
            opacity: strobe.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }),
          },
        ]}
      />

      <View style={styles.alertPill}>
        <Text style={styles.alertPillText}>Live-Alarm</Text>
      </View>

      <Animated.View style={[styles.markShell, { transform: [{ scale: pulse }] }]}>
        <View style={styles.markOuter}>
          <View style={styles.markInner}>
            <View style={styles.markIconSlot}>
              <DangerTriangleBold color="#fff" size={58} />
            </View>
          </View>
        </View>
      </Animated.View>

      <View style={styles.copy}>
        <Text style={styles.kicker}>Sofort beachten</Text>
        <Text
          adjustsFontSizeToFit
          android_hyphenationFrequency="full"
          lineBreakStrategyIOS="standard"
          minimumFontScale={0.74}
          numberOfLines={2}
          style={styles.title}
        >
          {formatAlertTitle(title)}
        </Text>
        <Text style={styles.message}>{message}</Text>
      </View>

      <View style={styles.directiveBox}>
        <Text style={styles.directiveText}>Bitte bleib im Saal und folge den Anweisungen der Bühne.</Text>
      </View>
    </View>
  );
}

function formatAlertTitle(title: string) {
  return title.replace(/Terrorwarnung/gi, 'Terror\u00ADwarnung');
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: '#941414',
    gap: 28,
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 1000,
  },
  alertPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.34)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  alertPillText: {
    color: '#fff',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  copy: {
    alignItems: 'center',
    gap: 10,
  },
  directiveBox: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#fff7ed',
    borderColor: 'rgba(255, 255, 255, 0.58)',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 360,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  directiveText: {
    color: '#991b1b',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  glow: {
    backgroundColor: '#fecaca',
    borderRadius: 260,
    height: 320,
    position: 'absolute',
    top: 104,
    width: 320,
  },
  kicker: {
    color: 'rgba(255, 255, 255, 0.86)',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 13,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  markInner: {
    alignItems: 'center',
    backgroundColor: '#dc2626',
    borderColor: 'rgba(255, 255, 255, 0.78)',
    borderRadius: 56,
    borderWidth: 3,
    height: 112,
    justifyContent: 'center',
    width: 112,
  },
  markIconSlot: {
    alignItems: 'center',
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  markOuter: {
    alignItems: 'center',
    backgroundColor: 'rgba(254, 202, 202, 0.18)',
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 80,
    borderWidth: 2,
    height: 160,
    justifyContent: 'center',
    width: 160,
  },
  markShell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    color: 'rgba(255, 255, 255, 0.94)',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 18,
    lineHeight: 25,
    maxWidth: 330,
    textAlign: 'center',
  },
  strobe: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
  },
  title: {
    color: '#fff',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 28,
    lineHeight: 32,
    maxWidth: 320,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
