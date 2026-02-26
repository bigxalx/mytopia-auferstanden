import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { mockTasks } from '@/src/features/tasks/data/mockTasks';

export function TasksScreen() {
  return (
    <Screen title="Tasks" subtitle="Feature module baseline: task list + detail navigation.">
      <SectionCard title="Available and active tasks">
        {mockTasks.map((task) => (
          <Link asChild href={`/tasks/${task.id}`} key={task.id}>
            <Pressable style={styles.row}>
              <Text style={styles.rowTitle}>{task.title}</Text>
              <Text style={styles.rowMeta}>
                {task.type.toUpperCase()} · {task.points} pts · {task.status}
              </Text>
            </Pressable>
          </Link>
        ))}
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    borderColor: '#d8dee8',
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  rowMeta: {
    color: '#5d6979',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  rowTitle: {
    color: '#101828',
    fontSize: 15,
    fontWeight: '600',
  },
});
