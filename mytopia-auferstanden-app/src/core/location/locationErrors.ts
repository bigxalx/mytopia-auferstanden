export function getLocationUnavailableMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';

  if (/location services are enabled/i.test(message) || /current location is unavailable/i.test(message)) {
    return 'Aktueller Standort ist nicht verfuegbar. Bitte aktiviere die Ortungsdienste auf deinem Geraet.';
  }

  return 'Standort konnte gerade nicht ermittelt werden. Bitte versuche es erneut.';
}
