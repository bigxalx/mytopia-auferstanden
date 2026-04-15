import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Linking, Pressable, StyleSheet, Text, View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Circle, Marker, type MapPressEvent } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppImage } from '@/src/shared/ui/AppImage';
import { AppButton } from '@/src/shared/ui/AppButton';
import { getForegroundLocationPermissionStatus, requestForegroundLocationPermission } from '@/src/core/location/locationPermissionClient';
import { theme } from '@/src/shared/ui/theme';
import { useSession } from '@/src/core/session/SessionContext';
import { fetchMissions, type MissionListItem } from '@/src/features/tasks/data/missionRepository';
import {
    fetchMapPoints,
    type CheckpointMapPoint,
} from '@/src/features/tasks/data/mapRepository';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { SettingsBold } from '@/components/ui/SolarTabIcons';
import { darkMapStyle } from '@/src/shared/ui/darkMapStyle';
import { openDirections } from '@/src/features/tasks/utils/openDirections';
import {
    CheckIcon,
    hasValidGpsConfig,
    LocateIcon,
    MapControlButton,
    MapPopoverSurface,
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
const DETAIL_CARD_IN_DURATION_MS = 220;
const DETAIL_CARD_OUT_DURATION_MS = 180;

type DisplayMissionMapPoint = {
    description?: string;
    id: string;
    imageUrl?: string;
    isDone: boolean;
    latitude: number;
    longitude: number;
    points: number;
    radiusMeters: number;
    title: string;
    type: 'mission';
};

type DisplayMapPoint = DisplayMissionMapPoint | CheckpointMapPoint;

export default function MapScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { selectedMode, user } = useSession();
    const completedMissions = useCompletedMissions(user?.id);
    const submissionStates = useMissionSubmissionStates(user?.id);
    const mapRef = useRef<MapView | null>(null);
    const isMountedRef = useRef(false);
    const detailCardAnimation = useRef(new Animated.Value(0)).current;
    const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
    const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
    const [isRecentering, setIsRecentering] = useState(false);
    const [showActive, setShowActive] = useState(true);
    const [showDone, setShowDone] = useState(false);
    const [showCheckpoints, setShowCheckpoints] = useState(true);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [missions, setMissions] = useState<MissionListItem[]>([]);
    const [checkpoints, setCheckpoints] = useState<CheckpointMapPoint[]>([]);
    const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
    const [presentedPoint, setPresentedPoint] = useState<DisplayMapPoint | null>(null);

    const loadCurrentLocation = async () => {
        const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });
        const nextCoords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
        };
        if (isMountedRef.current) {
            setUserCoords(nextCoords);
        }
        return nextCoords;
    };

    useEffect(() => {
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        async function loadPermissionStatus() {
            const status = await getForegroundLocationPermissionStatus();
            if (!isMountedRef.current) {
                return;
            }

            setPermissionStatus(status);

            if (status === 'granted') {
                await loadCurrentLocation();
            }
        }

        void loadPermissionStatus();
    }, []);

    useEffect(() => {
        let isActive = true;

        async function load() {
            try {
                const allMissions = await fetchMissions({ mode: selectedMode });
                if (isActive) {
                    setMissions(allMissions.filter(hasValidGpsConfig));
                }
            } catch {
                if (isActive) {
                    setMissions([]);
                }
            }
        }

        load();

        return () => {
            isActive = false;
        };
    }, [selectedMode]);

    useEffect(() => {
        let isActive = true;

        async function load() {
            try {
                const nextPoints = await fetchMapPoints({ mode: selectedMode });
                if (isActive) {
                    setCheckpoints(nextPoints.filter((point): point is CheckpointMapPoint => point.type === 'checkpoint'));
                }
            } catch {
                if (isActive) {
                    setCheckpoints([]);
                }
            }
        }

        load();

        return () => {
            isActive = false;
        };
    }, [selectedMode]);

    const displayMissionPoints: DisplayMissionMapPoint[] = missions.flatMap((mission) => {
        const gpsConfig = mission.gpsConfig;
        if (!gpsConfig) {
            return [];
        }

        const isCompleted = completedMissions.includes(mission._id);
        const submissionState = submissionStates[mission._id];
        const isPending = submissionState?.status === 'pending';

        return [{
            description: mission.description,
            id: mission._id,
            imageUrl: mission.imageUrl,
            isDone: isCompleted || isPending,
            latitude: gpsConfig.latitude,
            longitude: gpsConfig.longitude,
            points: mission.points,
            radiusMeters: gpsConfig.radiusMeters,
            title: mission.title,
            type: 'mission',
        }];
    });

    const displayPoints: DisplayMapPoint[] = [...displayMissionPoints, ...checkpoints];
    const activeMissionCount = displayMissionPoints.filter((point) => !point.isDone).length;
    const doneMissionCount = displayMissionPoints.filter((point) => point.isDone).length;
    const checkpointCount = checkpoints.length;

    const visiblePoints = displayPoints.filter((point) => {
        if (isCheckpointPoint(point)) {
            return showCheckpoints;
        }

        return point.isDone ? showDone : showActive;
    });
    const selectedVisiblePoint = selectedPointId
        ? visiblePoints.find((point) => point.id === selectedPointId) ?? null
        : null;

    useEffect(() => {
        if (selectedPointId && !visiblePoints.some((point) => point.id === selectedPointId)) {
            setSelectedPointId(null);
        }
    }, [selectedPointId, visiblePoints]);

    useEffect(() => {
        let isCancelled = false;

        // Keep the displayed card mounted while its exit animation runs.
        if (selectedVisiblePoint) {
            if (presentedPoint?.id !== selectedVisiblePoint.id) {
                setPresentedPoint(selectedVisiblePoint);
                detailCardAnimation.stopAnimation();
                detailCardAnimation.setValue(0);

                Animated.timing(detailCardAnimation, {
                    duration: DETAIL_CARD_IN_DURATION_MS,
                    easing: Easing.out(Easing.ease),
                    toValue: 1,
                    useNativeDriver: true,
                }).start();
            }

            return () => {
                isCancelled = true;
            };
        }

        if (!presentedPoint) {
            return () => {
                isCancelled = true;
            };
        }

        detailCardAnimation.stopAnimation();
        Animated.timing(detailCardAnimation, {
            duration: DETAIL_CARD_OUT_DURATION_MS,
            easing: Easing.out(Easing.ease),
            toValue: 0,
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished && !isCancelled && isMountedRef.current) {
                setPresentedPoint(null);
            }
        });

        return () => {
            isCancelled = true;
        };
    }, [detailCardAnimation, presentedPoint, selectedVisiblePoint]);

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
            if (isMountedRef.current) {
                setIsRecentering(false);
            }
        }
    };

    const handleMapPress = (event: MapPressEvent) => {
        if (event.nativeEvent.action === 'marker-press') {
            return;
        }

        setSelectedPointId(null);
        setIsSettingsOpen(false);
    };

    const handleOpenDirections = async (point: DisplayMapPoint) => {
        try {
            await openDirections({
                latitude: point.latitude,
                longitude: point.longitude,
            });
        } catch {
            Alert.alert('Fehler', 'Wegbeschreibung konnte nicht geöffnet werden.');
        }
    };

    const handleOpenMission = (missionId: string) => {
        router.push({
            pathname: '/(modals)/tasks/[taskId]',
            params: { taskId: missionId },
        });
    };

    const handleRequestPermission = async () => {
        const status = await requestForegroundLocationPermission();
        if (!isMountedRef.current) {
            return;
        }

        setPermissionStatus(status);
        if (status === 'granted') {
            await loadCurrentLocation();
        }
    };

    if (permissionStatus === 'denied' || permissionStatus === 'undetermined') {
        const isUndetermined = permissionStatus === 'undetermined';

        return (
            <View style={styles.screen}>
                <View style={[styles.permissionContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                    <SectionCard title={isUndetermined ? 'Standortzugriff erlauben' : 'Standortzugriff benötigt'}>
                        <Text style={styles.body}>
                            {isUndetermined
                                ? 'Für Karte und GPS-Missionen benötigen wir Zugriff auf deinen Standort.'
                                : 'Um die Karte und GPS-Missionen nutzen zu können, benötigen wir Zugriff auf deinen Standort.'}
                        </Text>
                        {isUndetermined ? (
                            <Text style={styles.hint}>
                                Der Zugriff wird nur benötigt, um deinen Standort auf der Karte anzuzeigen und GPS-Missionen zu prüfen.
                            </Text>
                        ) : (
                            <Text style={styles.hint}>
                                Du kannst den Zugriff jederzeit in den Systemeinstellungen unter Datenschutz → Ortungsdienste ändern.
                            </Text>
                        )}
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
                    </SectionCard>
                </View>
            </View>
        );
    }

    const controlsTop = 8;
    const detailCardBottom = Math.max(insets.bottom, 12);
    const detailCardTranslateY = detailCardAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [18, 0],
    });

    return (
        <View style={styles.screen}>
            <View style={styles.mapContainer}>
                <MapView
                    customMapStyle={darkMapStyle}
                    initialRegion={region}
                    mapPadding={{ bottom: presentedPoint ? 260 : 0, left: 0, right: 0, top: 0 }}
                    onPress={handleMapPress}
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
                    ref={mapRef}
                    showsMyLocationButton={false}
                    showsUserLocation={permissionStatus === 'granted'}
                    style={styles.map}
                    userInterfaceStyle="dark"
                >
                    {visiblePoints.map((point) => {
                        if (isMissionPoint(point)) {
                            return (
                                <React.Fragment key={point.id}>
                                    <Marker
                                        coordinate={{
                                            latitude: point.latitude,
                                            longitude: point.longitude,
                                        }}
                                        onPress={() => {
                                            setSelectedPointId(point.id);
                                            setIsSettingsOpen(false);
                                        }}
                                        pinColor={point.isDone ? theme.colors.blue : theme.colors.orange}
                                    />
                                    <Circle
                                        center={{
                                            latitude: point.latitude,
                                            longitude: point.longitude,
                                        }}
                                        fillColor={point.isDone ? theme.colors.blueAlpha : theme.colors.orangeAlpha}
                                        radius={point.radiusMeters}
                                        strokeColor={point.isDone ? theme.colors.blue : theme.colors.orange}
                                        strokeWidth={1}
                                    />
                                </React.Fragment>
                            );
                        }

                        return (
                            <Marker
                                coordinate={{
                                    latitude: point.latitude,
                                    longitude: point.longitude,
                                }}
                                key={point.id}
                                onPress={() => {
                                    setSelectedPointId(point.id);
                                    setIsSettingsOpen(false);
                                }}
                                pinColor={theme.colors.accent}
                            />
                        );
                    })}
                </MapView>

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
                            onPress={() => setIsSettingsOpen((value) => !value)}
                        >
                            <SettingsBold color={isSettingsOpen ? '#fff' : theme.colors.cardTextHeading} size={24} />
                        </MapControlButton>

                        {isSettingsOpen && (
                            <MapPopoverSurface>
                                <Pressable
                                    onPress={() => setShowActive((value) => !value)}
                                    style={styles.popoverRow}
                                >
                                    <View style={styles.checkSlot}>
                                        {showActive && <CheckIcon size={14} color={theme.colors.orange} />}
                                    </View>
                                    <View style={[styles.dotIndicator, { backgroundColor: theme.colors.orange }]} />
                                    <Text style={styles.popoverLabel}>
                                        {activeMissionCount === 1 ? 'Aktuelle Mission' : 'Aktuelle Missionen'}
                                    </Text>
                                </Pressable>

                                <View style={styles.popoverSeparator} />

                                <Pressable
                                    onPress={() => setShowDone((value) => !value)}
                                    style={styles.popoverRow}
                                >
                                    <View style={styles.checkSlot}>
                                        {showDone && <CheckIcon size={14} color={theme.colors.blue} />}
                                    </View>
                                    <View style={[styles.dotIndicator, { backgroundColor: theme.colors.blue }]} />
                                    <Text style={styles.popoverLabel}>
                                        {doneMissionCount === 1 ? 'Abgeschlossene Mission' : 'Abgeschlossene Missionen'}
                                    </Text>
                                </Pressable>

                                <View style={styles.popoverSeparator} />

                                <Pressable
                                    onPress={() => setShowCheckpoints((value) => !value)}
                                    style={styles.popoverRow}
                                >
                                    <View style={styles.checkSlot}>
                                        {showCheckpoints && <CheckIcon size={14} color={theme.colors.accent} />}
                                    </View>
                                    <View style={[styles.dotIndicator, { backgroundColor: theme.colors.accent }]} />
                                    <Text style={styles.popoverLabel}>
                                        {checkpointCount === 1 ? 'Mytopia Checkpoint' : 'Mytopia Checkpoints'}
                                    </Text>
                                </Pressable>
                            </MapPopoverSurface>
                        )}
                    </View>
                </View>

                {presentedPoint ? (
                    <View pointerEvents="box-none" style={[styles.detailCardContainer, { bottom: detailCardBottom }]}>
                        <Animated.View
                            style={[
                                styles.detailCard,
                                {
                                    opacity: detailCardAnimation,
                                    transform: [{ translateY: detailCardTranslateY }],
                                },
                            ]}
                        >
                            <Pressable
                                accessibilityLabel="Details schließen"
                                hitSlop={8}
                                onPress={() => setSelectedPointId(null)}
                                style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
                            >
                                <MaterialIcons color={theme.colors.cardTextPrimary} name="close" size={20} />
                            </Pressable>

                            {isMissionPoint(presentedPoint) ? (
                                <Pressable
                                    onPress={() => handleOpenMission(presentedPoint.id)}
                                    style={({ pressed }) => [styles.detailCardPressable, pressed && styles.detailCardBodyPressed]}
                                >
                                    {presentedPoint.imageUrl ? (
                                        <AppImage
                                            contentFit="cover"
                                            style={styles.detailImage}
                                            uri={presentedPoint.imageUrl}
                                        />
                                    ) : null}

                                    <View style={styles.detailBody}>
                                        <Text style={styles.detailEyebrow}>
                                            {presentedPoint.isDone ? 'Erledigte Mission' : 'Aktive Mission'}
                                        </Text>
                                        <Text style={styles.detailTitle}>{presentedPoint.title}</Text>
                                        {presentedPoint.description ? (
                                            <Text numberOfLines={4} style={styles.detailDescription}>
                                                {presentedPoint.description}
                                            </Text>
                                        ) : null}
                                        <Text style={styles.detailMeta}>{presentedPoint.points} Punkte</Text>
                                    </View>
                                </Pressable>
                            ) : (
                                <View style={styles.detailCardStatic}>
                                    {presentedPoint.imageUrl ? (
                                        <AppImage
                                            contentFit="cover"
                                            style={styles.detailImage}
                                            uri={presentedPoint.imageUrl}
                                        />
                                    ) : null}

                                    <View style={styles.detailBody}>
                                        <Text style={styles.detailEyebrow}>Checkpoint</Text>
                                        <Text style={styles.detailTitle}>{presentedPoint.title}</Text>
                                        {presentedPoint.description ? (
                                            <Text numberOfLines={4} style={styles.detailDescription}>
                                                {presentedPoint.description}
                                            </Text>
                                        ) : null}
                                    </View>
                                </View>
                            )}

                            <AppButton
                                fullWidth
                                label="Wegbeschreibung"
                                onPress={() => {
                                    void handleOpenDirections(presentedPoint);
                                }}
                                style={styles.directionsButton}
                                variant="primary"
                            />
                        </Animated.View>
                    </View>
                ) : null}
            </View>
        </View>
    );
}

function isMissionPoint(point: DisplayMapPoint): point is DisplayMissionMapPoint {
    return point.type === 'mission';
}

function isCheckpointPoint(point: DisplayMapPoint): point is CheckpointMapPoint {
    return point.type === 'checkpoint';
}

const styles = StyleSheet.create({
    body: {
        color: theme.colors.cardTextSecondary,
        fontSize: 14,
        lineHeight: 20,
    },
    detailBody: {
        gap: 6,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 12,
    } as ViewStyle,
    detailCard: {
        backgroundColor: 'rgba(237, 236, 224, 0.98)',
        borderColor: 'rgba(31, 41, 55, 0.18)',
        borderRadius: 18,
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        elevation: 12,
    } as ViewStyle,
    detailCardBodyPressed: {
        opacity: 0.86,
    } as ViewStyle,
    detailCardContainer: {
        left: 16,
        position: 'absolute',
        right: 16,
    } as ViewStyle,
    detailCardPressable: {
        backgroundColor: 'transparent',
    } as ViewStyle,
    detailCardStatic: {
        backgroundColor: 'transparent',
    } as ViewStyle,
    closeButton: {
        alignItems: 'center',
        backgroundColor: 'rgba(237, 236, 224, 0.92)',
        borderRadius: 999,
        height: 32,
        justifyContent: 'center',
        position: 'absolute',
        right: 12,
        top: 12,
        width: 32,
        zIndex: 2,
    } as ViewStyle,
    closeButtonPressed: {
        opacity: 0.82,
    } as ViewStyle,
    detailDescription: {
        color: theme.colors.cardTextSecondary,
        fontFamily: 'NunitoSans_400Regular',
        fontSize: 14,
        lineHeight: 20,
    } as TextStyle,
    detailEyebrow: {
        color: theme.colors.cardTextMuted,
        fontFamily: 'NunitoSans_700Bold',
        fontSize: 12,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    } as TextStyle,
    detailImage: {
        height: 164,
        width: '100%',
    } as ImageStyle,
    detailMeta: {
        color: theme.colors.cardTextMuted,
        fontFamily: 'NunitoSans_700Bold',
        fontSize: 13,
    } as TextStyle,
    detailTitle: {
        color: theme.colors.cardTextPrimary,
        fontFamily: 'Nunito_700Bold',
        fontSize: 20,
        lineHeight: 24,
    } as TextStyle,
    directionsButton: {
        margin: 16,
        marginTop: 4,
    } as ViewStyle,
    hint: {
        color: theme.colors.cardTextSecondary,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 8,
    },
    map: {
        flex: 1,
    },
    permissionContent: {
        flex: 1,
        padding: 20,
    } as ViewStyle,
    mapContainer: {
        backgroundColor: theme.colors.background,
        flex: 1,
        position: 'relative',
    },
    screen: {
        backgroundColor: theme.colors.background,
        flex: 1,
    } as ViewStyle,
    controlsLayer: {
        alignItems: 'flex-end',
        gap: 12,
        position: 'absolute',
        right: 16,
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
        flexShrink: 0,
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 12,
    },
    popoverSeparator: {
        backgroundColor: 'rgba(31, 41, 55, 0.12)',
        height: 1,
        marginHorizontal: 8,
    },
    checkSlot: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
    },
    dotIndicator: {
        borderRadius: 5,
        height: 10,
        marginLeft: 8,
        width: 10,
    },
    settingsButton: {
        marginTop: 16,
    } as ViewStyle,
});
