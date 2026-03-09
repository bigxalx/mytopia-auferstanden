import { StyleSheet, Text, View } from 'react-native';

import { SectionCard } from '@/src/shared/ui/SectionCard';

type QuizResultCardProps = {
    correct: number;
    earned: number;
    total: number;
};

export function QuizResultCard({ correct, earned, total }: QuizResultCardProps) {
    const allCorrect = correct === total;

    return (
        <SectionCard title="Quiz abgeschlossen">
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
        </SectionCard>
    );
}

const styles = StyleSheet.create({
    breakdown: {
        color: '#5d6979',
        fontSize: 14,
        textAlign: 'center',
    },
    scoreCircle: {
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: '#f97316',
        borderRadius: 50,
        height: 100,
        justifyContent: 'center',
        width: 100,
    },
    scoreLabel: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
        opacity: 0.8,
    },
    scoreNumber: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '800',
    },
    successText: {
        color: '#15803d',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
});
