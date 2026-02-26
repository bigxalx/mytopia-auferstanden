import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';

export function MapScreen() {
  return (
    <Screen title="Map & Checkpoints" subtitle="Baseline route for future GPS task loop and checkpoint activation.">
      <SectionCard title="Checkpoint status">
        <View style={styles.row}>
          <Text style={styles.label}>Nearest checkpoint</Text>
          <Text style={styles.value}>Theaterplatz</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Distance</Text>
          <Text style={styles.value}>1.4 km</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>GPS permission</Text>
          <Text style={styles.value}>pending integration</Text>
        </View>
      </SectionCard>
      <SectionCard title="Implementation note">
        <Text style={styles.note}>
          Map rendering and geofence checks will be connected when GPS task logic is implemented in MYT-14.
        </Text>
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    color: '#5d6979',
    flex: 1,
    fontSize: 13,
  },
  note: {
    color: '#1f2937',
    fontSize: 14,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
  },
  value: {
    color: '#101828',
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
});
