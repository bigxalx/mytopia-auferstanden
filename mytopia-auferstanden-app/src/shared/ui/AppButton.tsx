import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { theme } from '@/src/shared/ui/theme';

type AppButtonProps = Omit<PressableProps, 'style'> & {
  disabled?: boolean;
  fullWidth?: boolean;
  label: string;
  labelStyle?: StyleProp<TextStyle>;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'danger';
  variant?: 'primary' | 'secondary';
};

export function AppButton({
  accessibilityRole = 'button',
  disabled = false,
  fullWidth = false,
  label,
  labelStyle,
  loading = false,
  style,
  tone = 'default',
  variant = 'primary',
  ...pressableProps
}: AppButtonProps) {
  const isInactive = disabled || loading;
  const palette = getPalette(variant, tone);

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      disabled={isInactive}
      style={({ pressed }) => [
        styles.button,
        fullWidth && styles.fullWidth,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
        },
        pressed && !isInactive ? styles.buttonPressed : null,
        isInactive ? styles.buttonDisabled : null,
        style,
      ]}
      {...pressableProps}
    >
      {loading ? <ActivityIndicator color={palette.textColor} size="small" style={styles.spinner} /> : null}
      <Text style={[styles.label, { color: palette.textColor }, labelStyle]}>{label}</Text>
    </Pressable>
  );
}

function getPalette(variant: 'primary' | 'secondary', tone: 'default' | 'danger') {
  if (tone === 'danger') {
    if (variant === 'primary') {
      return {
        backgroundColor: theme.colors.destructiveBorder,
        borderColor: theme.colors.destructiveBorder,
        textColor: '#ffffff',
      };
    }

    return {
      backgroundColor: theme.colors.destructiveSurface,
      borderColor: theme.colors.destructiveBorder,
      textColor: theme.colors.destructiveText,
    };
  }

  if (variant === 'secondary') {
    return {
      backgroundColor: theme.colors.cardSubtleBackground,
      borderColor: theme.colors.cardBorder,
      textColor: theme.colors.cardTextPrimary,
    };
  }

  return {
    backgroundColor: theme.colors.orange,
    borderColor: theme.colors.orange,
    textColor: theme.colors.cardTextPrimary,
  };
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  } as ViewStyle,
  buttonDisabled: {
    opacity: 0.5,
  } as ViewStyle,
  buttonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  } as ViewStyle,
  fullWidth: {
    alignSelf: 'stretch',
  } as ViewStyle,
  label: {
    ...theme.typography.button,
    marginTop: 1,
  } as TextStyle,
  spinner: {
    marginRight: 10,
  } as ViewStyle,
});
