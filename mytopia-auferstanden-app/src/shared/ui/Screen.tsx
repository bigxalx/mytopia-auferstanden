import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from './theme';

type ScreenProps = PropsWithChildren<{
  noPadding?: boolean;
  /** When false the children are rendered in a plain View instead of a ScrollView. */
  scrollable?: boolean;
  subtitle?: string;
  title: string;
  /** Whether to show the internal header. Defaults to true. Set to false if using navigator headers. */
  headerShown?: boolean;
  /** Whether to center content vertically. */
  centerContent?: boolean;
  /** Optional background color override. */
  backgroundColor?: string;
}>;

export function Screen({ 
  children, 
  noPadding = false, 
  scrollable = true, 
  subtitle, 
  title,
  headerShown = true,
  centerContent = false,
  backgroundColor
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  
  const header = headerShown ? (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  ) : null;

  const containerStyle = [styles.container, backgroundColor ? { backgroundColor } : null];
  const bgStyle = backgroundColor ? { backgroundColor } : null;

  if (!scrollable) {
    return (
      <View style={containerStyle}>
        {header}
        <View style={[
          styles.fillContent, 
          { paddingBottom: Math.max(insets.bottom, 20) }, // Use safe area for bottom padding
          noPadding && styles.noPadding, 
          centerContent && { justifyContent: 'center' },
          bgStyle

        ]}>
          {children}
        </View>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      {header}
      <ScrollView 
        style={[styles.scrollView, bgStyle]}
        contentContainerStyle={[
          styles.content, 
          { paddingBottom: Math.max(insets.bottom, 20) }, // Use safe area for bottom padding
          noPadding && styles.noPadding,
          centerContent && { flexGrow: 1, justifyContent: 'center' }
        ]} 
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#3f454a',
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 20,
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
  subtitle: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
  },
  title: theme.typography.title,
});
