import { StyleSheet, Text, View } from 'react-native';

import { useUserRewardHistory } from '@/src/features/tasks/data/useUserRewards';
import { getRewardBreakdownRows } from '@/src/features/tasks/data/rewardFormatting';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { theme } from '@/src/shared/ui/theme';

export function RewardsHistoryCard({
    refreshTrigger,
    userId,
}: {
    refreshTrigger?: number;
    userId: string;
}) {
    const history = useUserRewardHistory(userId, refreshTrigger);

    return (
        <SectionCard title="Belohnungen">
            {history.length === 0 ? (
                <Text style={styles.empty}>Noch keine bestätigten Belohnungen.</Text>
            ) : (
                <View style={styles.list}>
                    {history.map((item) => {
                        const breakdownRows = getRewardBreakdownRows(item.rewardBreakdown, item.streakSummary);

                        return (
                            <View key={item.id} style={styles.item}>
                                <View style={styles.itemHeader}>
                                    <Text style={styles.title}>{item.missionTitle}</Text>
                                    <Text style={styles.points}>+{item.rewardBreakdown?.totalPoints ?? item.delta}</Text>
                                </View>
                                <Text style={styles.meta}>{new Date(item.createdAtMs).toLocaleString('de-DE')}</Text>
                                {breakdownRows.map((row) => (
                                    <Text key={row} style={styles.detail}>
                                        {row}
                                    </Text>
                                ))}
                            </View>
                        );
                    })}
                </View>
            )}
        </SectionCard>
    );
}

const styles = StyleSheet.create({
    detail: {
        color: theme.colors.cardTextSecondary,
        fontSize: 12,
        lineHeight: 18,
    },
    empty: {
        color: theme.colors.cardTextSecondary,
        fontSize: 14,
    },
    item: {
        borderTopColor: theme.colors.cardBorder,
        borderTopWidth: 1,
        gap: 4,
        paddingTop: 12,
    },
    itemHeader: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'space-between',
    },
    list: {
        gap: 12,
    },
    meta: {
        color: theme.colors.cardTextMuted,
        fontSize: 11,
    },
    points: {
        color: theme.colors.orange,
        fontSize: 16,
        fontWeight: '800',
    },
    title: {
        color: theme.colors.cardTextPrimary,
        flex: 1,
        fontSize: 14,
        fontWeight: '700',
    },
});
