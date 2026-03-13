import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScreenProps = PropsWithChildren<{
  noPadding?: boolean;
  /** When false the children are rendered in a plain View instead of a ScrollView. */
  scrollable?: boolean;
  subtitle?: string;
  title: string;
}>;

export function Screen({ children, noPadding = false, scrollable = true, subtitle, title }: ScreenProps) {
  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );

  if (!scrollable) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {header}
        <View style={[styles.fillContent, noPadding && styles.noPadding]}>
          {children}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      {header}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.content, noPadding && styles.noPadding]} 
        showsVerticalScrollIndicator={false}
      >
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
    backgroundColor: '#252b30',
    flex: 1,
    gap: 16,
    padding: 20,
  },
  noPadding: {
    padding: 0,
    gap: 0,
  },
  scrollView: {
    backgroundColor: '#252b30',
  },
  header: {
    backgroundColor: '#3f454a',
    borderBottomColor: '#1f2937',
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 6,
  },
  safeArea: {
    backgroundColor: '#3f454a',
    flex: 1,
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
  },
  title: {
    color: '#eef2ef',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 34,
    textAlign: 'center',
  },
});
