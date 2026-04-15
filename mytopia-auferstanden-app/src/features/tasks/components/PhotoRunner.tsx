import { useState } from 'react';
import { StyleSheet, Text, View, Image, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getStorage, ref, putFile } from '@react-native-firebase/storage/lib/modular';
import { AppButton } from '@/src/shared/ui/AppButton';
import { theme } from '@/src/shared/ui/theme';
import { useSession } from '@/src/core/session/SessionContext';

type PhotoRunnerProps = {
  embedded?: boolean;
  missionId: string;
  onComplete: (params: {
    localUri: string;
    upload: (onProgress?: (progress: number) => void) => Promise<string>;
  }) => Promise<{ action: string }>;
};

export function PhotoRunner({ missionId, onComplete, embedded = false }: PhotoRunnerProps) {
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
      await onComplete({
        localUri: photoUri,
        upload: async (onProgress) => {
          const extension = photoUri.split('.').pop() || 'jpg';
          const timestamp = new Date().getTime();
          const storagePath = `submissions/${user.id}/${missionId}-${timestamp}.${extension}`;
          const storageInstance = getStorage();
          const reference = ref(storageInstance, storagePath);
          const task = putFile(reference, photoUri);

          task.on('state_changed', snapshot => {
            const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            setUploadProgress(progress);
            onProgress?.(progress);
          });

          await task;
          return `gs://${reference.bucket}/${storagePath}`;
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden oder Hochladen.');
      setUploadProgress(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, embedded ? styles.containerEmbedded : null]}>
      {!embedded ? <Text style={styles.title}>Dein Foto</Text> : null}

      {photoUri ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: photoUri }} style={styles.previewImage} />

          <View style={[embedded ? styles.inlineButtonRow : styles.buttonGroup, styles.previewActions]}>
            {embedded ? (
              <Pressable
                disabled={isSubmitting}
                onPress={handlePickLibrary}
                style={[
                  styles.inlineActionButton,
                  isSubmitting ? styles.actionButtonDisabled : null,
                ]}
              >
                <Feather name="image" size={18} color="white" />
                <Text style={styles.inlineActionButtonText}>Anderes Foto</Text>
              </Pressable>
            ) : (
              <AppButton
                disabled={isSubmitting}
                fullWidth
                label="Anderes Foto"
                onPress={() => {
                  void handlePickLibrary();
                }}
                variant="secondary"
              />
            )}
            {embedded ? (
              <Pressable
                disabled={isSubmitting || !photoUri}
                onPress={handleSubmit}
                style={[
                  styles.inlineActionButton,
                  styles.inlineSubmitButton,
                  (isSubmitting || !photoUri) ? styles.actionButtonDisabled : null,
                ]}
              >
                <Text style={styles.inlineActionButtonText}>
                  {isSubmitting
                      ? 'Senden...'
                      : 'Einreichen'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={embedded ? styles.inlineButtonRow : styles.buttonGroup}>
          {embedded ? (
            <>
              <Pressable
                disabled={isSubmitting}
                onPress={handleTakePhoto}
                style={[
                  styles.inlineActionButton,
                  isSubmitting ? styles.actionButtonDisabled : null,
                ]}
              >
                <Feather name="camera" size={18} color="white" />
                <Text style={styles.inlineActionButtonText}>KAMERA</Text>
              </Pressable>
              <Pressable
                disabled={isSubmitting}
                onPress={handlePickLibrary}
                style={[
                  styles.inlineActionButton,
                  isSubmitting ? styles.actionButtonDisabled : null,
                ]}
              >
                <Feather name="image" size={18} color="white" />
                <Text style={styles.inlineActionButtonText}>GALERIE</Text>
              </Pressable>
            </>
          ) : (
            <>
              <AppButton
                disabled={isSubmitting}
                fullWidth
                label="Foto aufnehmen"
                onPress={() => {
                  void handleTakePhoto();
                }}
                variant="primary"
              />
              <AppButton
                disabled={isSubmitting}
                fullWidth
                label="Aus Mediathek"
                onPress={() => {
                  void handlePickLibrary();
                }}
                variant="secondary"
              />
            </>
          )}
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {!embedded ? (
        <AppButton
          disabled={isSubmitting || !photoUri}
          fullWidth
          label={
            isSubmitting && uploadProgress !== null
              ? `Wird hochgeladen... (${uploadProgress}%)`
              : isSubmitting
                ? 'Wird gesendet...'
                : 'Einreichen'
          }
          loading={isSubmitting}
          onPress={() => {
            void handleSubmit();
          }}
          variant="primary"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actionButtonDisabled: {
      opacity: 0.4,
  },
  container: {
    backgroundColor: theme.colors.beige,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    marginTop: 16,
  },
  containerEmbedded: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 4,
    marginTop: 0,
  },
  title: {
    color: theme.colors.cardTextPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  buttonGroup: {
    gap: 12,
    marginBottom: 16,
  },
  inlineButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  previewActions: {
    alignSelf: 'stretch',
    marginTop: 4,
    marginBottom: 0,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 12,
  },
  inlineActionButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.orange,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  inlineSubmitButton: {
    backgroundColor: '#D4691C',
  },
  inlineActionButtonText: {
    color: 'white',
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  errorText: {
    color: theme.colors.errorText,
    fontSize: 14,
    marginBottom: 16,
  },
});
