import { Stack } from 'expo-router';
import { theme } from '@/src/shared/ui/theme';
import { Platform, Text, StyleSheet } from 'react-native';
import { useSession } from '@/src/core/session/SessionContext';

export default function FeedTabLayout() {
  const { selectedMode } = useSession();
  console.log('[DEBUG] FeedTabLayout Rendering - Expecting RNScreens warning if scrollEdgeEffects+blurEffect present');
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerRight: () => (
            selectedMode === 'dev' ? (
              <Text style={styles.modeBadge}>Dev Mode</Text>
            ) : null
          ),
          // iOS
          ...(Platform.OS === 'ios'

            // Before iOS 26 -- No Liquid Glass
            ? parseFloat(String(Platform.Version)) < 26 && {
              headerBlurEffect: 'systemThickMaterialDark',
            } :

            // Android
            {
              headerStyle: {
                backgroundColor: theme.colors.background,
              },
            }
          ),
          headerLargeTitle: true,
          headerLargeTitleStyle: {
            color: theme.colors.textPrimary,
            fontFamily: theme.typography.title.fontFamily,
          },
          headerTintColor: theme.colors.textPrimary,
          headerTitleStyle: {
            color: theme.colors.textPrimary,
            fontFamily: theme.typography.title.fontFamily,

          },
          scrollEdgeEffects: {
            top: "hard",
          },
          title: 'Notfallkanal',

        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  devModeContainer: {
    marginRight: 10,
  },
  modeBadge: {
    color: theme.colors.orange,
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
    textTransform: 'uppercase'
  },
});
