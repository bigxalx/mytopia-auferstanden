import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { theme } from '@/src/shared/ui/theme';

export default function SignUpScreen() {
  const router = useRouter();
  const { signUpWithEmail } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);

  async function handleSignUp() {
    const normalizedEmail = email.trim();
    if (!hasValidEmail(normalizedEmail)) {
      setFeedback({ text: 'Bitte gib eine gültige E-Mail-Adresse ein.', tone: 'error' });
      return;
    }

    if (password.length < 6) {
      setFeedback({ text: 'Das Passwort muss mindestens 6 Zeichen lang sein.', tone: 'error' });
      return;
    }

    if (password !== confirmPassword) {
      setFeedback({ text: 'Die Passwörter stimmen nicht überein.', tone: 'error' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const result = await signUpWithEmail(normalizedEmail, password);
      if (!result.ok) {
        setFeedback({ text: result.message, tone: 'error' });
        return;
      }

      setFeedback({
        text: result.message ?? 'Konto erstellt. Bitte bestätige deine E-Mail vor der Anmeldung.',
        tone: 'success',
      });
      setPassword('');
      setConfirmPassword('');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen
      title="Registrieren"
      backgroundColor="transparent"
      headerShown={false}
      noPadding
    >
      <View style={styles.formContainer}>
        <SectionCard title="Registrieren">
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
            placeholder="Passwort (mind. 6 Zeichen)"
            placeholderTextColor={theme.colors.cardTextMuted}
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <TextInput
            onChangeText={setConfirmPassword}
            placeholder="Passwort bestätigen"
            placeholderTextColor={theme.colors.cardTextMuted}
            secureTextEntry
            style={styles.input}
            value={confirmPassword}
          />
          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting || email.trim().length === 0}
            onPress={handleSignUp}
            style={[styles.button, (isSubmitting || email.trim().length === 0) && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>{isSubmitting ? 'Konto wird erstellt...' : 'Konto erstellen'}</Text>
          </Pressable>
          <View style={styles.privacyCardContainer}>
            <Text style={styles.privacyText}>
              Durch das Anmelden akzeptierst du unsere{' '}
              <Text
                style={styles.privacyLink}
                onPress={() => Linking.openURL('https://www.mytopia.world/datenschutz')}
              >
                Datenschutzbestimmungen
              </Text>
              .
            </Text>
          </View>

        </SectionCard>

        <SectionCard title="Bereits ein Konto?" backgroundColor={theme.colors.accent}>
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryButtonText}>Zurück zur Anmeldung</Text>
          </Pressable>
        </SectionCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  privacyCardContainer: {
    marginTop: 4,
    paddingHorizontal: 8,
  },
  privacyText: {
    color: theme.colors.cardTextSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  privacyLink: {
    color: theme.colors.orange,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
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
