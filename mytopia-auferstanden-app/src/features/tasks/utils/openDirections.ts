import { Linking, Platform } from 'react-native';

type DirectionsTarget = {
  latitude: number;
  longitude: number;
};

export function buildDirectionsUrl({ latitude, longitude }: DirectionsTarget) {
  const destination = `${latitude},${longitude}`;

  if (Platform.OS === 'ios') {
    return `http://maps.apple.com/?saddr=Current%20Location&daddr=${destination}&dirflg=d`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

export async function openDirections(target: DirectionsTarget) {
  const url = buildDirectionsUrl(target);
  const isSupported = await Linking.canOpenURL(url);

  if (!isSupported) {
    throw new Error('Wegbeschreibung wird auf diesem Gerät nicht unterstützt.');
  }

  await Linking.openURL(url);
}
