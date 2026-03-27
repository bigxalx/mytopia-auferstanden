import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SectionCard as UISectionCard } from '@/src/shared/ui/SectionCard';
import { theme } from '@/src/shared/ui/theme';

export function MissionsCard({
    completedCount,
    onPress,
}: {
    completedCount: number;
    onPress: () => void;
}) {
    return (
        <UISectionCard
            description="Entdecke neue Missionen und sammle Punkte für dein Team."
            title="Deine Missionen"
        >
            <View style={styles.statsRow}>
                <View style={styles.stat}>
                    <Text style={styles.statValue}>{completedCount}</Text>
                    <Text style={styles.statLabel}>Erledigt</Text>
                </View>
                <View style={styles.stat}>
                    <Text style={styles.statValue}>🚀</Text>
                    <Text style={styles.statLabel}>Bereit</Text>
                </View>
            </View>
            <Pressable
                accessibilityLabel="Alle Missionen anzeigen"
                accessibilityRole="button"
                onPress={onPress}
                style={styles.button}
            >
                <Text style={styles.buttonText}>Alle Missionen anzeigen</Text>
            </Pressable>
        </UISectionCard>
    );
}

const styles = StyleSheet.create({
    statsRow: {
        flexDirection: 'row',
        gap: 24,
        marginBottom: 16,
    } as ViewStyle,
    stat: {
        alignItems: 'center',
    } as ViewStyle,
    statValue: {
        color: theme.colors.cardTextPrimary,
        fontSize: 22,
        fontWeight: '800',
    },
    statLabel: {
        color: theme.colors.cardTextSecondary,
        fontSize: 12,
        fontWeight: '600',
    },
    button: {
        alignItems: 'center',
        backgroundColor: theme.colors.orange,
        borderRadius: 10,
        paddingVertical: 12,
    } as ViewStyle,
    buttonText: theme.typography.button,
});
