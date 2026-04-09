import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';

import { SectionCard } from '@/src/shared/ui/SectionCard';
import { theme } from '@/src/shared/ui/theme';
import { GpsMap } from '@/src/features/tasks/components/GpsMap';

type GpsTarget = {
    latitude: number;
    longitude: number;
    radiusMeters: number;
};

type GpsRunnerProps = {
    embedded?: boolean;
    missionId: string;
    onComplete: () => Promise<{ earned: number }>;
    target: GpsTarget;
};

export function GpsRunner({ embedded = false, missionId: _missionId, onComplete, target }: GpsRunnerProps) {
    const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
    const [distance, setDistance] = useState<number | null>(null);
    const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<{ earned: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const isInRange = distance !== null && distance <= target.radiusMeters;

    useEffect(() => {
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
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                if (isActive) {
                    setPermissionStatus('denied');
                }
                return;
            }

            if (isActive) {
                setPermissionStatus('granted');
            }

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
                }
            );
        }

        startWatching();

        return () => {
            isActive = false;
            subscription?.remove();
        };
    }, [target.latitude, target.longitude]);

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
            ? <View style={styles.panel}>{content}</View>
            : <SectionCard title="Check-in erfolgreich">{content}</SectionCard>;
    }

    if (permissionStatus === 'denied') {
        const content = (
            <View style={styles.permissionContainer}>
                <Text style={styles.body}>
                    Diese Mission benötigt Zugriff auf deinen Standort.
                </Text>
                <Text style={styles.hintText}>
                    Du kannst den Zugriff jederzeit in den Systemeinstellungen unter Datenschutz → Ortungsdienste ändern.
                </Text>
                <Pressable onPress={() => Linking.openSettings()} style={styles.settingsButton}>
                    <Text style={styles.settingsButtonText}>Einstellungen öffnen</Text>
                </Pressable>
            </View>
        );

        return embedded
            ? <View style={styles.panel}>{content}</View>
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
            setError(err instanceof Error ? err.message : 'Check-in failed.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <View style={styles.container}>
            <View style={styles.panel}>
                <Text style={styles.panelTitle}>Zielgebiet</Text>
                <GpsMap
                    radiusMeters={target.radiusMeters}
                    targetLatitude={target.latitude}
                    targetLongitude={target.longitude}
                    userLatitude={userCoords?.latitude}
                    userLongitude={userCoords?.longitude}
                />
            </View>

            <View style={styles.panel}>
                <Text style={styles.panelTitle}>Navigation zum Ziel</Text>
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
                ) : distance !== null ? (
                    <Text style={styles.outOfRangeText}>
                        Nähere dich auf {target.radiusMeters}m an das Ziel an.
                    </Text>
                ) : (
                    <Text style={styles.loadingText}>Standort wird ermittelt…</Text>
                )}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
                disabled={!isInRange || isSubmitting}
                onPress={handleCheckIn}
                style={[
                    styles.checkInButton,
                    (!isInRange || isSubmitting) ? styles.checkInButtonDisabled : null,
                ]}
            >
                <Text style={styles.checkInButtonText}>
                    {isSubmitting ? 'Check-in läuft…' : 'Einchecken'}
                </Text>
            </Pressable>
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
    checkInButton: {
        alignItems: 'center',
        backgroundColor: theme.colors.orange,
        borderRadius: 10,
        paddingVertical: 14,
    },
    checkInButtonDisabled: {
        opacity: 0.4,
    },
    checkInButtonText: {
        ...theme.typography.button,
    },
    container: {
        gap: 16,
    },
    distanceContainer: {
        alignItems: 'center',
        gap: 4,
    },
    distanceLabel: {
        color: theme.colors.cardTextPrimary,
        fontSize: 12,
    },
    distanceValue: {
        color: theme.colors.cardTextPrimary,
        fontSize: 32,
        fontWeight: '800',
    },
    errorText: {
        color: theme.colors.errorText,
        fontSize: 13,
        fontWeight: '500',
    },
    hintText: {
        color: theme.colors.cardTextPrimary,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 4,
    },
    inRangeBadge: {
        alignItems: 'center',
        backgroundColor: theme.colors.successSurface,
        borderRadius: 8,
        paddingVertical: 8,
    },
    inRangeText: {
        color: theme.colors.cardTextPrimary,
        fontSize: 14,
        fontWeight: '600',
    },
    loadingText: {
        color: theme.colors.cardTextPrimary,
        fontSize: 13,
        textAlign: 'center',
    },
    outOfRangeText: {
        color: theme.colors.cardTextPrimary,
        fontSize: 13,
        textAlign: 'center',
    },
    panel: {
        backgroundColor: theme.colors.cardSubtleBackground,
        borderColor: theme.colors.cardBorder,
        borderRadius: 14,
        borderWidth: 1,
        padding: 16,
    },
    panelTitle: {
        color: theme.colors.cardTextPrimary,
        fontFamily: 'Nunito_700Bold',
        fontSize: 15,
        marginBottom: 12,
        textTransform: 'uppercase',
    },
    permissionContainer: {
        gap: 8,
    },
    resultContainer: {
        gap: 12,
    },
    settingsButton: {
        alignItems: 'center',
        backgroundColor: theme.colors.orange,
        borderRadius: 10,
        marginTop: 12,
        paddingVertical: 12,
    },
    settingsButtonText: {
        ...theme.typography.button,
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
    successLabel: {
        color: theme.colors.cardTextPrimary,
        fontSize: 12,
        fontWeight: '600',
        opacity: 0.8,
    },
    successNumber: {
        color: theme.colors.cardTextPrimary,
        fontSize: 28,
        fontWeight: '800',
    },
    successText: {
        color: theme.colors.cardTextPrimary,
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
});
