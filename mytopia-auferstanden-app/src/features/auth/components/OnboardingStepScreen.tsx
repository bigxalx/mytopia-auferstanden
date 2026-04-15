import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/src/shared/ui/AppButton';
import { theme } from '@/src/shared/ui/theme';

import type { OnboardingStepItem } from '@/src/features/auth/onboardingSteps';

type OnboardingStepScreenProps = {
  buttonLabel: string;
  isBusy?: boolean;
  items: OnboardingStepItem[];
  onPress: () => Promise<void> | void;
  stepNumber: number;
  subtitle: string;
  title: string;
  totalSteps: number;
};

export function OnboardingStepScreen({
  buttonLabel,
  isBusy = false,
  items,
  onPress,
  stepNumber,
  subtitle,
  title,
  totalSteps,
}: OnboardingStepScreenProps) {
  const insets = useSafeAreaInsets();
  const progress = `${Math.max(stepNumber / totalSteps, 0.12) * 100}%` as `${number}%`;

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 24),
            paddingTop: Math.max(insets.top, 24),
          },
        ]}
      >
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Schritt {stepNumber} von {totalSteps}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: progress }]} />
          </View>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <View style={styles.body}>
          {items.map((item) => (
            <View key={`${title}-${item.icon}`} style={styles.itemRow}>
              <View style={styles.iconWrap}>
                <MaterialIcons color={theme.colors.orange} name={item.icon} size={24} />
              </View>
              <Text style={styles.itemText}>{item.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <AppButton
            fullWidth
            label={buttonLabel}
            loading={isBusy}
            onPress={() => {
              void onPress();
            }}
            variant="primary"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 20,
  },
  content: {
    flex: 1,
    gap: 28,
    paddingHorizontal: 24,
  },
  footer: {
    marginTop: 'auto',
  },
  header: {
    gap: 10,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: theme.colors.orangeSoft,
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 16,
    paddingRight: 8,
  },
  itemText: {
    color: theme.colors.cardTextPrimary,
    flex: 1,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 15,
    lineHeight: 22,
    paddingTop: 2,
  },
  progressFill: {
    backgroundColor: theme.colors.orange,
    borderRadius: 999,
    height: '100%',
  },
  progressHeader: {
    alignItems: 'flex-end',
  },
  progressLabel: {
    color: theme.colors.cardTextSecondary,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  progressSection: {
    gap: 10,
  },
  progressTrack: {
    backgroundColor: 'rgba(88, 97, 97, 0.18)',
    borderRadius: 999,
    height: 8,
    overflow: 'hidden',
  },
  screen: {
    backgroundColor: theme.colors.beige,
    flex: 1,
  },
  subtitle: {
    color: theme.colors.cardTextSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  title: {
    color: theme.colors.cardTextHeading,
    fontFamily: 'Nunito_700Bold',
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
});
