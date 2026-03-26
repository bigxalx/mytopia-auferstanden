import { useHeaderHeight } from '@react-navigation/elements';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Circle, Marker } from 'react-native-maps';
import Svg, { Path } from 'react-native-svg';

import { theme } from '@/src/shared/ui/theme';
import { useSession } from '@/src/core/session/SessionContext';
import { fetchMissions, type MissionListItem } from '@/src/features/tasks/data/missionRepository';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { SettingsBold } from '@/components/ui/SolarTabIcons';

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

const GLASS_EFFECT_ENABLED =
    Platform.OS === 'ios' &&
    isGlassEffectAPIAvailable() &&
    isLiquidGlassAvailable();

export function MapScreen() {
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
    
    const [missions, setMissions] = useState<(MissionListItem & { isDone: boolean })[]>([]);

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
                const gpsMissions = allMissions.filter(hasValidGpsConfig).map(m => {
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

function MapControlButton({
    accessibilityLabel,
    active = false,
    children,
    onPress,
}: {
    accessibilityLabel?: string;
    active?: boolean;
    children: React.ReactNode;
    onPress: () => void;
}) {
    return (
        <Pressable
            accessibilityLabel={accessibilityLabel}
            onPress={onPress}
            style={({ pressed }) => [pressed && styles.controlButtonPressed]}
        >
            {GLASS_EFFECT_ENABLED ? (
                <GlassView
                    colorScheme="light"
                    glassEffectStyle="clear"
                    style={[
                        styles.controlButtonSurface,
                        styles.controlButtonGlass,
                        active && styles.controlButtonGlassActive,
                    ]}
                    tintColor={active ? 'rgba(249, 115, 22, 0.2)' : 'rgba(237, 236, 224, 0.12)'}
                >
                    {children}
                </GlassView>
            ) : (
                <View
                    style={[
                        styles.controlButtonSurface,
                        styles.controlButtonFallback,
                        active && styles.controlButtonActive,
                    ]}
                >
                    {children}
                </View>
            )}
        </Pressable>
    );
}

function MapPopoverSurface({ children }: { children: React.ReactNode }) {
    if (GLASS_EFFECT_ENABLED) {
        return (
            <GlassView
                colorScheme="light"
                glassEffectStyle="clear"
                style={[styles.popoverSurface, styles.popoverGlass]}
                tintColor="rgba(237, 236, 224, 0.12)"
            >
                {children}
            </GlassView>
        );
    }

    return <View style={[styles.popoverSurface, styles.popoverFallback]}>{children}</View>;
}

function LocateIcon({ color, size }: { color: string; size: number }) {
    return (
        <Svg color={color} fill="none" height={size} viewBox="0 0 24 24" width={size}>
            <Path fillRule="evenodd" clipRule="evenodd" d="M2 12C2 12.3853 2.31236 12.6977 2.69767 12.6977H4.59041C4.92078 16.2509 7.74914 19.0792 11.3023 19.4096V21.3023C11.3023 21.6876 11.6147 22 12 22C12.3853 22 12.6977 21.6876 12.6977 21.3023V19.4096C16.2509 19.0792 19.0792 16.2509 19.4096 12.6977H21.3023C21.6876 12.6977 22 12.3853 22 12C22 11.6147 21.6876 11.3023 21.3023 11.3023H19.4096C19.0792 7.74914 16.2509 4.92078 12.6977 4.59041V2.69767C12.6977 2.31236 12.3853 2 12 2C11.6147 2 11.3023 2.31236 11.3023 2.69767V4.59041C7.74914 4.92078 4.92078 7.74914 4.59041 11.3023H2.69767C2.31236 11.3023 2 11.6147 2 12ZM8.51163 12C8.51163 10.0734 10.0734 8.51163 12 8.51163C13.9266 8.51163 15.4884 10.0734 15.4884 12C15.4884 13.9266 13.9266 15.4884 12 15.4884C10.0734 15.4884 8.51163 13.9266 8.51163 12Z" fill="currentColor"></Path>
        </Svg>
    );
}

function CheckIcon({ color, size }: { color: string; size: number }) {
    return (
        <Svg color={color} fill="none" height={size} viewBox="0 0 24 24" width={size}>
            <Path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
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
    controlsLayer: {
        position: 'absolute',
        right: 16,
        gap: 12,
        alignItems: 'flex-end',
    },
    controlButtonSurface: {
        alignItems: 'center',
        borderRadius: 999,
        borderWidth: 1,
        height: 48,
        justifyContent: 'center',
        overflow: 'hidden',
        width: 48,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    } as ViewStyle,
    controlButtonFallback: {
        backgroundColor: 'rgba(237, 236, 224, 0.96)',
        borderColor: 'rgba(31, 41, 55, 0.14)',
    } as ViewStyle,
    controlButtonGlass: {
        borderColor: 'rgba(255, 255, 255, 0.18)',
    } as ViewStyle,
    controlButtonActive: {
        backgroundColor: theme.colors.orange,
        borderColor: theme.colors.orange,
    } as ViewStyle,
    controlButtonGlassActive: {
        borderColor: 'rgba(249, 115, 22, 0.48)',
    } as ViewStyle,
    controlButtonPressed: {
        opacity: 0.8,
    } as ViewStyle,
    settingsAnchor: {
        alignItems: 'flex-end',
    } as ViewStyle,
    popoverSurface: {
        borderRadius: 12,
        borderWidth: 1,
        marginTop: 8,
        minWidth: 250,
        overflow: 'hidden',
        padding: 4,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
    } as ViewStyle,
    popoverFallback: {
        backgroundColor: 'rgba(237, 236, 224, 0.98)',
        borderColor: 'rgba(31, 41, 55, 0.14)',
    } as ViewStyle,
    popoverGlass: {
        borderColor: 'rgba(255, 255, 255, 0.18)',
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
