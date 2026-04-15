import * as Location from 'expo-location';

export type AppPermissionStatus = 'undetermined' | 'granted' | 'denied';

export async function getForegroundLocationPermissionStatus(): Promise<AppPermissionStatus> {
  const permission = await Location.getForegroundPermissionsAsync();
  return normalizePermissionStatus(permission.status);
}

export async function requestForegroundLocationPermission(): Promise<AppPermissionStatus> {
  const currentStatus = await getForegroundLocationPermissionStatus();
  if (currentStatus !== 'undetermined') {
    return currentStatus;
  }

  const permission = await Location.requestForegroundPermissionsAsync();
  return normalizePermissionStatus(permission.status);
}

function normalizePermissionStatus(status: Location.PermissionStatus): AppPermissionStatus {
  if (status === Location.PermissionStatus.GRANTED) {
    return 'granted';
  }

  if (status === Location.PermissionStatus.DENIED) {
    return 'denied';
  }

  return 'undetermined';
}
