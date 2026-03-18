import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Circle, Marker } from 'react-native-maps';
import Svg, { Path } from 'react-native-svg';

import { theme } from '@/src/shared/ui/theme';
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

const USER_REGION_DELTA = {
    latitudeDelta: 0.03,
    longitudeDelta: 0.03,
};

export function MapScreen() {
    const { selectedMode } = useSession();
    const mapRef = useRef<MapView | null>(null);
    const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
    const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
    const [isRecentering, setIsRecentering] = useState(false);
    const [missions, setMissions] = useState<MissionListItem[]>([]);

    const loadCurrentLocation = async () => {
        const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });
        const nextCoords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
        };
        setUserCoords(nextCoords);
        return nextCoords;
    };

    // Request location permission on mount
    useEffect(() => {
        async function requestPermission() {
            const { status } = await Location.requestForegroundPermissionsAsync();
            setPermissionStatus(status === 'granted' ? 'granted' : 'denied');

            if (status === 'granted') {
                await loadCurrentLocation();
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
        ? { ...userCoords, ...USER_REGION_DELTA }
        : DEFAULT_REGION;

    const handleRecenter = async () => {
        if (permissionStatus !== 'granted' || isRecentering) {
            return;
        }

        setIsRecentering(true);

        try {
            const coords = await loadCurrentLocation();
            mapRef.current?.animateToRegion({ ...coords, ...USER_REGION_DELTA }, 500);
        } finally {
            setIsRecentering(false);
        }
    };

    if (permissionStatus === 'denied') {
        return (
            <Screen title="Karte" subtitle="GPS-Missionen auf der Karte" headerShown={false}>
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
        <Screen
            title="Karte"
            subtitle="GPS-Missionen auf der Karte"
            scrollable={false}
            noPadding
            bottomInset={false}
            headerShown={false}
        >
            <View style={styles.mapContainer}>
                <MapView
                    initialRegion={region}
                    onUserLocationChange={(event) => {
                        const coordinate = event.nativeEvent.coordinate;
                        if (!coordinate) {
                            return;
                        }

                        setUserCoords({
                            latitude: coordinate.latitude,
                            longitude: coordinate.longitude,
                        });
                    }}
                    showsUserLocation={permissionStatus === 'granted'}
                    showsMyLocationButton={false}
                    ref={mapRef}
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
                                    pinColor={theme.colors.orange}
                                    title={mission.title}
                                    description={`${mission.points} Punkte · Radius: ${mission.gpsConfig.radiusMeters}m`}
                                />
                                <Circle
                                    center={{
                                        latitude: mission.gpsConfig.latitude,
                                        longitude: mission.gpsConfig.longitude,
                                    }}
                                    fillColor={theme.colors.orangeSoft}
                                    radius={mission.gpsConfig.radiusMeters}
                                    strokeColor={theme.colors.orangeStroke}
                                    strokeWidth={1.5}
                                />
                            </React.Fragment>
                        ) : null
                    )}
                </MapView>
                {permissionStatus === 'granted' ? (
                    <Pressable
                        accessibilityLabel="Eigenen Standort anzeigen"
                        onPress={() => void handleRecenter()}
                        style={({ pressed }) => [styles.recenterButton, pressed && styles.recenterButtonPressed]}
                    >
                        <LocateIcon color={theme.colors.cardTextHeading} size={28} />
                    </Pressable>
                ) : null}
            </View>
        </Screen>
    );
}

function LocateIcon({ color, size }: { color: string; size: number }) {
    return (
        <Svg color={color} fill="none" height={size} viewBox="0 0 24 24" width={size}>
            <Path fill-rule="evenodd" clip-rule="evenodd" d="M2 12C2 12.3853 2.31236 12.6977 2.69767 12.6977H4.59041C4.92078 16.2509 7.74914 19.0792 11.3023 19.4096V21.3023C11.3023 21.6876 11.6147 22 12 22C12.3853 22 12.6977 21.6876 12.6977 21.3023V19.4096C16.2509 19.0792 19.0792 16.2509 19.4096 12.6977H21.3023C21.6876 12.6977 22 12.3853 22 12C22 11.6147 21.6876 11.3023 21.3023 11.3023H19.4096C19.0792 7.74914 16.2509 4.92078 12.6977 4.59041V2.69767C12.6977 2.31236 12.3853 2 12 2C11.6147 2 11.3023 2.31236 11.3023 2.69767V4.59041C7.74914 4.92078 4.92078 7.74914 4.59041 11.3023H2.69767C2.31236 11.3023 2 11.6147 2 12ZM8.51163 12C8.51163 10.0734 10.0734 8.51163 12 8.51163C13.9266 8.51163 15.4884 10.0734 15.4884 12C15.4884 13.9266 13.9266 15.4884 12 15.4884C10.0734 15.4884 8.51163 13.9266 8.51163 12Z" fill="currentColor"></Path><Path d="M9.90698 12C9.90698 10.8441 10.8441 9.90698 12 9.90698C13.1559 9.90698 14.093 10.8441 14.093 12C14.093 13.1559 13.1559 14.093 12 14.093C10.8441 14.093 9.90698 13.1559 9.90698 12Z" fill="currentColor"></Path>        </Svg>
    );
}

const styles = StyleSheet.create({
    body: {
        color: theme.colors.cardTextSecondary,
        fontSize: 14,
        lineHeight: 20,
    },
    hint: {
        color: theme.colors.cardTextSecondary,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 8,
    },
    map: {
        flex: 1,
    },
    mapContainer: {
        flex: 1,
        position: 'relative',
    },
    recenterButton: {
        alignItems: 'center',
        backgroundColor: 'rgba(237, 236, 224, 0.96)',
        borderColor: 'rgba(31, 41, 55, 0.14)',
        borderRadius: 999,
        borderWidth: 1,
        height: 48,
        justifyContent: 'center',
        paddingHorizontal: 0,
        paddingVertical: 0,
        position: 'absolute',
        right: 16,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
        top: 16,
        width: 48,
    },
    recenterButtonPressed: {
        opacity: 0.85,
    },
    settingsButton: {
        alignItems: 'center',
        backgroundColor: theme.colors.orange,
        borderRadius: 10,
        marginTop: 16,
        paddingVertical: 12,
    },
    settingsButtonText: theme.typography.button,
});
