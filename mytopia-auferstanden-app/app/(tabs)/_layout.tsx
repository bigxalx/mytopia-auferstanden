import { Tabs, Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { ChatLineBold, MapBold, UserBold } from '@/components/ui/SolarTabIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/src/core/session/SessionContext';
import { MainHeader } from '@/src/shared/ui/MainHeader';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { isHydrated, shouldShowWelcomeBack, user } = useSession();

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: '#3f454a', paddingTop: insets.top }}>
        <View style={{
          backgroundColor: '#3f454a',
          borderBottomColor: '#1f2937',
          borderBottomWidth: 1,
          paddingHorizontal: 20,
          paddingVertical: 18,
          alignItems: 'center',
          gap: 6,
        }}>
          <Text style={{ fontFamily: 'NunitoSans_700Bold', fontSize: 34, lineHeight: 46, color: 'transparent' }}>Loading</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
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
        headerShown: true,
        header: (props) => <MainHeader {...props} />,
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
          headerShown: true,
          tabBarIcon: ({ color }) => <MapBold size={28} color={color} />,
        }}
      />
      {/* Hidden routes that must exist as files but aren't shown as tabs */}
      <Tabs.Screen name="index" options={{ href: null, headerShown: false }} />
      <Tabs.Screen 
        name="tasks" 
        options={{ 
          href: null,
          title: 'Missionen'
        }} 
      />
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
