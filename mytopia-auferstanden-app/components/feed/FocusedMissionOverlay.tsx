import React from 'react';
import { StyleSheet, View, Text, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/shared/ui/theme';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';
import { MissionInteractionZone } from './MissionInteractionZone';
import { MISSION_KIND_METADATA, type MissionKind } from '@/src/features/tasks/data/missionRepository';

export function FocusedMissionOverlay() {
  const { activeMission, focusedMissionId, setFocus } = useActiveMission();
  const insets = useSafeAreaInsets();

  if (!focusedMissionId || !activeMission) return null;

  const handleClose = () => {
    setFocus(null);
  };

  const meta = MISSION_KIND_METADATA[activeMission.kind as MissionKind];

  // Logic to calculate bottom offset to be above tab bar
  // Match FallbackActiveMissionBar logic: insets.bottom + (android ? 78 : 56)
  const bottomOffset = insets.bottom + (Platform.OS === 'android' ? 78 : 60);

  return (
    <View style={[styles.wrapper, { bottom: bottomOffset }]}>
      <View style={styles.container}>
        {/* Compact Draft Header */}
        <View style={styles.header}>
          <View style={styles.quoteIndicator} />
          <View style={styles.headerContent}>
            <Text style={styles.missionLabel}>AKTIVE MISSION</Text>
            <Text style={styles.missionTitle} numberOfLines={1}>
              {activeMission.title}
            </Text>
          </View>
          
          <Pressable 
            onPress={handleClose}
            hitSlop={10}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        {/* Shrunken Interaction Zone */}
        <View style={styles.interactionArea}>
          <MissionInteractionZone
            compact
            missionId={activeMission._id}
            kind={activeMission.kind}
            questions={activeMission.questions}
            gpsConfig={activeMission.gpsConfig}
            onSuccess={() => setFocus(null)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 8,
    right: 8,
    zIndex: 1000,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 8,
    paddingTop: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  quoteIndicator: {
    width: 2,
    height: 24,
    backgroundColor: theme.colors.orange,
    borderRadius: 1,
  },
  headerContent: {
    flex: 1,
  },
  missionLabel: {
    fontSize: 8,
    fontFamily: 'NunitoSans_700Bold',
    color: '#999',
    letterSpacing: 0.5,
  },
  missionTitle: {
    fontSize: 12,
    fontFamily: 'NunitoSans_700Bold',
    color: '#333',
    lineHeight: 14,
  },
  closeButton: {
    padding: 2,
  },
  pressed: {
    opacity: 0.6,
  },
  interactionArea: {
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 10,
    padding: 6,
  },
});
