import React from 'react';
import { StyleSheet, Text, View, ViewStyle, TextStyle } from 'react-native';

interface SystemMessageProps {
  text: string;
  style?: ViewStyle;
  variant?: 'neutral' | 'prominent';
}

/**
 * A centered message for system feedback.
 * - 'neutral': small pill for status info.
 * - 'prominent': larger text for rewards/points.
 */
export const SystemMessage: React.FC<SystemMessageProps> = ({ text, style, variant = 'neutral' }) => {
  const isProminent = variant === 'prominent';

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.pill, isProminent && styles.prominentPill]}>
        <Text style={[styles.text, isProminent && styles.prominentText]}>{text}</Text>
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
  prominentPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
  } as ViewStyle,
  text: {
    color: 'rgba(238, 242, 239, 0.7)',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 11,
    letterSpacing: 0.3,
    textAlign: 'center',
    textTransform: 'uppercase',
  } as TextStyle,
  prominentText: {
    color: '#FFFFFF',
    fontSize: 14,
    letterSpacing: 0.5,
  } as TextStyle,
});
