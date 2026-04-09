import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Image as ExpoImage, type ImageProps } from 'expo-image';

import { theme } from '@/src/shared/ui/theme';

type AppImageProps = Omit<ImageProps, 'source'> & {
  fallbackLabel?: string;
  showErrorState?: boolean;
  style: StyleProp<ImageStyle>;
  uri: string;
};

export function AppImage({
  fallbackLabel = 'Bild konnte nicht geladen werden.',
  showErrorState = true,
  style,
  transition = 200,
  uri,
  ...imageProps
}: AppImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
  }, [uri]);

  const flattenedStyle = (StyleSheet.flatten(style) ?? {}) as ImageStyle;
  const borderRadius = typeof flattenedStyle.borderRadius === 'number' ? flattenedStyle.borderRadius : 0;

  const handleLoad: NonNullable<ImageProps['onLoad']> = (event) => {
    setIsLoading(false);
    imageProps.onLoad?.(event);
  };

  const handleError: NonNullable<ImageProps['onError']> = (event) => {
    setHasError(true);
    setIsLoading(false);
    imageProps.onError?.(event);
  };

  return (
    <View style={[styles.container, style, { borderRadius }]}>
      <ExpoImage
        {...imageProps}
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        cachePolicy="disk"
        transition={transition}
        onError={handleError}
        onLoad={handleLoad}
      />

      {isLoading && !hasError ? (
        <View pointerEvents="none" style={styles.placeholder}>
          <ActivityIndicator color={theme.colors.cardTextPrimary} />
        </View>
      ) : null}

      {hasError && showErrorState ? (
        <View pointerEvents="none" style={styles.errorState}>
          <Text style={styles.errorText}>{fallbackLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.cardSubtleBackground,
    overflow: 'hidden',
  } as ViewStyle,
  errorState: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: theme.colors.cardSubtleBackground,
    justifyContent: 'center',
    paddingHorizontal: 16,
  } as ViewStyle,
  errorText: {
    color: theme.colors.cardTextPrimary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  } as TextStyle,
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(237, 236, 224, 0.82)',
    justifyContent: 'center',
  } as ViewStyle,
});
