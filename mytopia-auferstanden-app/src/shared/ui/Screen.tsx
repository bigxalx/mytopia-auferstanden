import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from './theme';

type ScreenProps = PropsWithChildren<{
  noPadding?: boolean;
  /** Whether to apply safe-area bottom padding. Defaults to true. */
  bottomInset?: boolean;
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
  /** Optional refresh control component for pull-to-refresh functionality */
  refreshControl?: React.ReactElement<any>;
}>;

export function Screen({ 
  children, 
  noPadding = false, 
  bottomInset = true,
  scrollable = true, 
  subtitle, 
  title,
  headerShown = true,
  centerContent = false,
  backgroundColor,
  refreshControl,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomPadding = bottomInset ? Math.max(insets.bottom, 20) : 0;
  
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
          { paddingBottom: bottomPadding },
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
          { paddingBottom: bottomPadding },
          noPadding && styles.noPadding,
          centerContent && { flexGrow: 1, justifyContent: 'center' }
        ]} 
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.headerBackground,
    flex: 1,
  } as ViewStyle,
  content: {
    gap: 16,
    padding: 20,
  } as ViewStyle,
  fillContent: {
    backgroundColor: theme.colors.background,
    flex: 1,
    gap: 16,
    padding: 20,
  } as ViewStyle,
  noPadding: {
    padding: 0,
    gap: 0,
  } as ViewStyle,
  scrollView: {
    backgroundColor: theme.colors.background,
  } as ViewStyle,
  header: {
    backgroundColor: theme.colors.headerBackground,
    borderBottomColor: theme.colors.headerBorder,
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 6,
  } as ViewStyle,
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  } as TextStyle,
  title: theme.typography.title,
});
