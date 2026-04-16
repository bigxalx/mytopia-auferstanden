import type {
    CustomAchievementSummary,
    RewardBreakdown,
    StreakSummary,
    TimeBonus,
} from './missionRepository';

export function formatMinutesLimit(minutesLimit: number) {
    const safeValue = Math.max(0, Math.round(minutesLimit));
    const minutes = Math.floor(safeValue / 60);
    const seconds = safeValue % 60;

    if (minutes <= 0) {
        return `${seconds} Sek.`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')} Min.`;
}

export function formatTimeBonusText(timeBonus: TimeBonus) {
    return `Unter ${formatMinutesLimit(timeBonus.minutesLimit)}: +${timeBonus.bonusPoints} Zeit-Bonus`;
}

export function formatCustomAchievementText(achievement: CustomAchievementSummary) {
    return achievement.bonusPoints > 0
        ? `${achievement.title}: +${achievement.bonusPoints} Bonus`
        : achievement.title;
}

export function formatStreakSummaryText(streakSummary?: StreakSummary) {
    if (!streakSummary || streakSummary.count <= 0) {
        return null;
    }

    if (streakSummary.isActive && streakSummary.multiplier > 1) {
        return `Streak aktiv: ${streakSummary.count} Missionen in Folge, x${streakSummary.multiplier}`;
    }

    return `Streak: ${streakSummary.count} Missionen in Folge`;
}

export function getRewardBreakdownRows(
    rewardBreakdown?: RewardBreakdown,
    streakSummary?: StreakSummary,
): string[] {
    const rows: string[] = [];

    const streakText = formatStreakSummaryText(streakSummary);
    if (streakText) {
        rows.push(streakText);
    }

    if (!rewardBreakdown) {
        return rows;
    }

    if (rewardBreakdown.streakBonusPoints > 0) {
        rows.push(`Streak-Bonus: +${rewardBreakdown.streakBonusPoints}`);
    }

    if (rewardBreakdown.timeBonus) {
        rows.push(formatTimeBonusText(rewardBreakdown.timeBonus));
    }

    if (Array.isArray(rewardBreakdown.customAchievements)) {
        rows.push(
            ...rewardBreakdown.customAchievements.map((achievement) => formatCustomAchievementText(achievement))
        );
    }

    if (rewardBreakdown.groupBonus) {
        rows.push(`Sammelaufgabe "${rewardBreakdown.groupBonus.groupTitle}": +${rewardBreakdown.groupBonus.bonusPoints}`);
    }

    return rows;
}
