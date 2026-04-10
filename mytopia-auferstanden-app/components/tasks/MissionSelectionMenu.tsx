import React from 'react';
import { StyleSheet, View, Text, Modal, Pressable, ScrollView, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { theme } from '@/src/shared/ui/theme';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';
import { MISSION_KIND_METADATA, type MissionKind } from '@/src/features/tasks/data/missionRepository';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function MissionSelectionMenu({ visible, onClose }: Props) {
  const router = useRouter();
  const { availableMissions, focusedMissionId, setFocus } = useActiveMission();

  const handleSelect = (id: string) => {
    onClose();
    router.push(`/tasks/${id}`);
  };

  const handleClear = () => {
    setFocus(null);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>Missionen</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            {availableMissions.map((mission) => {
              const isActive = focusedMissionId === mission._id;
              const meta = MISSION_KIND_METADATA[mission.kind as MissionKind];

              return (
                <Pressable
                  key={mission._id}
                  style={[styles.item, isActive && styles.itemActive]}
                  onPress={() => handleSelect(mission._id)}
                >
                  <View style={styles.iconBox}>
                    <Text style={styles.emoji}>{meta?.emoji || '🚩'}</Text>
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.itemTitle}>{mission.title}</Text>
                    <Text style={styles.itemMeta}>
                      {meta?.label || 'Mission'} · {mission.points} Punkte
                    </Text>
                  </View>
                  {isActive && (
                    <Ionicons name="checkmark-circle" size={24} color={theme.colors.orange} />
                  )}
                </Pressable>
              );
            })}

            {focusedMissionId && (
              <Pressable style={styles.clearButton} onPress={handleClear}>
                <Text style={styles.clearText}>Fokus aufheben</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Nunito_700Bold',
    color: theme.colors.textPrimary,
    textTransform: 'uppercase',
  },
  closeButton: {
    padding: 4,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 12,
    gap: 12,
  },
  itemActive: {
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.3)',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 20,
  },
  info: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontFamily: 'Nunito_700Bold',
    color: theme.colors.textPrimary,
  },
  itemMeta: {
    fontSize: 12,
    fontFamily: 'NunitoSans_400Regular',
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  clearButton: {
    marginTop: 12,
    padding: 16,
    alignItems: 'center',
  },
  clearText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontFamily: 'NunitoSans_700Bold',
  },
});
