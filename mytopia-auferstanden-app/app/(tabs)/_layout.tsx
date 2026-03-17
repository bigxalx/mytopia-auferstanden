import { Tabs, Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { ChatLineBold, MapBold, UserBold } from '@/components/ui/SolarTabIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/src/core/session/SessionContext';
import { MainHeader } from '@/src/shared/ui/MainHeader';

import { theme } from '@/src/shared/ui/theme';

const renderHeader = (props: any) => <MainHeader {...props} />;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { isHydrated, shouldShowWelcomeBack, user } = useSession();

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.headerBackground, paddingTop: insets.top }}>
        <View style={{
          backgroundColor: theme.colors.headerBackground,
          borderBottomColor: theme.colors.headerBorder,
          borderBottomWidth: 1,
          paddingHorizontal: 20,
          paddingVertical: 18,
          alignItems: 'center',
          gap: 6,
        }}>
          <Text style={{ 
            ...theme.typography.title,
            color: 'transparent' 
          }}>Loading</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.orange} />
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
        tabBarActiveTintColor: theme.colors.textPrimary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        headerShown: true,
        header: renderHeader,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: theme.colors.headerBackground,
          borderTopColor: theme.colors.headerBorder,
        },
        tabBarLabelStyle: {
          fontFamily: theme.typography.title.fontFamily,
          fontWeight: '700',
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
