import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type SectionCardProps = PropsWithChildren<{
  description?: string;
  title: string;
}>;

export function SectionCard({ children, description, title }: SectionCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 10,
  },
  card: {
    backgroundColor: '#1f2937',
    borderColor: '#374151',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  description: {
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 18,
  },
  title: {
    color: '#f9fafb',
    fontSize: 17,
    fontWeight: '600',
  },
});
