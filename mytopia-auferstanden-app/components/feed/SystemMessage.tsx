import React from 'react';
import { StyleSheet, Text, View, ViewStyle, TextStyle } from 'react-native';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';

interface SystemMessageProps {
  text: string;
  style?: ViewStyle;
  variant?: 'neutral' | 'prominent';
  actionLabel?: string;
  actionType?: 'resumeMission';
}

/**
 * A centered message for system feedback.
 * - 'neutral': small pill for status info.
 * - 'prominent': larger text for rewards/points.
 */
export const SystemMessage: React.FC<SystemMessageProps> = ({
  text,
  style,
  variant = 'neutral',
  actionLabel,
  actionType,
}) => {
  const isProminent = variant === 'prominent';
  const { resumeInterruptedMission } = useActiveMission();
  const hasAction = Boolean(actionLabel?.trim()) && actionType === 'resumeMission';

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.pill, isProminent && styles.prominentPill]}>
        {hasAction ? (
          <Text style={[styles.inlineText, isProminent && styles.prominentInlineText]}>
            <Text>{text} </Text>
            <Text style={styles.actionText} onPress={resumeInterruptedMission}>
              {actionLabel}
            </Text>
          </Text>
        ) : (
          <Text style={[styles.text, isProminent && styles.prominentText]}>{text}</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 4,
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
    fontSize: 12,
    textAlign: 'center',
  } as TextStyle,
  prominentText: {
    color: '#FFFFFF',
    fontSize: 14,
  } as TextStyle,
  inlineText: {
    color: 'rgba(238, 242, 239, 0.82)',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  } as TextStyle,
  prominentInlineText: {
    color: '#FFFFFF',
    fontSize: 14,
  } as TextStyle,
  actionText: {
    color: '#FFFFFF',
    fontFamily: 'NunitoSans_800ExtraBold',
    textDecorationLine: 'underline',
  } as TextStyle,
});
