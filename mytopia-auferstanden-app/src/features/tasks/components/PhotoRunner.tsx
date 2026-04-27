import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, Image, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppButton } from '@/src/shared/ui/AppButton';
import { theme } from '@/src/shared/ui/theme';
import { useSession } from '@/src/core/session/SessionContext';
import { getVisibleErrorMessage } from '@/src/shared/utils/visibleErrorMessage';
import {
  getFirebaseStorageAvailability,
  prepareMissionPhotoAsset,
  type PreparedMissionPhoto,
  uploadMissionPhoto,
} from '@/src/features/tasks/data/photoMissionUpload';

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
  const [photo, setPhoto] = useState<PreparedMissionPhoto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const storageAvailability = useMemo(getFirebaseStorageAvailability, []);

  const handlePickLibrary = async () => {
    if (!storageAvailability.available) {
      setError(storageAvailability.message);
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const preparedPhoto = await prepareMissionPhotoAsset(result.assets[0], missionId);
        setPhoto(preparedPhoto);
        setError(null);
        setUploadProgress(null);
      }
    } catch (pickedError) {
      setError(
        getVisibleErrorMessage(pickedError, 'Fehler beim Öffnen der Mediathek.'),
      );
    }
  };

  const handleTakePhoto = async () => {
    if (!storageAvailability.available) {
      setError(storageAvailability.message);
      return;
    }

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
        const preparedPhoto = await prepareMissionPhotoAsset(result.assets[0], missionId);
        setPhoto(preparedPhoto);
        setError(null);
        setUploadProgress(null);
      }
    } catch (cameraError) {
      setError(
        getVisibleErrorMessage(cameraError, 'Fehler beim Öffnen der Kamera.'),
      );
    }
  };

  const handleSubmit = async () => {
    if (!storageAvailability.available) {
      setError(storageAvailability.message);
      return;
    }

    if (!photo || !user) {
      setError('Bitte wähle ein Foto aus.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setUploadProgress(0);

    try {
      await onComplete({
        localUri: photo.localUri,
        upload: (onProgress) =>
          uploadMissionPhoto({
            extension: photo.extension,
            localUri: photo.localUri,
            mimeType: photo.mimeType,
            missionId,
            onProgress: (progress) => {
              setUploadProgress(progress);
              onProgress?.(progress);
            },
            userId: user.id,
          }),
      });
    } catch (err) {
      setError(getVisibleErrorMessage(err, 'Fehler beim Senden oder Hochladen.'));
      setUploadProgress(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, embedded ? styles.containerEmbedded : null]}>
      {!embedded ? <Text style={styles.title}>Dein Foto</Text> : null}

      {photo ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: photo.localUri }} style={styles.previewImage} />

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
                disabled={isSubmitting || !photo}
                onPress={handleSubmit}
                style={[
                  styles.inlineActionButton,
                  styles.inlineSubmitButton,
                  (isSubmitting || !photo) ? styles.actionButtonDisabled : null,
                ]}
              >
                <Text style={styles.inlineActionButtonText}>
                  {isSubmitting
                      ? 'Senden…'
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
                disabled={isSubmitting || !storageAvailability.available}
                onPress={handleTakePhoto}
                style={[
                  styles.inlineActionButton,
                  (isSubmitting || !storageAvailability.available) ? styles.actionButtonDisabled : null,
                ]}
              >
                <Feather name="camera" size={18} color="white" />
                <Text style={styles.inlineActionButtonText}>Kamera</Text>
              </Pressable>
              <Pressable
                disabled={isSubmitting || !storageAvailability.available}
                onPress={handlePickLibrary}
                style={[
                  styles.inlineActionButton,
                  (isSubmitting || !storageAvailability.available) ? styles.actionButtonDisabled : null,
                ]}
              >
                <Feather name="image" size={18} color="white" />
                <Text style={styles.inlineActionButtonText}>Galerie</Text>
              </Pressable>
            </>
          ) : (
            <>
              <AppButton
                disabled={isSubmitting || !storageAvailability.available}
                fullWidth
                label="Foto aufnehmen"
                onPress={() => {
                  void handleTakePhoto();
                }}
                variant="primary"
              />
              <AppButton
                disabled={isSubmitting || !storageAvailability.available}
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
      {!storageAvailability.available && !error ? (
        <Text style={styles.errorText}>{storageAvailability.message}</Text>
      ) : null}

      {!embedded ? (
        <AppButton
          disabled={isSubmitting || !photo || !storageAvailability.available}
          fullWidth
          label={
            isSubmitting && uploadProgress !== null
              ? `Wird hochgeladen… (${uploadProgress}%)`
              : isSubmitting
                ? 'Wird gesendet…'
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
