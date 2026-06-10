import { ThemeProvider } from '@react-navigation/native';
import { AppNavigationTheme } from '@/src/shared/ui/theme';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { AppProviders } from '@/src/core/providers/AppProviders';
import { registerBackgroundNarrativeHandler } from '@/src/core/firebase/messagingClient';
import { useFonts } from 'expo-font';
import { Nunito_400Regular, Nunito_700Bold } from '@expo-google-fonts/nunito';
import { NunitoSans_400Regular, NunitoSans_700Bold } from '@expo-google-fonts/nunito-sans';
import { PrivacyManager } from '@/src/core/firebase/privacyManager';
import { useEffect } from 'react';
import * as SystemUI from 'expo-system-ui';
import { Pressable } from 'react-native';
import { createNativeTabStackOptions } from '@/src/shared/navigation/nativeTabStackOptions';
import { NarrativeNotificationBridge } from '@/src/features/thread/components/NarrativeNotificationBridge';
import { BrandedLaunchScreen } from '@/src/shared/ui/BrandedLaunchScreen';

// Register FCM background handler before React tree mounts
registerBackgroundNarrativeHandler();

export default function RootLayout() {
  const [loaded] = useFonts({
    Nunito_400Regular,
    Nunito_700Bold,
    NunitoSans_400Regular,
    NunitoSans_700Bold,
  });

  useEffect(() => {
    void PrivacyManager.initialize();
    void SystemUI.setBackgroundColorAsync(AppNavigationTheme.colors.background);
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppProviders>
        {!loaded ? (
          <BrandedLaunchScreen />
        ) : (
          <ThemeProvider value={AppNavigationTheme}>
            <NarrativeNotificationBridge />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: AppNavigationTheme.colors.background },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="live/session" />
              <Stack.Screen name="welcome-back" />
              <Stack.Screen
                name="(modals)/tasks/[taskId]"
                options={({ navigation }) => ({
                  ...createNativeTabStackOptions({
                    title: 'Mission',
                    largeTitle: false,
                  }),

                  headerShown: true,
                  headerBackVisible: false,
                  headerLeft: () => (
                    <Pressable
                      accessibilityLabel="Mission schließen"
                      hitSlop={8}
                      onPress={() => navigation.goBack()}
                      style={{
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 4,
                      }}
                    >
                      <MaterialIcons color={AppNavigationTheme.colors.text} name="close" size={24} />
                    </Pressable>
                  ),
                  presentation: 'modal',
                  title: 'Mission',
                })}
              />
              <Stack.Screen
                name="(modals)/profile/missions"
                options={({ navigation }) => ({
                  ...createNativeTabStackOptions({
                    title: 'Alle Missionen',
                    largeTitle: false,
                  }),
                  headerShown: true,
                  headerBackVisible: false,
                  headerLeft: () => (
                    <Pressable
                      accessibilityLabel="Missionen schließen"
                      hitSlop={8}
                      onPress={() => navigation.goBack()}
                      style={{
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 4,
                      }}
                    >
                      <MaterialIcons color={AppNavigationTheme.colors.text} name="close" size={24} />
                    </Pressable>
                  ),
                  presentation: 'modal',
                  title: 'Alle Missionen',
                })}
              />
              <Stack.Screen
                name="(modals)/profile/logbook"
                options={({ navigation }) => ({
                  ...createNativeTabStackOptions({
                    title: 'Logbuch',
                    largeTitle: false,
                  }),
                  headerShown: true,
                  headerBackVisible: false,
                  headerLeft: () => (
                    <Pressable
                      accessibilityLabel="Logbuch schließen"
                      hitSlop={8}
                      onPress={() => navigation.goBack()}
                      style={{
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 4,
                      }}
                    >
                      <MaterialIcons color={AppNavigationTheme.colors.text} name="close" size={24} />
                    </Pressable>
                  ),
                  presentation: 'modal',
                  title: 'Logbuch',
                })}
              />
              <Stack.Screen
                name="(modals)/profile/badges/[badgeId]"
                options={({ navigation }) => ({
                  ...createNativeTabStackOptions({
                    title: 'Abzeichen',
                    largeTitle: false,
                  }),
                  headerShown: true,
                  headerBackVisible: false,
                  headerLeft: () => (
                    <Pressable
                      accessibilityLabel="Abzeichen schließen"
                      hitSlop={8}
                      onPress={() => navigation.goBack()}
                      style={{
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 4,
                      }}
                    >
                      <MaterialIcons color={AppNavigationTheme.colors.text} name="close" size={24} />
                    </Pressable>
                  ),
                  presentation: 'modal',
                  title: 'Abzeichen',
                })}
              />
            </Stack>
          </ThemeProvider>
        )}
        <StatusBar style="auto" />
      </AppProviders>
    </SafeAreaProvider>
  );
}
