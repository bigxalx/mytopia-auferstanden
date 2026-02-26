import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScreenProps = PropsWithChildren<{
  subtitle?: string;
  title: string;
}>;

export function Screen({ children, subtitle, title }: ScreenProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
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
