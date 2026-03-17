import { PropsWithChildren } from 'react';
import { StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
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
  } as ViewStyle,
  card: {
    backgroundColor: theme.colors.beige,
    borderRadius: 20,
    gap: 10,
    padding: 24,
  } as ViewStyle,
  description: {
    color: theme.colors.charcoal,
    fontSize: 13,
    lineHeight: 18,
  } as TextStyle,
  title: theme.typography.h1,
});

