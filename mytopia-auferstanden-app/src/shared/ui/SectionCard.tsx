import { PropsWithChildren } from 'react';
import { StyleSheet, Text, TextStyle, View, ViewStyle, type StyleProp } from 'react-native';
import { theme } from './theme';

type SectionCardProps = PropsWithChildren<{
  backgroundColor?: string;
  description?: string;
  descriptionStyle?: StyleProp<TextStyle>;
  title: string;
  titleStyle?: StyleProp<TextStyle>;
}>;

export function SectionCard({
  children,
  description,
  descriptionStyle,
  title,
  titleStyle,
  backgroundColor,
}: SectionCardProps) {
  return (
    <View style={StyleSheet.flatten([styles.card, backgroundColor && { backgroundColor }])}>
      <Text style={[styles.title, titleStyle]}>{title}</Text>
      {description ? <Text style={[styles.description, descriptionStyle]}>{description}</Text> : null}
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
    color: theme.colors.cardTextSecondary,
    fontSize: 13,
    lineHeight: 18,
  } as TextStyle,
  title: theme.typography.h1,
});
