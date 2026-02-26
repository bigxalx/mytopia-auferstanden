import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import { env, hasConfiguredFirebase } from '@/src/config/env';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';

export function SignInScreen() {
  const { sendPasswordReset, signInWithEmail } = useSession();
  const [email, setEmail] = useState('survivor@mytopia.app');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignIn() {
    const normalizedEmail = email.trim();
    if (!hasValidEmail(normalizedEmail)) {
      setFeedback({ text: 'Please enter a valid email address.', tone: 'error' });
      return;
    }

    if (password.length === 0) {
      setFeedback({ text: 'Please enter your password.', tone: 'error' });
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

      if (result.message) {
        setFeedback({ text: result.message, tone: 'success' });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPassword() {
    const normalizedEmail = email.trim();
    if (!hasValidEmail(normalizedEmail)) {
      setFeedback({ text: 'Enter a valid email to send a reset link.', tone: 'error' });
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
        text: result.message ?? 'Password reset email sent. Check your inbox.',
        tone: 'success',
      });
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <Screen
      title="Welcome Back"
      subtitle="Sign in with your existing account. Verified email is required."
    >
      <SectionCard title="Sign In">
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
          placeholder="Password"
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
          <Text style={styles.buttonText}>{isSubmitting ? 'Signing in...' : 'Sign In'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting || isResetting}
          onPress={handleResetPassword}
          style={styles.inlineAction}
        >
          <Text style={styles.inlineActionText}>{isResetting ? 'Sending reset link...' : 'Forgot password?'}</Text>
        </Pressable>
      </SectionCard>

      <SectionCard title="New to Mytopia?">
        <Link asChild href="./sign-up">
          <Pressable accessibilityRole="button" style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Create account</Text>
          </Pressable>
        </Link>
      </SectionCard>

      <SectionCard title="Environment status">
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>EXPO_PUBLIC_APP_ENV</Text>
          <Text style={styles.statusValue}>{env.appEnv}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>EXPO_PUBLIC_FIREBASE_PROJECT_ID</Text>
          <Text style={styles.statusValue}>{hasConfiguredFirebase() ? env.firebaseProjectId : 'not set'}</Text>
        </View>
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
  inlineAction: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  inlineActionText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '600',
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
  statusLabel: {
    color: '#5d6979',
    flex: 1,
    fontSize: 13,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  statusValue: {
    color: '#0f1728',
    flex: 1.4,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
});

function hasValidEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value);
}
