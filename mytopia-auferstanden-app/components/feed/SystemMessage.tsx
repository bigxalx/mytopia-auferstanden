import React from 'react';
import { StyleSheet, Text, View, ViewStyle, TextStyle } from 'react-native';
import { theme } from '@/src/shared/ui/theme';

interface SystemMessageProps {
  text: string;
  style?: ViewStyle;
}

/**
 * A centered, neutral-style message for system feedback (points, status, etc.)
 */
export const SystemMessage: React.FC<SystemMessageProps> = ({ text, style }) => {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.pill}>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    paddingHorizontal: 20,
    width: '100%',
  } as ViewStyle,
  pill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  } as ViewStyle,
  text: {
    color: 'rgba(238, 242, 239, 0.7)',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 11,
    letterSpacing: 0.3,
    textAlign: 'center',
    textTransform: 'uppercase',
  } as TextStyle,
});
