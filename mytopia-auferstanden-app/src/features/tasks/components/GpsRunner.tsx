import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
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
            ? <View style={compact ? styles.compactResult : null}>{content}</View>
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
            setError(err instanceof Error ? err.message : 'Check-in failed.');
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
                        <View style={styles.compactTextRow}>
                            <Text style={styles.compactDistance}>
                                {distance !== null ? formatDistance(distance) : '…'}
                            </Text>
                            {isInRange ? (
                                <Text style={styles.compactStatusText}>✅ Ziel!</Text>
                            ) : distance !== null ? (
                                <Text style={[styles.compactStatusText, { color: theme.colors.destructiveText }]}>
                                    Zu weit entfernt
                                </Text>
                            ) : (
                                <Text style={[styles.compactStatusText, { color: '#666' }]}>Ortung läuft…</Text>
                            )}
                        </View>

                        {!isInRange && distance !== null && (
                            <Pressable
                                onPress={() => {
                                    const url = `https://www.google.com/maps/dir/?api=1&destination=${target.latitude},${target.longitude}`;
                                    Linking.openURL(url);
                                }}
                                style={({ pressed }) => [
                                    styles.directionsButton,
                                    pressed && { opacity: 0.7 }
                                ]}
                            >
                                <Text style={styles.directionsButtonText}>Wegbeschreibung</Text>
                            </Pressable>
                        )}
                    </View>
                </View>

                <Pressable
                    disabled={!isInRange || isSubmitting}
                    onPress={handleCheckIn}
                    style={({ pressed }) => [
                        styles.compactCheckInButton,
                        (!isInRange || isSubmitting) ? styles.checkInButtonDisabled : null,
                        pressed && { opacity: 0.7 }
                    ]}
                >
                    {isSubmitting ? (
                        <ActivityIndicator size="small" color="white" />
                    ) : (
                        <Text style={styles.compactCheckInButtonText}>Einchecken</Text>
                    )}
                </Pressable>

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
    },
    mapWrap: {
        borderRadius: 12,
        height: 200,
        overflow: 'hidden',
    },
    outOfRangeText: {
        color: theme.colors.destructiveText,
        fontFamily: 'NunitoSans_400Regular',
        fontSize: 14,
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
        alignItems: 'center',
        backgroundColor: theme.colors.orange,
        borderRadius: 10,
        marginTop: 12,
        paddingVertical: 12,
    },
    settingsButtonText: {
        ...theme.typography.button,
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
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
    },
    compactMapWrap: {
        width: 60,
        height: 60,
        borderRadius: 30,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
    },
    compactDetails: {
        flex: 1,
        gap: 4,
    },
    compactTextRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    compactDistance: {
        fontSize: 16,
        fontFamily: 'NunitoSans_700Bold',
        color: theme.colors.cardTextPrimary,
    },
    compactStatusText: {
        fontSize: 12,
        fontFamily: 'NunitoSans_700Bold',
        textTransform: 'uppercase',
    },
    directionsButton: {
        alignSelf: 'flex-start',
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
    compactCheckInButton: {
        backgroundColor: theme.colors.orange,
        borderRadius: 20,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    compactCheckInButtonText: {
        color: 'white',
        fontSize: 13,
        fontFamily: 'Nunito_700Bold',
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

