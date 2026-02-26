import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';

const feedItems = [
  {
    id: 'signal-01',
    body: 'Emergency channel requests citizens to share food with one stranger today.',
    title: 'Signal: Mutual Aid',
  },
  {
    id: 'signal-02',
    body: 'Checkpoint opens at Theaterplatz at 16:00 for city-of-the-future ideas.',
    title: 'Checkpoint briefing',
  },
];

export function FeedScreen() {
  return (
    <Screen title="Narrative Feed" subtitle="Feature module baseline: content cards + deep links into tasks.">
      {feedItems.map((item) => (
        <SectionCard key={item.id} title={item.title}>
          <Text style={styles.body}>{item.body}</Text>
        </SectionCard>
      ))}

      <SectionCard title="Suggested actions">
        <Link asChild href="/tasks/quiz-001">
          <Pressable style={styles.actionButton}>
            <Text style={styles.actionTitle}>Open quiz task</Text>
            <Text style={styles.actionSubtitle}>Tests stack route to task detail.</Text>
          </Pressable>
        </Link>
        <Link asChild href="/(tabs)/tasks">
          <Pressable style={styles.actionButton}>
            <Text style={styles.actionTitle}>Open task list tab</Text>
            <Text style={styles.actionSubtitle}>Tests tab routing and module boundaries.</Text>
          </Pressable>
        </Link>
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    backgroundColor: '#f8fafc',
    borderColor: '#d8dee8',
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  actionSubtitle: {
    color: '#5d6979',
    fontSize: 13,
  },
  actionTitle: {
    color: '#101828',
    fontSize: 15,
    fontWeight: '600',
  },
  body: {
    color: '#1f2937',
    fontSize: 14,
    lineHeight: 20,
  },
});
