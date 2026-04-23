import { Image, ImageBackground, Platform, StyleSheet, View } from 'react-native';

export function BrandedLaunchScreen() {
  if (Platform.OS !== 'ios') {
    return (
      <View style={styles.androidContainer}>
        <Image
          source={require('../../../assets/images/android-splash-icon.png')}
          style={styles.androidIcon}
        />
      </View>
    );
  }

  return (
    <View style={styles.iosContainer}>
      <ImageBackground
        resizeMode="cover"
        source={require('../../../assets/images/splash-screen.png')}
        style={styles.iosImage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  androidContainer: {
    alignItems: 'center',
    backgroundColor: '#ff7a1a',
    flex: 1,
    justifyContent: 'center',
  },
  androidIcon: {
    height: 180,
    width: 180,
  },
  iosContainer: {
    backgroundColor: '#ff7a1a',
    flex: 1,
  },
  iosImage: {
    flex: 1,
  },
});
