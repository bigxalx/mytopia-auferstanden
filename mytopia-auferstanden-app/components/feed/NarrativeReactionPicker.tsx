import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';

import {
  NARRATIVE_REACTION_OPTIONS,
  type NarrativeReactionId,
} from '@/src/features/feed/reactions/reactionCatalog';
import { theme } from '@/src/shared/ui/theme';

export function NarrativeReactionPicker({
  disabled = false,
  onSelect,
  selectedReaction,
}: {
  disabled?: boolean;
  onSelect: (reactionId: NarrativeReactionId) => void;
  selectedReaction: NarrativeReactionId | null;
}) {
  return (
    <View style={styles.row}>
      {NARRATIVE_REACTION_OPTIONS.map((option) => {
        const isActive = selectedReaction === option.id;

        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="button"
            disabled={disabled}
            key={option.id}
            onPress={() => onSelect(option.id)}
            style={({ pressed }) => [
              styles.option,
              isActive && styles.optionActive,
              pressed && !disabled && styles.optionPressed,
            ]}
          >
            <Text style={styles.emoji}>{option.emoji}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(37, 43, 48, 0.74)',
    borderColor: theme.colors.overlayBorder,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  } as ViewStyle,
  option: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 999,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  } as ViewStyle,
  optionActive: {
    backgroundColor: theme.colors.orangeSoft,
    borderColor: theme.colors.orangeStroke,
  } as ViewStyle,
  optionPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.97 }],
  } as ViewStyle,
  emoji: {
    fontSize: 25,
  } as TextStyle,
});
