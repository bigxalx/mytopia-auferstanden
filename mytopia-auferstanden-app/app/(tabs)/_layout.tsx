import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import { theme } from '@/src/shared/ui/theme';
import { NarrativeSignalProvider, useNarrativeSignal } from '@/src/features/feed/data/NarrativeSignalContext';

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
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme.colors.orange} />
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
      <NativeTabs
        // Sets UITabBarController.view.backgroundColor at the native layer before any JS renders,
        // preventing the white flash during tab transitions.
        // @ts-ignore — nativeContainerStyle passes through to Tabs.Host (react-native-screens)
        nativeContainerStyle={{ backgroundColor: theme.colors.background }}
        backgroundColor={theme.colors.background}
        blurEffect="systemThinMaterialDark"
        indicatorColor="#3b83f646"
        rippleColor="transparent"
        disableTransparentOnScrollEdge
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
                color: '#c3daffff',
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
          disableScrollToTop
          contentStyle={{ backgroundColor: theme.colors.background }}
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

        <NativeTabs.Trigger
          name="profile"
          contentStyle={{ backgroundColor: theme.colors.background }}
        >
          <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require('../../assets/icons/tabs/profile.png')}
            renderingMode="template"
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger
          name="map"
          contentStyle={{ backgroundColor: theme.colors.background }}
        >
          <NativeTabs.Trigger.Label>Karte</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require('../../assets/icons/tabs/map.png')}
            renderingMode="template"
            selectedColor={theme.colors.blue}
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="index" hidden />
      </NativeTabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
});
