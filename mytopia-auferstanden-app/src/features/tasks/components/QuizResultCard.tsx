import { StyleSheet, Text, View } from 'react-native';

import { SectionCard } from '@/src/shared/ui/SectionCard';
import { theme } from '@/src/shared/ui/theme';

type QuizResultCardProps = {
    correct: number;
    embedded?: boolean;
    earned: number;
    total: number;
};

export function QuizResultCard({ correct, earned, total, embedded = false }: QuizResultCardProps) {
    const allCorrect = correct === total;
    const content = (
        <View style={embedded ? styles.embeddedContainer : undefined}>
            <View style={styles.scoreCircle}>
                <Text style={styles.scoreNumber}>{earned}</Text>
                <Text style={styles.scoreLabel}>Punkte</Text>
            </View>

            <Text style={styles.breakdown}>
                {correct} von {total} richtig beantwortet
            </Text>

            {allCorrect ? (
                <Text style={styles.successText}>🎉 Perfekt! Alle Fragen richtig.</Text>
            ) : null}
        </View>
    );

    if (embedded) {
        return content;
    }

    return <SectionCard title="Quiz abgeschlossen">{content}</SectionCard>;
}

const styles = StyleSheet.create({
    breakdown: {
        color: theme.colors.cardTextPrimary,
        fontSize: 14,
        textAlign: 'center',
    },
    embeddedContainer: {
        gap: 12,
    },
    scoreCircle: {
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: theme.colors.orange,
        borderRadius: 50,
        height: 100,
        justifyContent: 'center',
        width: 100,
    },
    scoreLabel: {
        color: theme.colors.cardTextPrimary,
        fontSize: 12,
        fontWeight: '600',
        opacity: 0.8,
    },
    scoreNumber: {
        color: theme.colors.cardTextPrimary,
        fontSize: 28,
        fontWeight: '800',
    },
    successText: {
        color: theme.colors.cardTextPrimary,
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
});
