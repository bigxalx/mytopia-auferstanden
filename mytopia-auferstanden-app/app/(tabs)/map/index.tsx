import { useHeaderHeight } from '@react-navigation/elements';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Circle, Marker } from 'react-native-maps';

import { theme } from '@/src/shared/ui/theme';
import { useSession } from '@/src/core/session/SessionContext';
import { fetchMissions } from '@/src/features/tasks/data/missionRepository';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { SettingsBold } from '@/components/ui/SolarTabIcons';
import { darkMapStyle } from '@/src/shared/ui/darkMapStyle';
import {
    CheckIcon,
    hasValidGpsConfig,
    LocateIcon,
    MapControlButton,
    MapPopoverSurface
} from '@/components/map/MapComponents';

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

export default function MapScreen() {
    const { selectedMode, user } = useSession();
    const completedMissions = useCompletedMissions(user?.id);
    const submissionStates = useMissionSubmissionStates(user?.id);
    const headerHeight = useHeaderHeight();
    const mapRef = useRef<MapView | null>(null);
    const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
    const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
    const [isRecentering, setIsRecentering] = useState(false);

    // Legend / Popover states
    const [showActive, setShowActive] = useState(true);
    const [showDone, setShowDone] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const [missions, setMissions] = useState<any[]>([]);

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

    // Fetch and categorize all GPS missions
    useEffect(() => {
        async function load() {
            try {
                const allMissions = await fetchMissions({ mode: selectedMode });
                const gpsMissions = allMissions.filter(hasValidGpsConfig).map((m: any) => {
                    const isCompleted = completedMissions.includes(m._id);
                    const submissionState = submissionStates[m._id];
                    const isPending = submissionState?.status === 'pending';
                    return {
                        ...m,
                        isDone: isCompleted || isPending
                    };
                });

                setMissions(gpsMissions);
            } catch {
                // Silently fail — map still renders
            }
        }

        load();
    }, [selectedMode, completedMissions, submissionStates]);

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

    const visibleMissions = missions.filter(m => (m.isDone ? showDone : showActive));
    const controlsTop = Platform.OS === 'ios' ? headerHeight + 12 : 16;

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
                    customMapStyle={darkMapStyle}
                    userInterfaceStyle="dark"
                >
                    {visibleMissions.map((mission) =>
                        mission.gpsConfig ? (
                            <React.Fragment key={mission._id}>
                                <Marker
                                    coordinate={{
                                        latitude: mission.gpsConfig.latitude,
                                        longitude: mission.gpsConfig.longitude,
                                    }}
                                    pinColor={mission.isDone ? theme.colors.blue : theme.colors.orange}
                                    title={mission.title}
                                    description={`${mission.isDone ? 'Erledigt' : 'Aktiv'} · ${mission.points} Punkte`}
                                />
                                <Circle
                                    center={{
                                        latitude: mission.gpsConfig.latitude,
                                        longitude: mission.gpsConfig.longitude,
                                    }}
                                    fillColor={mission.isDone ? theme.colors.blueAlpha : theme.colors.orangeAlpha}
                                    radius={mission.gpsConfig.radiusMeters}
                                    strokeColor={mission.isDone ? theme.colors.blue : theme.colors.orange}
                                    strokeWidth={1}
                                />
                            </React.Fragment>
                        ) : null
                    )}
                </MapView>

                {/* Control Panel (Recenter + Legend Toggle) */}
                <View style={[styles.controlsLayer, { top: controlsTop }]}>
                    {permissionStatus === 'granted' && (
                        <MapControlButton
                            accessibilityLabel="Eigenen Standort anzeigen"
                            onPress={() => void handleRecenter()}
                        >
                            <LocateIcon color={theme.colors.cardTextHeading} size={24} />
                        </MapControlButton>
                    )}

                    <View style={styles.settingsAnchor}>
                        <MapControlButton
                            active={isSettingsOpen}
                            onPress={() => setIsSettingsOpen(!isSettingsOpen)}
                        >
                            <SettingsBold color={isSettingsOpen ? '#fff' : theme.colors.cardTextHeading} size={24} />
                        </MapControlButton>

                        {isSettingsOpen && (
                            <MapPopoverSurface>
                                <Pressable
                                    onPress={() => setShowActive(!showActive)}
                                    style={styles.popoverRow}
                                >
                                    <View style={styles.checkSlot}>
                                        {showActive && <CheckIcon size={14} color={theme.colors.orange} />}
                                    </View>
                                    <View style={[styles.dotIndicator, { backgroundColor: theme.colors.orange }]} />
                                    <Text style={styles.popoverLabel}>
                                        {missions.filter((m) => !m.isDone).length === 1 ? 'Aktuelle Mission' : 'Aktuelle Missionen'}
                                    </Text>
                                </Pressable>

                                <View style={styles.popoverSeparator} />

                                <Pressable
                                    onPress={() => setShowDone(!showDone)}
                                    style={styles.popoverRow}
                                >
                                    <View style={styles.checkSlot}>
                                        {showDone && <CheckIcon size={14} color={theme.colors.blue} />}
                                    </View>
                                    <View style={[styles.dotIndicator, { backgroundColor: theme.colors.blue }]} />
                                    <Text style={styles.popoverLabel}>
                                        {missions.filter((m) => m.isDone).length === 1 ? 'Abgeschlossene Mission' : 'Abgeschlossene Missionen'}
                                    </Text>
                                </Pressable>
                            </MapPopoverSurface>
                        )}
                    </View>
                </View>
            </View>
        </Screen>
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
        backgroundColor: theme.colors.background,
    },
    controlsLayer: {
        position: 'absolute',
        right: 16,
        gap: 12,
        alignItems: 'flex-end',
    },
    settingsAnchor: {
        alignItems: 'flex-end',
    } as ViewStyle,
    popoverRow: {
        alignItems: 'center',
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 12,
    } as ViewStyle,
    popoverLabel: {
        color: theme.colors.cardTextPrimary,
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 12,
        flexShrink: 0,
    },
    popoverSeparator: {
        backgroundColor: 'rgba(31, 41, 55, 0.08)',
        height: 1,
        marginHorizontal: 8,
    },
    checkSlot: {
        width: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dotIndicator: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginLeft: 8,
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
