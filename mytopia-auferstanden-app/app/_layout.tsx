import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppProviders } from '@/src/core/providers/AppProviders';
import { useFonts } from 'expo-font';
import { Nunito_400Regular, Nunito_700Bold } from '@expo-google-fonts/nunito';
import { NunitoSans_400Regular, NunitoSans_700Bold } from '@expo-google-fonts/nunito-sans';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    Nunito_400Regular,
    Nunito_700Bold,
    NunitoSans_400Regular,
    NunitoSans_700Bold,
  });

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {loaded && (
        <ThemeProvider value={DarkTheme}>
          <AppProviders>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" options={{ title: 'Zurück', headerBackTitle: 'Zurück' }} />
              <Stack.Screen name="welcome-back" />
              <Stack.Screen name="tasks/[taskId]" options={{ headerShown: true, title: 'Mission', headerBackTitle: 'Zurück' }} />
            </Stack>
          </AppProviders>
          <StatusBar style="auto" />
        </ThemeProvider>
      )}
    </SafeAreaProvider>
  );
}
