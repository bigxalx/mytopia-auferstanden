import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { theme } from '@/src/shared/ui/theme';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';
import { GpsRunner } from '@/src/features/tasks/components/GpsRunner';
import { QuizChatStep } from './QuizChatStep';

/**
 * The inline chat input card for active missions.
 * Anchored above the tab bar.
 */
export const MissionChatInput: React.FC = () => {
  const { 
    activeMission, 
    focusedMissionId, 
    setFocus, 
    completeMission, 
    insertQuizAnswerBubble 
  } = useActiveMission();
  
  const insets = useSafeAreaInsets();
  const [textInput, setTextInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Quiz State
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);

  // Reset local state when mission changes
  useEffect(() => {
    setTextInput('');
    setQuizAnswers([]);
    setCurrentQuizIndex(0);
    setIsSubmitting(false);
  }, [focusedMissionId]);

  if (!focusedMissionId || !activeMission) return null;

  const handleClose = () => {
    setFocus(null);
  };

  const handleSubmit = async (payloadOverride?: any) => {
    setIsSubmitting(true);
    try {
      let payload = payloadOverride;
      if (!payload) {
        if (activeMission.kind === 'text') {
          payload = { text: textInput };
        } else if (activeMission.kind === 'quiz') {
           payload = { answers: quizAnswers };
        }
      }
      
      await completeMission(activeMission._id, payload);
    } catch (err) {
      console.warn('[MissionChatInput] Submit failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuizOptionSelect = (index: number, text: string) => {
    const isLast = currentQuizIndex === (activeMission.questions?.length || 1) - 1;
    const newAnswers = [...quizAnswers, index];
    
    // Insert answer bubble
    insertQuizAnswerBubble(activeMission.title, text);
    
    if (isLast) {
      setQuizAnswers(newAnswers);
      void handleSubmit({ answers: newAnswers });
    } else {
      setQuizAnswers(newAnswers);
      setCurrentQuizIndex(prev => prev + 1);
    }
  };

  // Logic to calculate bottom offset to be above tab bar
  const bottomOffset = insets.bottom + (Platform.OS === 'android' ? 70 : 54);

  return (
    <View style={[styles.wrapper, { bottom: bottomOffset }]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.indicator} />
          <View style={styles.headerBody}>
            <Text style={styles.missionLabel}>AKTIVE MISSION</Text>
            <Text style={styles.missionTitle} numberOfLines={1}>
              {activeMission.title}
            </Text>
          </View>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close-circle" size={20} color="rgba(0,0,0,0.3)" />
          </Pressable>
        </View>

        {/* Input Area */}
        <View style={styles.inputArea}>
          {activeMission.kind === 'text' && (
            <View style={styles.textRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Deine Antwort..."
                placeholderTextColor="#9ca3af"
                value={textInput}
                onChangeText={setTextInput}
                multiline
                editable={!isSubmitting}
              />
              <Pressable
                disabled={isSubmitting || !textInput.trim()}
                style={[styles.sendButton, (isSubmitting || !textInput.trim()) && styles.disabled]}
                onPress={() => handleSubmit()}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Feather name="send" size={18} color="white" />
                )}
              </Pressable>
            </View>
          )}

          {activeMission.kind === 'quiz' && activeMission.questions && (
            <QuizChatStep
              question={activeMission.questions[currentQuizIndex]}
              onSelect={handleQuizOptionSelect}
              isSubmitting={isSubmitting}
            />
          )}

          {activeMission.kind === 'photo' && (
            <View style={styles.photoActions}>
               <Pressable 
                style={styles.actionBtn} 
                onPress={() => Alert.alert('Kamera', 'Funktion folgt...')}
                disabled={isSubmitting}
               >
                 <Feather name="camera" size={20} color="white" />
                 <Text style={styles.btnText}>KAMERA</Text>
               </Pressable>
               <Pressable 
                style={styles.actionBtn} 
                onPress={() => Alert.alert('Galerie', 'Funktion folgt...')}
                disabled={isSubmitting}
               >
                 <Feather name="image" size={20} color="white" />
                 <Text style={styles.btnText}>GALERIE</Text>
               </Pressable>
            </View>
          )}

          {activeMission.kind === 'gps' && activeMission.gpsConfig && (
            <GpsRunner
              embedded
              compact
              missionId={activeMission._id}
              target={activeMission.gpsConfig}
              onComplete={async () => {
                await handleSubmit({ joined: true });
                return { earned: activeMission.points };
              }}
            />
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 8,
    right: 8,
    zIndex: 2000,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  indicator: {
    width: 3,
    height: 30,
    backgroundColor: theme.colors.orange,
    borderRadius: 1.5,
  },
  headerBody: {
    flex: 1,
  },
  missionLabel: {
    fontSize: 9,
    fontFamily: 'NunitoSans_700Bold',
    color: '#9ca3af',
    letterSpacing: 0.5,
  },
  missionTitle: {
    fontSize: 14,
    fontFamily: 'NunitoSans_700Bold',
    color: '#111827',
  },
  closeButton: {
    padding: 2,
  },
  inputArea: {
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 14,
    padding: 6,
  },
  textRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 10,
    minHeight: 44,
    maxHeight: 120,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 15,
    color: '#111827',
  },
  sendButton: {
    backgroundColor: theme.colors.orange,
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
    padding: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.orange,
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: {
    color: 'white',
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
