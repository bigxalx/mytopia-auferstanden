import { Stack } from 'expo-router';
import { StyleSheet, Text, View, ImageBackground } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/shared/ui/theme';

export default function AuthLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('@/assets/images/signin-background.jpg')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      >
        <View style={[
          styles.overlay,
          {
            paddingTop: insets.top,
            paddingBottom: Math.max(insets.bottom, 20)
          }
        ]}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoTitle}>Mytopia</Text>
            <Text style={styles.logoSubtitle}>Auferstanden aus Ruinen</Text>
          </View>
          <View style={styles.stackContainer}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  logoContainer: {
    alignItems: 'center',
    marginVertical: 64
  },
  logoTitle: {
    ...theme.typography.h1,
    color: '#fff',
    fontSize: 32,
    lineHeight: 34,
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  logoSubtitle: {
    ...theme.typography.h1,
    color: '#fff',
    fontSize: 20,
    opacity: 0.8,
    marginBottom: 0,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 8,
  },
  stackContainer: {
    flex: 1,
  },
});

