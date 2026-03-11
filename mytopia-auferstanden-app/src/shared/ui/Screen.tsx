import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScreenProps = PropsWithChildren<{
  /** When false the children are rendered in a plain View instead of a ScrollView. */
  scrollable?: boolean;
  subtitle?: string;
  title: string;
}>;

export function Screen({ children, scrollable = true, subtitle, title }: ScreenProps) {
  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );

  if (!scrollable) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.fillContent}>
          {header}
          {children}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {header}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 36,
  },
  fillContent: {
    flex: 1,
    gap: 16,
    padding: 20,
  },
  header: {
    gap: 6,
  },
  safeArea: {
    backgroundColor: '#f6f7fb',
    flex: 1,
  },
  subtitle: {
    color: '#4f5b6b',
    fontSize: 14,
  },
  title: {
    color: '#121722',
    fontSize: 28,
    fontWeight: '700',
  },
});
