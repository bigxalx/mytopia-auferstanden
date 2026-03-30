import React from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import Svg, { Path } from 'react-native-svg';
import { theme } from '@/src/shared/ui/theme';
import { type MissionListItem } from '@/src/features/tasks/data/missionRepository';

export const GLASS_EFFECT_ENABLED =
    Platform.OS === 'ios' &&
    isGlassEffectAPIAvailable() &&
    isLiquidGlassAvailable();

/** Returns true only when the gpsConfig has valid numeric lat/lng values. */
export function hasValidGpsConfig(m: MissionListItem): m is MissionListItem & {
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

export function MapControlButton({
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

export function MapPopoverSurface({ children }: { children: React.ReactNode }) {
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

export function LocateIcon({ color, size }: { color: string; size: number }) {
    return (
        <Svg color={color} fill="none" height={size} viewBox="0 0 24 24" width={size}>
            <Path fillRule="evenodd" clipRule="evenodd" d="M2 12C2 12.3853 2.31236 12.6977 2.69767 12.6977H4.59041C4.92078 16.2509 7.74914 19.0792 11.3023 19.4096V21.3023C11.3023 21.6876 11.6147 22 12 22C12.3853 22 12.6977 21.6876 12.6977 21.3023V19.4096C16.2509 19.0792 19.0792 16.2509 19.4096 12.6977H21.3023C21.6876 12.6977 22 12.3853 22 12C22 11.6147 21.6876 11.3023 21.3023 11.3023H19.4096C19.0792 7.74914 16.2509 4.92078 12.6977 4.59041V2.69767C12.6977 2.31236 12.3853 2 12 2C11.6147 2 11.3023 2.31236 11.3023 2.69767V4.59041C7.74914 4.92078 4.92078 7.74914 4.59041 11.3023H2.69767C2.31236 11.3023 2 11.6147 2 12ZM8.51163 12C8.51163 10.0734 10.0734 8.51163 12 8.51163C13.9266 8.51163 15.4884 10.0734 15.4884 12C15.4884 13.9266 13.9266 15.4884 12 15.4884C10.0734 15.4884 8.51163 13.9266 8.51163 12Z" fill="currentColor"></Path>
        </Svg>
    );
}

export function CheckIcon({ color, size }: { color: string; size: number }) {
    return (
        <Svg color={color} fill="none" height={size} viewBox="0 0 24 24" width={size}>
            <Path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

const styles = StyleSheet.create({
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
});
