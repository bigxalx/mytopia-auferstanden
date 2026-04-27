import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import { AppButton } from '@/src/shared/ui/AppButton';
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
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

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

      setVerificationEmail(normalizedEmail);
      setFeedback(null);
      setPassword('');
      setConfirmPassword('');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.formContainer}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <SectionCard title={verificationEmail ? 'E-Mail bestätigen' : 'Registrieren'}>
        {verificationEmail ? (
          <View style={styles.verificationState}>
            <View style={[styles.feedback, styles.feedbackSuccess]}>
              <Text style={styles.feedbackSuccessText}>
                Konto erstellt. Bitte bestätige deine E-Mail-Adresse.
              </Text>
            </View>
            <Text style={styles.verificationBody}>
              Wir haben eine Bestätigungs-E-Mail an{' '}
              <Text style={styles.verificationEmail}>{verificationEmail}</Text>{' '}
              gesendet. Öffne den Link in dieser E-Mail, danach kannst du dich anmelden.
            </Text>
            <AppButton
              fullWidth
              label="Zur Anmeldung"
              onPress={() => router.replace('/(auth)/sign-in')}
              variant="primary"
            />
          </View>
        ) : (
          <>
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
            <AppButton
              disabled={email.trim().length === 0}
              fullWidth
              label={isSubmitting ? 'Konto wird erstellt…' : 'Konto erstellen'}
              loading={isSubmitting}
              onPress={() => {
                void handleSignUp();
              }}
              variant="primary"
            />
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
          </>
        )}
      </SectionCard>

      {!verificationEmail ? (
        <SectionCard title="Bereits ein Konto?" backgroundColor={theme.colors.accent}>
          <AppButton fullWidth label="Zurück zur Anmeldung" onPress={() => router.back()} variant="secondary" />
        </SectionCard>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    gap: 16,
    paddingBottom: 24,
  },
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
  verificationBody: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  verificationEmail: {
    color: theme.colors.cardTextPrimary,
    fontWeight: '700',
  },
  verificationState: {
    gap: 14,
  },
});

function hasValidEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value);
}
