import React from 'react';
import { StyleSheet, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native';
import { theme } from '@/src/shared/ui/theme';

interface QuizQuestion {
  questionText: string;
  options: string[];
}

interface QuizChatStepProps {
  question: QuizQuestion;
  onSelect: (index: number, text: string) => void;
  isSubmitting?: boolean;
}

/**
 * Renders a single quiz question and its options for the inline chat input.
 */
export const QuizChatStep: React.FC<QuizChatStepProps> = ({ 
  question, 
  onSelect,
  isSubmitting 
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.questionText}>{question.questionText}</Text>
      <View style={styles.optionsWrap}>
        {question.options.map((option, idx) => (
          <Pressable
            key={`${idx}-${option}`}
            style={({ pressed }) => [
              styles.optionButton,
              pressed && styles.pressed,
              isSubmitting && styles.disabled
            ]}
            disabled={isSubmitting}
            onPress={() => onSelect(idx, option)}
          >
            <Text style={styles.optionText}>{option}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 8,
  } as ViewStyle,
  questionText: {
    fontSize: 14,
    fontFamily: 'NunitoSans_700Bold',
    color: '#374151',
    marginBottom: 12,
  } as TextStyle,
  optionsWrap: {
    gap: 8,
  } as ViewStyle,
  optionButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  } as ViewStyle,
  optionText: {
    fontSize: 14,
    fontFamily: 'NunitoSans_600SemiBold',
    color: '#111827',
  } as TextStyle,
  pressed: {
    backgroundColor: '#f3f4f6',
    transform: [{ scale: 0.98 }],
  } as ViewStyle,
  disabled: {
    opacity: 0.5,
  } as ViewStyle,
});
