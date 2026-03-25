import { useState } from 'react';
import { StyleSheet, Text, View, Image, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import storage from '@react-native-firebase/storage';
import { theme } from '@/src/shared/ui/theme';
import { useSession } from '@/src/core/session/SessionContext';

type PhotoRunnerProps = {
  missionId: string;
  onComplete: (photoUri: string) => Promise<{ action: string }>;
};

export function PhotoRunner({ missionId, onComplete }: PhotoRunnerProps) {
  const { user } = useSession();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const handlePickLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
        setError(null);
      }
    } catch {
      setError('Fehler beim Öffnen der Mediathek.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setError('Keine Berechtigung für die Kamera.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
        setError(null);
      }
    } catch {
      setError('Fehler beim Öffnen der Kamera.');
    }
  };

  const handleSubmit = async () => {
    if (!photoUri || !user) {
      setError('Bitte wähle ein Foto aus.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setUploadProgress(0);

    try {
      // Create storage reference
      const extension = photoUri.split('.').pop() || 'jpg';
      const timestamp = new Date().getTime();
      const storagePath = `submissions/${user.id}/${missionId}-${timestamp}.${extension}`;
      const reference = storage().ref(storagePath);

      // Upload file
      const task = reference.putFile(photoUri);

      task.on('state_changed', snapshot => {
        setUploadProgress(
          Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
        );
      });

      await task;

      const pathUri = `gs://${reference.bucket}/${storagePath}`;
      await onComplete(pathUri);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden oder Hochladen.');
      setUploadProgress(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dein Foto</Text>

      {photoUri ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: photoUri }} style={styles.previewImage} />

          <Pressable
            disabled={isSubmitting}
            onPress={handlePickLibrary}
            style={[styles.actionButton, styles.retakeButton, isSubmitting ? styles.actionButtonDisabled : null]}
          >
            <Text style={styles.actionButtonText}>Anderes Foto wählen</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.buttonGroup}>
          <Pressable
            disabled={isSubmitting}
            onPress={handleTakePhoto}
            style={[styles.actionButton, isSubmitting ? styles.actionButtonDisabled : null]}
          >
            <Text style={styles.actionButtonText}>Foto aufnehmen</Text>
          </Pressable>
          <View style={{ height: 12 }} />
          <Pressable
            disabled={isSubmitting}
            onPress={handlePickLibrary}
            style={[styles.actionButton, isSubmitting ? styles.actionButtonDisabled : null]}
          >
            <Text style={styles.actionButtonText}>Aus Mediathek</Text>
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        disabled={isSubmitting || !photoUri}
        onPress={handleSubmit}
        style={[styles.actionButton, styles.submitButton, (isSubmitting || !photoUri) ? styles.actionButtonDisabled : null]}
      >
        <Text style={styles.actionButtonText}>
          {isSubmitting && uploadProgress !== null
            ? `Wird hochgeladen... (${uploadProgress}%)`
            : isSubmitting
              ? 'Wird gesendet...'
              : 'Einreichen'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.cardSubtleBackground,
      borderColor: theme.colors.cardBorder,
      borderRadius: 10,
      borderWidth: 1,
      paddingVertical: 14,
  },
  actionButtonDisabled: {
      opacity: 0.4,
  },
  actionButtonText: {
      ...theme.typography.button,
  },
  submitButton: {
      backgroundColor: theme.colors.orange,
      borderColor: theme.colors.orange,
  },
  container: {
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    marginTop: 16,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  buttonGroup: {
    marginBottom: 16,
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 12,
  },
  retakeButton: {
    width: '100%',
  },
  errorText: {
    color: theme.colors.errorText,
    fontSize: 14,
    marginBottom: 16,
  },
});
