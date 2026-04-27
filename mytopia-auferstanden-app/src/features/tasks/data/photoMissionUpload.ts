import * as ImagePicker from 'expo-image-picker';
import {
  cacheDirectory,
  copyAsync,
  makeDirectoryAsync,
} from 'expo-file-system/legacy';
import { getStorage, putFile, ref } from '@react-native-firebase/storage';

export type PreparedMissionPhoto = {
  extension: string;
  localUri: string;
  mimeType: string;
};

const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function prepareMissionPhotoAsset(
  asset: ImagePicker.ImagePickerAsset,
  missionId: string,
): Promise<PreparedMissionPhoto> {
  const sourceUri = asset.uri?.trim();
  if (!sourceUri) {
    throw new Error('Ausgewähltes Foto konnte nicht gelesen werden.');
  }

  const extension = resolvePhotoExtension({
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    uri: sourceUri,
  });
  const mimeType = resolvePhotoMimeType(asset.mimeType, extension);

  if (!cacheDirectory) {
    return {
      extension,
      localUri: sourceUri,
      mimeType,
    };
  }

  const targetDirectory = `${cacheDirectory}mission-uploads`;
  const targetUri = `${targetDirectory}/${missionId}-${Date.now()}.${extension}`;

  try {
    await makeDirectoryAsync(targetDirectory, { intermediates: true });
    await copyAsync({
      from: sourceUri,
      to: targetUri,
    });

    return {
      extension,
      localUri: targetUri,
      mimeType,
    };
  } catch (copyError) {
    if (sourceUri.startsWith('file://')) {
      return {
        extension,
        localUri: sourceUri,
        mimeType,
      };
    }

    throw new Error(
      copyError instanceof Error && copyError.message.trim().length > 0
        ? copyError.message
        : 'Foto konnte nicht für den Upload vorbereitet werden.',
    );
  }
}

export async function uploadMissionPhoto(params: {
  extension?: string;
  localUri: string;
  mimeType?: string;
  missionId: string;
  onProgress?: (progress: number) => void;
  userId: string;
}) {
  const localUri = params.localUri.trim();
  const extension = params.extension ?? resolvePhotoExtension({ uri: localUri });
  const mimeType = resolvePhotoMimeType(params.mimeType, extension);
  const timestamp = Date.now();
  const storagePath = `submissions/${params.userId}/${params.missionId}-${timestamp}.${extension}`;
  const storageInstance = getStorage();
  const reference = ref(storageInstance, storagePath);
  const task = putFile(reference, localUri, {
    contentType: mimeType,
  });

  task.on('state_changed', (snapshot) => {
    const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
    params.onProgress?.(progress);
  });

  await task;
  return `gs://${reference.bucket}/${storagePath}`;
}

export function getFirebaseStorageAvailability() {
  try {
    getStorage();
    return {
      available: true as const,
      message: null,
    };
  } catch (error) {
    if (isMissingFirebaseStorageModuleError(error)) {
      return {
        available: false as const,
        message: 'Diese App-Version unterstützt Foto-Missionen noch nicht. Bitte installiere den neuesten Build.',
      };
    }

    return {
      available: false as const,
      message: 'Foto-Upload ist in diesem Build derzeit nicht verfügbar.',
    };
  }
}

export function resolveRetryLocalPhotoUri(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const rawPayload = payload as { photoPath?: unknown; photoUrl?: unknown };
  const candidates = [rawPayload.photoUrl, rawPayload.photoPath];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && isLocalRetryUri(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isMissingFirebaseStorageModuleError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /@react-native-firebase\/storage/.test(error.message) ||
    /storage" but this module could not be found/i.test(error.message);
}

function isLocalRetryUri(value: string) {
  return /^(?:(?:file|content|assets-library|ph):\/\/)/i.test(value);
}

function resolvePhotoExtension(params: {
  fileName?: string | null;
  mimeType?: string | null;
  uri: string;
}) {
  return (
    extractExtension(params.fileName) ??
    extractExtension(params.uri) ??
    (params.mimeType ? MIME_TYPE_TO_EXTENSION[params.mimeType.toLowerCase()] : undefined) ??
    'jpg'
  );
}

function resolvePhotoMimeType(mimeType: string | null | undefined, extension: string) {
  const normalizedMimeType = mimeType?.trim().toLowerCase();
  if (normalizedMimeType) {
    return normalizedMimeType;
  }

  switch (extension) {
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
}

function extractExtension(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const withoutQuery = value.split('?')[0];
  const lastSegment = withoutQuery.split('/').pop() ?? withoutQuery;
  const lastDotIndex = lastSegment.lastIndexOf('.');

  if (lastDotIndex <= 0 || lastDotIndex === lastSegment.length - 1) {
    return null;
  }

  const extension = lastSegment.slice(lastDotIndex + 1).trim().toLowerCase();
  return /^[a-z0-9]+$/.test(extension) ? extension : null;
}
