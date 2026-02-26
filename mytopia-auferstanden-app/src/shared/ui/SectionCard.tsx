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
    backgroundColor: '#fff',
    borderColor: '#e5e8ef',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  description: {
    color: '#5d6979',
    fontSize: 13,
    lineHeight: 18,
  },
  title: {
    color: '#1d2433',
    fontSize: 17,
    fontWeight: '600',
  },
});
