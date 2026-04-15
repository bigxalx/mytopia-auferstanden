import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { AppButton } from '@/src/shared/ui/AppButton';
import { theme } from '@/src/shared/ui/theme';

type TextRunnerProps = {
  embedded?: boolean;
  onComplete: (text: string) => Promise<{ action: string }>;
};

export function TextRunner({ onComplete, embedded = false }: TextRunnerProps) {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!text.trim()) {
      setError('Bitte gib einen Text ein.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onComplete(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, embedded ? styles.containerEmbedded : null]}>
      <Text style={styles.title}>Dein Beitrag</Text>

      <TextInput
        style={styles.input}
        multiline
        numberOfLines={6}
        placeholder="Schreibe hier deinen Text..."
        placeholderTextColor="rgba(17, 24, 39, 0.55)"
        value={text}
        onChangeText={setText}
        editable={!isSubmitting}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <AppButton
        disabled={isSubmitting || !text.trim()}
        fullWidth
        label={isSubmitting ? 'Wird gesendet...' : 'Einreichen'}
        loading={isSubmitting}
        onPress={() => {
          void handleSubmit();
        }}
        variant="primary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.beige,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    marginTop: 16,
  },
  containerEmbedded: {
    marginTop: 0,
  },
  title: {
    color: theme.colors.cardTextPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#f8f4ea',
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: 8,
    color: theme.colors.cardTextPrimary,
    padding: 12,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  errorText: {
    color: theme.colors.errorText,
    fontSize: 14,
    marginBottom: 16,
  },
});
