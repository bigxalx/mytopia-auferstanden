import React from 'react';
import { StyleSheet, View, Text, Pressable, Platform } from 'react-native';
import { theme } from '@/src/shared/ui/theme';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeOutDown, Easing } from 'react-native-reanimated';

/**
 * Modern selection UI for quiz choices that appears at the bottom of the feed.
 * Replaces the standard chat input during a quiz session.
 */
export const MissionChoicePicker: React.FC = () => {
  const { activeChannel, quizSession, submitQuizStep, pauseQuiz } = useActiveMission();
  const insets = useSafeAreaInsets();

  if (activeChannel.channelType !== 'actor') return null;
  if (!quizSession || !quizSession.showPicker) return null;

  const currentQuestion = quizSession.questions[quizSession.currentIndex];
  if (!currentQuestion) return null;

  const handleClose = () => {
    pauseQuiz();
  };

  // Position it above the tab bar consistent with MissionChatInput
  const bottomOffset = insets.bottom + (Platform.OS === 'android' ? 70 : 54);

  return (
    <Animated.View 
      entering={FadeInUp.duration(400).easing(Easing.out(Easing.quad))}
      exiting={FadeOutDown.duration(300)}
      style={[styles.wrapper, { bottom: bottomOffset }]}
    >
      <View style={styles.container}>
        <View style={styles.header}>
            <View style={styles.headerPlaceholder} />
            <Text style={styles.label}>ANTWORT WÄHLEN</Text>
            <Pressable 
              style={styles.closeButton}
              onPress={handleClose}
            >
              <Ionicons name="close-circle" size={24} color={theme.colors.cardTextMuted} />
            </Pressable>
        </View>
        <View style={styles.optionsContainer}>
          {currentQuestion.options.map((option: any, index: number) => {
            const text = 
              typeof option === 'string' ? option :
              option?.text || 
              option?.label || 
              option?.title || 
              (option != null ? String(option) : '');
              
            return (
              <Pressable
                key={index}
                style={({ pressed }) => [
                  styles.optionButton,
                  pressed && styles.optionButtonPressed
                ]}
                onPress={() => submitQuizStep(index)}
              >
                <Text style={styles.optionText}>{text}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 3000,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  header: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    paddingBottom: 8,
  },
  headerPlaceholder: {
    width: 24,
  },
  closeButton: {
    padding: 4,
  },
  label: {
    fontSize: 10,
    fontFamily: 'NunitoSans_700Bold',
    color: theme.colors.orange,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  optionsContainer: {
    gap: 10,
  },
  optionButton: {
    backgroundColor: theme.colors.orange,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    shadowColor: theme.colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  optionButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  optionText: {
    color: 'white',
    fontFamily: 'Nunito_700Bold',
    fontSize: 16,
    textAlign: 'center',
  },
});
