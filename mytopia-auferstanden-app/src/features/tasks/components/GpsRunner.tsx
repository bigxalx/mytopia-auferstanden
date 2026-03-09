import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';

import { SectionCard } from '@/src/shared/ui/SectionCard';

type GpsTarget = {
    latitude: number;
    longitude: number;
    radiusMeters: number;
};

type GpsRunnerProps = {
    missionId: string;
    onComplete: () => Promise<{ earned: number }>;
    target: GpsTarget;
};

export function GpsRunner({ missionId, onComplete, target }: GpsRunnerProps) {
    const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
    const [distance, setDistance] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<{ earned: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const isInRange = distance !== null && distance <= target.radiusMeters;

    useEffect(() => {
        let subscription: Location.LocationSubscription | null = null;

        async function startWatching() {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setPermissionStatus('denied');
                return;
            }

            setPermissionStatus('granted');

            subscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    distanceInterval: 5,
                    timeInterval: 3000,
                },
                (location) => {
                    const dist = getDistanceMeters(
                        location.coords.latitude,
                        location.coords.longitude,
                        target.latitude,
                        target.longitude
                    );
                    setDistance(Math.round(dist));
                }
            );
        }

        startWatching();

        return () => {
            subscription?.remove();
        };
    }, [target.latitude, target.longitude]);

    if (result) {
        return (
            <SectionCard title="Check-in erfolgreich">
                <View style={styles.successCircle}>
                    <Text style={styles.successNumber}>{result.earned}</Text>
                    <Text style={styles.successLabel}>Punkte</Text>
                </View>
                <Text style={styles.successText}>📍 Du bist angekommen!</Text>
            </SectionCard>
        );
    }

    if (permissionStatus === 'denied') {
        return (
            <SectionCard title="Standortzugriff benötigt">
                <Text style={styles.body}>
                    Diese Mission benötigt Zugriff auf deinen Standort. Bitte aktiviere den Standortzugriff in den Einstellungen.
                </Text>
            </SectionCard>
        );
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
            <SectionCard title="Navigation zum Ziel">
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
            </SectionCard>

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
        color: '#1f2937',
        fontSize: 14,
        lineHeight: 20,
    },
    checkInButton: {
        alignItems: 'center',
        backgroundColor: '#f97316',
        borderRadius: 10,
        paddingVertical: 14,
    },
    checkInButtonDisabled: {
        opacity: 0.4,
    },
    checkInButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    container: {
        gap: 16,
    },
    distanceContainer: {
        alignItems: 'center',
        gap: 4,
    },
    distanceLabel: {
        color: '#5d6979',
        fontSize: 12,
    },
    distanceValue: {
        color: '#101828',
        fontSize: 32,
        fontWeight: '800',
    },
    errorText: {
        color: '#a12b2b',
        fontSize: 13,
        fontWeight: '500',
    },
    inRangeBadge: {
        alignItems: 'center',
        backgroundColor: '#dcfce7',
        borderRadius: 8,
        paddingVertical: 8,
    },
    inRangeText: {
        color: '#15803d',
        fontSize: 14,
        fontWeight: '600',
    },
    loadingText: {
        color: '#5d6979',
        fontSize: 13,
        textAlign: 'center',
    },
    outOfRangeText: {
        color: '#5d6979',
        fontSize: 13,
        textAlign: 'center',
    },
    successCircle: {
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: '#f97316',
        borderRadius: 50,
        height: 100,
        justifyContent: 'center',
        width: 100,
    },
    successLabel: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
        opacity: 0.8,
    },
    successNumber: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '800',
    },
    successText: {
        color: '#15803d',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
});
