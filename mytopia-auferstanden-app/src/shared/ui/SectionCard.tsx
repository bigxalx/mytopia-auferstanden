import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';

type SectionCardProps = PropsWithChildren<{
  backgroundColor?: string;
  description?: string;
  title: string;
}>;

export function SectionCard({ children, description, title, backgroundColor }: SectionCardProps) {
  return (
    <View style={[styles.card, backgroundColor && { backgroundColor }]}>
      <Text style={[styles.title]}>{title}</Text>
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
    backgroundColor: '#EDECE0',
    borderRadius: 20,
    gap: 10,
    padding: 24,
  },
  description: {
    color: '#596161',
    fontSize: 13,
    lineHeight: 18,
  },
  title: theme.typography.h1,
});
