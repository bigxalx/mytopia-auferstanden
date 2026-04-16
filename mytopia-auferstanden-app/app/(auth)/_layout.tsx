import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';

import { hasCompletedFirstRunOnboarding, markFirstRunOnboardingComplete } from '@/src/core/onboarding/firstRunOnboarding';
import { FirstRunOnboardingProvider } from '@/src/features/auth/firstRunOnboardingContext';
import { theme } from '@/src/shared/ui/theme';

export default function AuthLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();
  const [hasPendingOnboarding, setHasPendingOnboarding] = useState(false);
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);
  const hasStartedOnboardingPresentation = useRef(false);

  const isOnboardingRoute = String(segments[1]) === 'onboarding';

  useEffect(() => {
    let isMounted = true;

    void hasCompletedFirstRunOnboarding()
      .then((hasCompleted) => {
        if (!isMounted) {
          return;
        }

        setHasPendingOnboarding(!hasCompleted);
        setIsCheckingOnboarding(false);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setHasPendingOnboarding(true);
        setIsCheckingOnboarding(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isCheckingOnboarding || !hasPendingOnboarding) {
      hasStartedOnboardingPresentation.current = false;
      return;
    }

    if (isOnboardingRoute) {
      hasStartedOnboardingPresentation.current = false;
      return;
    }

    if (hasStartedOnboardingPresentation.current) {
      return;
    }

    hasStartedOnboardingPresentation.current = true;
    router.push('../onboarding');
  }, [hasPendingOnboarding, isCheckingOnboarding, isOnboardingRoute, router]);

  const handleOnboardingComplete = async () => {
    await markFirstRunOnboardingComplete();
    setHasPendingOnboarding(false);
  };

  const isBlockingInteraction = isCheckingOnboarding || (hasPendingOnboarding && !isOnboardingRoute);

  return (
    <FirstRunOnboardingProvider
      value={{
        completeOnboarding: handleOnboardingComplete,
        hasPendingOnboarding,
        isCheckingOnboarding,
      }}
    >
      <View style={styles.container}>
        <View
          style={[
            styles.inner,
            {
              paddingBottom: Math.max(insets.bottom, 24),
              paddingTop: insets.top + 24,
            },
          ]}
        >
          <View style={styles.content}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoTitle}>Mytopia</Text>
              <Text style={styles.logoSubtitle}>Auferstanden aus Rache</Text>
            </View>
            <View style={styles.stackContainer}>
              <Stack
                screenOptions={{
                  contentStyle: { backgroundColor: 'transparent' },
                  headerShown: false,
                }}
              >
                <Stack.Screen name="sign-in" />
                <Stack.Screen name="sign-up" />
                <Stack.Screen
                  name="onboarding"
                  options={{
                    animation: Platform.OS === 'android' ? 'slide_from_bottom' : 'default',
                    gestureEnabled: false,
                    presentation: Platform.OS === 'android' ? 'fullScreenModal' : 'modal',
                  }}
                />
              </Stack>
            </View>
          </View>
        </View>

        {isBlockingInteraction ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={theme.colors.orange} size="large" />
          </View>
        ) : null}
      </View>
    </FirstRunOnboardingProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 420,
    width: '100%',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 20,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  logoTitle: {
    color: theme.colors.textPrimary,
    fontFamily: 'Nunito_700Bold',
    fontSize: 36,
    lineHeight: 40,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  logoSubtitle: {
    color: theme.colors.textSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  stackContainer: {
    flex: 1,
  },
});
