import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';

export function SignUpScreen() {
  const { signUpWithEmail } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);

  async function handleSignUp() {
    const normalizedEmail = email.trim();
    if (!hasValidEmail(normalizedEmail)) {
      setFeedback({ text: 'Please enter a valid email address.', tone: 'error' });
      return;
    }

    if (password.length < 6) {
      setFeedback({ text: 'Password must be at least 6 characters.', tone: 'error' });
      return;
    }

    if (password !== confirmPassword) {
      setFeedback({ text: 'Passwords do not match.', tone: 'error' });
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
        text: result.message ?? 'Account created. Verify your email before signing in.',
        tone: 'success',
      });
      setPassword('');
      setConfirmPassword('');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen title="Create Account" subtitle="Register with email/password. Email verification is required.">
      <SectionCard title="Sign Up">
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
          placeholder="Email"
          style={styles.input}
          value={email}
        />
        <TextInput
          onChangeText={setPassword}
          placeholder="Password (min 6 characters)"
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <TextInput
          onChangeText={setConfirmPassword}
          placeholder="Confirm password"
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
          <Text style={styles.buttonText}>{isSubmitting ? 'Creating account...' : 'Create account'}</Text>
        </Pressable>
      </SectionCard>

      <SectionCard title="Already have an account?">
        <Link asChild href="./sign-in">
          <Pressable accessibilityRole="button" style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back to sign in</Text>
          </Pressable>
        </Link>
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#101828',
    borderRadius: 10,
    marginTop: 6,
    paddingVertical: 12,
  },
  buttonDisabled: {
    backgroundColor: '#98a2b3',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  feedback: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  feedbackError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  feedbackErrorText: {
    color: '#991b1b',
    fontSize: 13,
  },
  feedbackSuccess: {
    backgroundColor: '#ecfdf3',
    borderColor: '#a7f3d0',
  },
  feedbackSuccessText: {
    color: '#166534',
    fontSize: 13,
  },
  input: {
    backgroundColor: '#f8f9fc',
    borderColor: '#d8dde6',
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#1d4ed8',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#1d4ed8',
    fontSize: 16,
    fontWeight: '600',
  },
});

function hasValidEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value);
}
