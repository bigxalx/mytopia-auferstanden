import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { mockTasks } from '@/src/features/tasks/data/mockTasks';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';

export function TaskDetailScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const task = mockTasks.find((entry) => entry.id === taskId);

  if (!task) {
    return (
      <Screen title="Task not found" subtitle="This route is wired correctly, but the id is unknown.">
        <SectionCard title="Unknown task id">
          <Text style={styles.paragraph}>{String(taskId)}</Text>
        </SectionCard>
      </Screen>
    );
  }

  return (
    <Screen title={task.title} subtitle="Detail route is ready for real task actions and backend state.">
      <SectionCard title="Task metadata">
        <View style={styles.row}>
          <Text style={styles.label}>Task ID</Text>
          <Text style={styles.value}>{task.id}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Type</Text>
          <Text style={styles.value}>{task.type}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <Text style={styles.value}>{task.status}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Points</Text>
          <Text style={styles.value}>{task.points}</Text>
        </View>
      </SectionCard>
      <SectionCard title="Execution notes">
        <Text style={styles.paragraph}>Quiz and GPS runtime behavior will be implemented in MYT-14.</Text>
        <Text style={styles.paragraph}>
          Text/photo submission state transitions will be connected in MYT-18.
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
  paragraph: {
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
    textTransform: 'capitalize',
  },
});
