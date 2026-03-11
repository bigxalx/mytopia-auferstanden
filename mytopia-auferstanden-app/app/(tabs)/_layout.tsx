import { Tabs, Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { ChatLineBold, MapBold, UserBold } from '@/components/ui/SolarTabIcons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/src/core/session/SessionContext';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { isHydrated, shouldShowWelcomeBack, user } = useSession();

  if (!isHydrated) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (shouldShowWelcomeBack) {
    return <Redirect href="../welcome-back" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#eef2ef',
        tabBarInactiveTintColor: '#5d6979',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#3f454a',
          borderTopColor: '#1f2937',
        },
        tabBarLabelStyle: {
          fontFamily: 'NunitoSans_700Bold',
        },
      }}>
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Notfallkanal',
          tabBarIcon: ({ color }) => <ChatLineBold size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <UserBold size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Karte',
          tabBarIcon: ({ color }) => <MapBold size={28} color={color} />,
        }}
      />
      {/* Hidden routes that must exist as files but aren't shown as tabs */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="tasks" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
