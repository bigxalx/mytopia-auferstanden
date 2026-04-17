import React from 'react';
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';

import {
  NARRATIVE_REACTION_OPTIONS,
  type NarrativeMessageReactionState,
} from '@/src/features/feed/reactions/reactionCatalog';
import { theme } from '@/src/shared/ui/theme';

export function NarrativeReactionBadges({
  containerStyle,
  isUser = false,
  reactionState,
}: {
  containerStyle?: ViewStyle | ViewStyle[];
  isUser?: boolean;
  reactionState?: NarrativeMessageReactionState | null;
}) {
  if (!reactionState) {
    return null;
  }

  const visibleOptions = NARRATIVE_REACTION_OPTIONS.filter((option) => {
    const count =
      reactionState.counts[option.id] ??
      (reactionState.viewerReaction === option.id ? 1 : 0);
    return count > 0;
  });

  if (visibleOptions.length === 0) {
    return null;
  }

  return (
    <View style={[styles.row, isUser && styles.rowUser, containerStyle]}>
      {visibleOptions.map((option) => {
        const count =
          reactionState.counts[option.id] ??
          (reactionState.viewerReaction === option.id ? 1 : 0);
        const isActive = reactionState.viewerReaction === option.id;

        return (
          <View
            key={option.id}
            style={[styles.badge, isActive && styles.badgeActive]}
          >
            <Text style={styles.emoji}>{option.emoji}</Text>
            {count > 1 ? (
              <Text style={[styles.count, isActive && styles.countActive]}>{count}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  } as ViewStyle,
  rowUser: {
    justifyContent: 'flex-end',
  } as ViewStyle,
  badge: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  } as ViewStyle,
  badgeActive: {
    backgroundColor: theme.colors.accent,
    shadowOpacity: 0.24,
    shadowRadius: 3,
    elevation: 3,
  } as ViewStyle,
  emoji: {
    fontSize: 14,
  } as TextStyle,
  count: {
    color: '#1f2937',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
  } as TextStyle,
  countActive: {
    color: '#1f2937',
  } as TextStyle,
});
