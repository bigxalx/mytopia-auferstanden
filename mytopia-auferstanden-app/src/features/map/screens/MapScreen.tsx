import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Circle, Marker } from 'react-native-maps';

import { useSession } from '@/src/core/session/SessionContext';
import { fetchMissions, type MissionListItem } from '@/src/features/tasks/data/missionRepository';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';

/** Returns true only when the gpsConfig has valid numeric lat/lng values. */
function hasValidGpsConfig(m: MissionListItem): m is MissionListItem & {
    gpsConfig: { latitude: number; longitude: number; radiusMeters: number };
} {
    return (
        m.kind === 'gps' &&
        m.gpsConfig != null &&
        typeof m.gpsConfig.latitude === 'number' &&
        typeof m.gpsConfig.longitude === 'number' &&
        typeof m.gpsConfig.radiusMeters === 'number'
    );
}

// Default region: Altenburg, Germany (Theaterplatz)
const DEFAULT_REGION = {
    latitude: 50.9847,
    latitudeDelta: 0.02,
    longitude: 12.4364,
    longitudeDelta: 0.02,
};

export function MapScreen() {
    const { selectedMode } = useSession();
    const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
    const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
    const [missions, setMissions] = useState<MissionListItem[]>([]);

    // Request location permission on mount
    useEffect(() => {
        async function requestPermission() {
            const { status } = await Location.requestForegroundPermissionsAsync();
            setPermissionStatus(status === 'granted' ? 'granted' : 'denied');

            if (status === 'granted') {
                const location = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                });
                setUserCoords({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                });
            }
        }

        requestPermission();
    }, []);

    // Fetch GPS missions for map markers
    useEffect(() => {
        async function load() {
            try {
                const allMissions = await fetchMissions({ mode: selectedMode });
                setMissions(allMissions.filter(hasValidGpsConfig));
            } catch {
                // Silently fail — map still renders
            }
        }

        load();
    }, [selectedMode]);

    const region = userCoords
        ? { ...userCoords, latitudeDelta: 0.03, longitudeDelta: 0.03 }
        : DEFAULT_REGION;

    if (permissionStatus === 'denied') {
        return (
            <Screen title="Karte" subtitle="GPS-Missionen auf der Karte">
                <SectionCard title="Standortzugriff benötigt">
                    <Text style={styles.body}>
                        Um die Karte und GPS-Missionen nutzen zu können, benötigen wir Zugriff auf deinen Standort.
                    </Text>
                    <Text style={styles.hint}>
                        Du kannst den Zugriff jederzeit in den Systemeinstellungen unter Datenschutz → Ortungsdienste ändern.
                    </Text>
                    <Pressable onPress={() => Linking.openSettings()} style={styles.settingsButton}>
                        <Text style={styles.settingsButtonText}>Einstellungen öffnen</Text>
                    </Pressable>
                </SectionCard>
            </Screen>
        );
    }

    return (
        <Screen title="Karte" subtitle="GPS-Missionen auf der Karte" scrollable={false}>
            <View style={styles.mapContainer}>
                <MapView
                    initialRegion={region}
                    showsUserLocation={permissionStatus === 'granted'}
                    style={styles.map}
                >
                    {missions.map((mission) =>
                        mission.gpsConfig ? (
                            <React.Fragment key={mission._id}>
                                <Marker
                                    coordinate={{
                                        latitude: mission.gpsConfig.latitude,
                                        longitude: mission.gpsConfig.longitude,
                                    }}
                                    pinColor="#f97316"
                                    title={mission.title}
                                    description={`${mission.points} Punkte · Radius: ${mission.gpsConfig.radiusMeters}m`}
                                />
                                <Circle
                                    center={{
                                        latitude: mission.gpsConfig.latitude,
                                        longitude: mission.gpsConfig.longitude,
                                    }}
                                    fillColor="rgba(249, 115, 22, 0.12)"
                                    radius={mission.gpsConfig.radiusMeters}
                                    strokeColor="rgba(249, 115, 22, 0.4)"
                                    strokeWidth={1.5}
                                />
                            </React.Fragment>
                        ) : null
                    )}
                </MapView>
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    body: {
        color: '#9ca3af',
        fontSize: 14,
        lineHeight: 20,
    },
    hint: {
        color: '#9ca3af',
        fontSize: 13,
        lineHeight: 18,
        marginTop: 8,
    },
    map: {
        flex: 1,
    },
    mapContainer: {
        borderRadius: 12,
        flex: 1,
        overflow: 'hidden',
    },
    settingsButton: {
        alignItems: 'center',
        backgroundColor: '#f97316',
        borderRadius: 10,
        marginTop: 16,
        paddingVertical: 12,
    },
    settingsButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
});
