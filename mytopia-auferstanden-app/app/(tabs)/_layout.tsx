import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import { theme } from '@/src/shared/ui/theme';
import { NarrativeSignalProvider, useNarrativeSignal } from '@/src/features/feed/data/NarrativeSignalContext';
import { ChatLineBold, UserBold, MapBold } from '@/components/ui/SolarTabIcons';

export default function TabLayout() {
  return (
    <NarrativeSignalProvider>
      <TabLayoutInner />
    </NarrativeSignalProvider>
  );
}

function TabLayoutInner() {
  const { isHydrated, shouldShowWelcomeBack, user } = useSession();
  const { unreadCount } = useNarrativeSignal();

  if (!isHydrated) {
    return (
      <View style={styles.container}>
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
    <View style={styles.container}>
      <View style={styles.tabsContainer}>
        <NativeTabs
          backgroundColor={Platform.OS === 'android' ? theme.colors.background : undefined}
          blurEffect="systemThickMaterialDark"
          indicatorColor="#3b83f646"
          // disableIndicator={true}
          rippleColor="transparent"
          badgeBackgroundColor={theme.colors.blue}
          badgeTextColor={theme.colors.textPrimary}
          iconColor={{
            default: Platform.OS === 'android' ? theme.colors.textSecondary : '#8E8E93',
            selected: theme.colors.blue,
          }}
          labelStyle={
            Platform.OS === 'android'
              ? {
                default: {
                  color: 'rgba(238, 242, 239, 0.8)',
                  fontFamily: theme.typography.title.fontFamily,
                  fontWeight: '400',

                },
                selected: {
                  color: "#c3daffff",
                  fontFamily: 'NunitoSans_700Bold',
                },
              }
              : {
                fontFamily: theme.typography.title.fontFamily,
                fontWeight: '700',
              }
          }
        >
          <NativeTabs.Trigger
            name="feed"
            disableScrollToTop={true}
          >
            <NativeTabs.Trigger.Label>Notfallkanal</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon
              src={require('../../assets/icons/tabs/feed.png')}
              renderingMode="template"
              selectedColor={theme.colors.blue}
            />
            {unreadCount > 0 && (
              <NativeTabs.Trigger.Badge selectedBackgroundColor={theme.colors.blue}>
                {String(unreadCount)}
              </NativeTabs.Trigger.Badge>
            )}
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="profile">
            <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon
              src={require('../../assets/icons/tabs/profile.png')}
              renderingMode="template"
            // selectedColor={theme.colors.blue}
            />
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="map">
            <NativeTabs.Trigger.Label>Karte</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon
              src={require('../../assets/icons/tabs/map.png')}
              renderingMode="template"
              selectedColor={theme.colors.blue}
            />
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="index" hidden />
          <NativeTabs.Trigger name="tasks" hidden />
        </NativeTabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  tabsContainer: {
    flex: 1,
  },
});
