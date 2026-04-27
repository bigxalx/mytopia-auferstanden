import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { theme } from '@/src/shared/ui/theme';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';
import { GpsRunner } from '@/src/features/tasks/components/GpsRunner';
import { PhotoRunner } from '@/src/features/tasks/components/PhotoRunner';

/**
 * The inline chat input card for active missions.
 * Anchored above the tab bar.
 */
export const MissionChatInput: React.FC<{
  bottomOffset?: number;
  onClose?: () => void;
  onRevealRequest?: () => void;
}> = ({
  bottomOffset,
  onClose,
  onRevealRequest,
}) => {
  const router = useRouter();
  const { 
    activeChannel,
    focusedMission,
    focusedMissionChannel,
    focusedMissionId,
    completeMission,
  } = useActiveMission();
  
  const insets = useSafeAreaInsets();
  const [textInput, setTextInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Reset local state when mission changes
  useEffect(() => {
    setTextInput('');
    setIsSubmitting(false);
  }, [focusedMissionId]);

  const isFocusedInCurrentChannel =
    focusedMissionChannel?.channelId === activeChannel.channelId &&
    focusedMissionChannel?.channelType === activeChannel.channelType;

  if (!focusedMissionId || !focusedMission || !isFocusedInCurrentChannel) return null;
  if (focusedMission.kind === 'quiz') return null;

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.dismissTo('/(tabs)/feed');
  };

  const handleSubmit = async (payloadOverride?: any) => {
    setIsSubmitting(true);
    try {
      let payload = payloadOverride;
      if (!payload) {
        if (focusedMission.kind === 'text') {
          payload = { text: textInput };
        }
      }

      await completeMission(focusedMission._id, payload);
    } catch (err) {
      console.warn('[MissionChatInput] Submit failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolvedBottomOffset =
    bottomOffset ?? (insets.bottom + (Platform.OS === 'android' ? 40 : 24));

  return (
    <View style={[styles.wrapper, { bottom: resolvedBottomOffset }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.missionTitle} numberOfLines={1}>
            {focusedMission.title}
          </Text>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close-circle" size={20} color="rgba(0,0,0,0.3)" />
          </Pressable>
        </View>

        {/* Input Area */}
        <View style={styles.inputArea}>
          {focusedMission.kind === 'text' && (
            <View style={styles.textRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Deine Antwort…"
                placeholderTextColor="#9ca3af"
                value={textInput}
                onChangeText={setTextInput}
                onFocus={onRevealRequest}
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

          {focusedMission.kind === 'photo' && (
            <PhotoRunner
              embedded
              missionId={focusedMission._id}
              onComplete={async ({ localUri, upload }) => {
                await handleSubmit({ localUri, upload });
                return { action: 'submitted' };
              }}
            />
          )}

          {focusedMission.kind === 'gps' && focusedMission.gpsConfig && (
            <GpsRunner
              embedded
              compact
              missionId={focusedMission._id}
              target={focusedMission.gpsConfig}
              onComplete={async () => {
                await handleSubmit({ action: 'checkin' });
                return { earned: 0 };
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
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  missionTitle: {
    flex: 1,
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
});
