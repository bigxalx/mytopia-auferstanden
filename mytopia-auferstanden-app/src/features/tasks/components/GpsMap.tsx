import { StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

import { theme } from '@/src/shared/ui/theme';

type GpsMapProps = {
    /** User's current latitude (null while loading). */
    userLatitude?: number | null;
    /** User's current longitude (null while loading). */
    userLongitude?: number | null;
    /** Target latitude the user needs to reach. */
    targetLatitude: number;
    /** Target longitude the user needs to reach. */
    targetLongitude: number;
    /** Radius in meters around the target that counts as "in range". */
    radiusMeters: number;
};

/**
 * Minimal map showing the GPS task goal location with a radius circle.
 *
 * - On iOS this renders Apple Maps (no API key needed).
 * - On Android this renders Google Maps (requires an API key in app.json).
 */
export function GpsMap({
    userLatitude,
    userLongitude,
    targetLatitude,
    targetLongitude,
    radiusMeters,
}: GpsMapProps) {
    const targetCoord = { latitude: targetLatitude, longitude: targetLongitude };

    // Dynamically compute the map region to show both user and target,
    // or just the target if user location is unavailable.
    const region = computeRegion(
        targetLatitude,
        targetLongitude,
        radiusMeters,
        userLatitude ?? null,
        userLongitude ?? null
    );

    return (
        <View style={styles.container}>
            <MapView
                initialRegion={region}
                region={region}
                scrollEnabled={false}
                style={styles.map}
                zoomEnabled={false}
            >
                {/* Target marker */}
                <Marker
                    coordinate={targetCoord}
                    pinColor={theme.colors.orange}
                    title="Ziel"
                />

                {/* Radius circle */}
                <Circle
                    center={targetCoord}
                    fillColor={theme.colors.orangeSoft}
                    radius={radiusMeters}
                    strokeColor={theme.colors.orangeStroke}
                    strokeWidth={1.5}
                />
            </MapView>
        </View>
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeRegion(
    targetLat: number,
    targetLng: number,
    radiusMeters: number,
    userLat: number | null,
    userLng: number | null
) {
    // Minimum delta so the radius circle is clearly visible.
    const minDelta = Math.max((radiusMeters / 111_320) * 3, 0.003);

    if (userLat !== null && userLng !== null) {
        const latDelta = Math.abs(userLat - targetLat) * 2.5;
        const lngDelta = Math.abs(userLng - targetLng) * 2.5;

        return {
            latitude: (userLat + targetLat) / 2,
            latitudeDelta: Math.max(latDelta, minDelta),
            longitude: (userLng + targetLng) / 2,
            longitudeDelta: Math.max(lngDelta, minDelta),
        };
    }

    return {
        latitude: targetLat,
        latitudeDelta: minDelta,
        longitude: targetLng,
        longitudeDelta: minDelta,
    };
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 12,
        overflow: 'hidden',
    },
    map: {
        height: 200,
        width: '100%',
    },
});
