import { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { theme } from '@/src/shared/ui/theme';

type SurfaceCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

export function SurfaceCard({ children, style }: SurfaceCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.headerBackground,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  } as ViewStyle,
});
