import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { theme } from '@/src/shared/ui/theme';

export default function SignInScreen() {
  const router = useRouter();
  const { sendPasswordReset, signInWithEmail, user } = useSession();
  const [email, setEmail] = useState('survivor@mytopia.app');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Navigate away once the session establishes a user (after Firebase hydration completes)
  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user, router]);

  async function handleSignIn() {
    const normalizedEmail = email.trim();
    if (!hasValidEmail(normalizedEmail)) {
      setFeedback({ text: 'Bitte gib eine gültige E-Mail-Adresse ein.', tone: 'error' });
      return;
    }

    if (password.length === 0) {
      setFeedback({ text: 'Bitte gib dein Passwort ein.', tone: 'error' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const result = await signInWithEmail(normalizedEmail, password);
      if (!result.ok) {
        setFeedback({ text: result.message, tone: 'error' });
        return;
      }

      // Navigation is handled reactively by the useEffect watching `user`
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPassword() {
    const normalizedEmail = email.trim();
    if (!hasValidEmail(normalizedEmail)) {
      setFeedback({ text: 'Gib eine gültige E-Mail-Adresse ein, um einen Reset-Link zu erhalten.', tone: 'error' });
      return;
    }

    setIsResetting(true);
    setFeedback(null);
    try {
      const result = await sendPasswordReset(normalizedEmail);
      if (!result.ok) {
        setFeedback({ text: result.message, tone: 'error' });
        return;
      }

      setFeedback({
        text: result.message ?? 'E-Mail zum Zurücksetzen des Passworts gesendet. Bitte prüfe dein Postfach.',
        tone: 'success',
      });
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <Screen
      title="Mytopia"
      backgroundColor="transparent"
      headerShown={false}
      noPadding
    >
      <View style={styles.formContainer}>
        <SectionCard title="Anmelden">
          {feedback ? (
            <View style={[styles.feedback, feedback.tone === 'error' ? styles.feedbackError : styles.feedbackSuccess]}>
              <Text style={feedback.tone === 'error' ? styles.feedbackErrorText : styles.feedbackSuccessText}>
                {feedback.text}
              </Text>
            </View>
          ) : null}
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="E-Mail"
            placeholderTextColor={theme.colors.cardTextMuted}
            style={styles.input}
            value={email}
          />
          <TextInput
            onChangeText={setPassword}
            placeholder="Passwort"
            placeholderTextColor={theme.colors.cardTextMuted}
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting || isResetting || email.trim().length === 0}
            onPress={handleSignIn}
            style={[styles.button, (isSubmitting || isResetting || email.trim().length === 0) && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>{isSubmitting ? 'Anmeldung...' : 'Anmelden'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting || isResetting}
            onPress={handleResetPassword}
            style={styles.inlineAction}
          >
            <Text style={styles.inlineActionText}>{isResetting ? 'Link wird gesendet...' : 'Passwort vergessen?'}</Text>
          </Pressable>
        </SectionCard>

        <SectionCard
          title="Neu bei Mytopia?"
          backgroundColor={theme.colors.accent}
        >
          <Link asChild href="/(auth)/sign-up">
            <Pressable accessibilityRole="button" style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Account erstellen</Text>
            </Pressable>
          </Link>
        </SectionCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    padding: 20,
    gap: 16,
  },
  button: {
    alignItems: 'center',
    backgroundColor: theme.colors.orange,
    borderRadius: 10,
    marginTop: 6,
    paddingVertical: 12,
  },
  buttonDisabled: {
    backgroundColor: theme.colors.disabledSurface,
    opacity: 0.6,
  },
  buttonText: theme.typography.button,
  feedback: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  feedbackError: {
    backgroundColor: theme.colors.errorSurface,
    borderColor: theme.colors.errorBorder,
  },
  feedbackErrorText: {
    color: theme.colors.errorText,
    fontSize: 13,
  },
  feedbackSuccess: {
    backgroundColor: theme.colors.successSurface,
    borderColor: theme.colors.successBorder,
  },
  feedbackSuccessText: {
    color: theme.colors.successText,
    fontSize: 13,
  },
  input: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.inputBorder,
    borderRadius: 10,
    borderWidth: 1.5,
    color: theme.colors.cardTextPrimary,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  inlineAction: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 6,
  },
  inlineActionText: {
    color: theme.colors.cardTextSecondary,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.cardSubtleBackground,
    borderColor: theme.colors.cardBorder,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 12,
  },
  secondaryButtonText: theme.typography.button,
});

function hasValidEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value);
}
