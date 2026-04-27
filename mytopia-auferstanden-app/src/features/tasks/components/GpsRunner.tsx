import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';

import { requestForegroundLocationPermission, getForegroundLocationPermissionStatus } from '@/src/core/location/locationPermissionClient';
import { getLocationUnavailableMessage } from '@/src/core/location/locationErrors';
import { AppButton } from '@/src/shared/ui/AppButton';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { theme } from '@/src/shared/ui/theme';
import { getVisibleErrorMessage } from '@/src/shared/utils/visibleErrorMessage';
import { GpsMap } from '@/src/features/tasks/components/GpsMap';
import { openDirections } from '@/src/features/tasks/utils/openDirections';

type GpsTarget = {
    latitude: number;
    longitude: number;
    radiusMeters: number;
};

type GpsRunnerProps = {
    embedded?: boolean;
    compact?: boolean;
    missionId: string;
    onComplete: () => Promise<{ earned: number }>;
    target: GpsTarget;
};

export function GpsRunner({ embedded = false, compact = false, missionId: _missionId, onComplete, target }: GpsRunnerProps) {
    const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
    const [distance, setDistance] = useState<number | null>(null);
    const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<{ earned: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const isInRange = distance !== null && distance <= target.radiusMeters;

    const handleOpenDirections = useCallback(async () => {
        try {
            await openDirections({
                latitude: target.latitude,
                longitude: target.longitude,
            });
        } catch {
            setError('Wegbeschreibung konnte nicht geöffnet werden.');
        }
    }, [target.latitude, target.longitude]);

    useEffect(() => {
        let isActive = true;

        void getForegroundLocationPermissionStatus().then((status) => {
            if (!isActive) {
                return;
            }

            setPermissionStatus(status);
        });

        return () => {
            isActive = false;
        };
    }, []);

    useEffect(() => {
        if (permissionStatus !== 'granted') {
            return;
        }

        let isActive = true;
        let subscription: Location.LocationSubscription | null = null;

        const applyLocation = (coords: { latitude: number; longitude: number }) => {
            if (!isActive) {
                return;
            }

            setUserCoords(coords);
            const dist = getDistanceMeters(
                coords.latitude,
                coords.longitude,
                target.latitude,
                target.longitude
            );
            setDistance(Math.round(dist));
        };

        async function startWatching() {
            try {
                const currentLocation = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                });
                applyLocation({
                    latitude: currentLocation.coords.latitude,
                    longitude: currentLocation.coords.longitude,
                });
            } catch {
                // Keep the live watcher below as the fallback source of location updates.
            }

            try {
                subscription = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.High,
                        distanceInterval: 5,
                        timeInterval: 3000,
                    },
                    (location) => {
                        applyLocation({
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                        });
                        setError(null);
                    }
                );
            } catch (watchError) {
                if (isActive) {
                    setError(getLocationUnavailableMessage(watchError));
                }
            }
        }

        void startWatching();

        return () => {
            isActive = false;
            subscription?.remove();
        };
    }, [permissionStatus, target.latitude, target.longitude]);

    const handleRequestPermission = useCallback(async () => {
        const status = await requestForegroundLocationPermission();
        setPermissionStatus(status);
    }, []);

    if (result) {
        const content = (
            <View style={styles.resultContainer}>
                <View style={styles.successCircle}>
                    <Text style={styles.successNumber}>{result.earned}</Text>
                    <Text style={styles.successLabel}>Punkte</Text>
                </View>
                <Text style={styles.successText}>📍 Du bist angekommen!</Text>
            </View>
        );

        return embedded
            ? <View style={compact ? styles.compactResult : null}>{content}</View>
            : <SectionCard title="Einchecken erfolgreich">{content}</SectionCard>;
    }

    if (permissionStatus === 'denied' || permissionStatus === 'undetermined') {
        const isUndetermined = permissionStatus === 'undetermined';
        const content = (
            <View style={styles.permissionContainer}>
                <Text style={styles.body}>
                    {isUndetermined
                        ? 'Diese Mission benötigt Standortzugriff, bevor du die Entfernung und das Einchecken sehen kannst.'
                        : 'Diese Mission benötigt Zugriff auf deinen Standort.'}
                </Text>
                <Text style={styles.hintText}>
                    {isUndetermined
                        ? 'Der Zugriff wird nur für GPS-Missionen und die Anzeige deiner Entfernung verwendet.'
                        : 'Du kannst den Zugriff jederzeit in den Systemeinstellungen unter Datenschutz → Ortungsdienste ändern.'}
                </Text>
                <AppButton
                    fullWidth
                    label={isUndetermined ? 'Standort freigeben' : 'Einstellungen öffnen'}
                    onPress={() => {
                        if (isUndetermined) {
                            void handleRequestPermission();
                            return;
                        }

                        void Linking.openSettings();
                    }}
                    style={styles.settingsButton}
                    variant={isUndetermined ? 'primary' : 'secondary'}
                />
            </View>
        );

        return embedded
            ? <View style={compact ? styles.compactPadding : null}>{content}</View>
            : <SectionCard title="Standortzugriff benötigt">{content}</SectionCard>;
    }

    async function handleCheckIn() {
        if (isSubmitting || !isInRange) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const submitResult = await onComplete();
            setResult(submitResult);
        } catch (err) {
            setError(getVisibleErrorMessage(err, 'Einchecken fehlgeschlagen.'));
        } finally {
            setIsSubmitting(false);
        }
    }

    if (compact) {
        return (
            <View style={styles.compactContainer}>
                <View style={styles.compactMainRow}>
                    <View style={styles.compactMapWrap}>
                        <GpsMap
                            radiusMeters={target.radiusMeters}
                            targetLatitude={target.latitude}
                            targetLongitude={target.longitude}
                            userLatitude={userCoords?.latitude}
                            userLongitude={userCoords?.longitude}
                        />
                    </View>

                    <View style={styles.compactDetails}>
                        <Text style={styles.compactDistance}>
                            {distance !== null ? formatDistance(distance) : '…'}
                        </Text>
                        <Text style={styles.compactDistanceLabel}>Entfernung zum Ziel</Text>

                        {!isInRange && (
                            <Pressable
                                onPress={() => {
                                    void handleOpenDirections();
                                }}
                                style={({ pressed }) => [
                                    styles.directionsButton,
                                    pressed && { opacity: 0.7 }
                                ]}
                            >
                                <Text style={styles.directionsButtonText}>Wegbeschreibung</Text>
                            </Pressable>
                        )}

                        {isInRange ? (
                            <View style={styles.compactStatusBadge}>
                                <Text style={styles.compactStatusBadgeText}>Im Zielgebiet</Text>
                            </View>
                        ) : null}
                    </View>
                </View>

                {isInRange ? (
                    <AppButton
                        fullWidth
                        label="Einchecken"
                        loading={isSubmitting}
                        onPress={() => {
                            void handleCheckIn();
                        }}
                        variant="primary"
                    />
                ) : null}

                {error ? <Text style={styles.compactErrorText}>{error}</Text> : null}
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.mapWrap}>
                <GpsMap
                    radiusMeters={target.radiusMeters}
                    targetLatitude={target.latitude}
                    targetLongitude={target.longitude}
                    userLatitude={userCoords?.latitude}
                    userLongitude={userCoords?.longitude}
                />
            </View>

            <View style={styles.detailsBlock}>
                <View style={styles.distanceContainer}>
                    <Text style={styles.distanceValue}>
                        {distance !== null ? formatDistance(distance) : '…'}
                    </Text>
                    <Text style={styles.distanceLabel}>Entfernung zum Ziel</Text>
                </View>

                {isInRange ? (
                    <View style={styles.inRangeBadge}>
                        <Text style={styles.inRangeText}>✅ Du bist im Zielgebiet!</Text>
                    </View>
                ) : (
                    <Text style={styles.loadingText}>Standort wird ermittelt…</Text>
                )}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {!isInRange ? (
                <AppButton
                    fullWidth
                    label="Wegbeschreibung"
                    onPress={() => {
                        void handleOpenDirections();
                    }}
                    variant="secondary"
                />
            ) : (
                <AppButton
                    disabled={isSubmitting}
                    fullWidth
                    label={isSubmitting ? 'Einchecken läuft…' : 'Einchecken'}
                    loading={isSubmitting}
                    onPress={() => {
                        void handleCheckIn();
                    }}
                    variant="primary"
                />
            )}
        </View>
    );
}

function formatDistance(meters: number) {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)} km`;
    }

    return `${meters} m`;
}

function getDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg: number) {
    return (deg * Math.PI) / 180;
}

const styles = StyleSheet.create({
    body: {
        color: theme.colors.cardTextPrimary,
        fontSize: 14,
        lineHeight: 20,
    },
    container: {
        gap: 16,
    },
    detailsBlock: {
        gap: 4,
    },
    distanceContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
    },
    distanceLabel: {
        color: theme.colors.cardTextMuted,
        fontSize: 12,
    },
    distanceValue: {
        color: theme.colors.cardTextPrimary,
        fontFamily: 'NunitoSans_700Bold',
        fontSize: 24,
    },
    errorText: {
        color: theme.colors.destructiveText,
        fontSize: 14,
        textAlign: 'center',
    },
    inRangeBadge: {
        alignItems: 'center',
        backgroundColor: 'rgba(52, 199, 89, 0.1)',
        borderRadius: 8,
        paddingVertical: 8,
    },
    inRangeText: {
        color: theme.colors.successText,
        fontFamily: 'NunitoSans_700Bold',
        fontSize: 14,
    },
    loadingText: {
        color: theme.colors.cardTextMuted,
        fontSize: 14,
        fontStyle: 'italic',
        textAlign: 'center',
    },
    mapWrap: {
        borderRadius: 12,
        height: 200,
        overflow: 'hidden',
    },
    hintText: {
        color: theme.colors.cardTextPrimary,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 4,
    },
    permissionContainer: {
        gap: 8,
    },
    settingsButton: {
        marginTop: 12,
    },
    resultContainer: {
        gap: 12,
    },
    successCircle: {
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: theme.colors.orange,
        borderRadius: 50,
        height: 100,
        justifyContent: 'center',
        width: 100,
    },
    successNumber: {
        color: theme.colors.cardTextPrimary,
        fontFamily: 'NunitoSans_700Bold',
        fontSize: 24,
    },
    successLabel: {
        color: theme.colors.cardTextPrimary,
        fontSize: 12,
        fontFamily: 'NunitoSans_600SemiBold',
    },
    successText: {
        color: theme.colors.cardTextPrimary,
        fontSize: 14,
        fontFamily: 'NunitoSans_600SemiBold',
        textAlign: 'center',
    },
    // Compact styles
    compactContainer: {
        gap: 12,
        padding: 4,
    },
    compactMainRow: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 12,
    },
    compactMapWrap: {
        width: 104,
        height: 78,
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
    },
    compactDetails: {
        flex: 1,
        gap: 8,
        justifyContent: 'center',
    },
    compactDistance: {
        color: theme.colors.cardTextPrimary,
        fontFamily: 'NunitoSans_700Bold',
        fontSize: 18,
    },
    compactDistanceLabel: {
        color: theme.colors.cardTextMuted,
        fontSize: 12,
    },
    compactStatusBadge: {
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: 'rgba(52, 199, 89, 0.12)',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    compactStatusBadgeText: {
        color: theme.colors.successText,
        fontFamily: 'NunitoSans_700Bold',
        fontSize: 12,
    },
    directionsButton: {
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: theme.colors.orange,
        borderRadius: 15,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    directionsButtonText: {
        fontSize: 11,
        fontFamily: 'NunitoSans_700Bold',
        color: theme.colors.orange,
        textTransform: 'uppercase',
    },
    compactErrorText: {
        fontSize: 10,
        color: theme.colors.destructiveText,
        textAlign: 'center',
    },
    compactResult: {
        paddingVertical: 4,
    },
    compactPadding: {
        paddingVertical: 8,
    },
});
