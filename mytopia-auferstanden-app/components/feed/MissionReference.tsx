import React from 'react';
import { StyleSheet, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native';
import { theme } from '@/src/shared/ui/theme';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';

interface Props {
  missionId?: string;
  missionTitle: string;
  label?: string;
  compact?: boolean;
  style?: ViewStyle;
}

export function MissionReference({
  missionId,
  missionTitle,
  label = 'REFERENZ ZUR MISSION',
  compact = false,
  style,
}: Props) {
  const { scrollToMessage } = useActiveMission();

  const handlePress = () => {
    scrollToMessage(missionId || missionTitle);
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        compact && styles.compact,
        style,
        pressed && styles.pressed,
      ]}
      onPress={handlePress}
    >
      <View style={styles.indicator} />
      <View style={styles.content}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {missionTitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'stretch',
  } as ViewStyle,
  compact: {
    backgroundColor: 'transparent',
    borderRadius: 0,
  } as ViewStyle,
  indicator: {
    width: 4,
    backgroundColor: theme.colors.orange,
  } as ViewStyle,
  content: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flex: 1,
  } as ViewStyle,
  label: {
    fontSize: 10,
    fontFamily: 'NunitoSans_700Bold',
    color: theme.colors.orange,
    letterSpacing: 0.5,
    marginBottom: 2,
  } as TextStyle,
  title: {
    fontSize: 13,
    fontFamily: 'NunitoSans_600SemiBold',
    color: theme.colors.cardTextPrimary,
  } as TextStyle,
  pressed: {
    opacity: 0.7,
  } as ViewStyle,
});
