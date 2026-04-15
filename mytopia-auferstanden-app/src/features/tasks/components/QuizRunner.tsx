import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/shared/ui/AppButton';
import { theme } from '@/src/shared/ui/theme';
import { QuizResultCard } from './QuizResultCard';

type QuizQuestion = {
    options: (string | { text: string; isCorrect: boolean })[];
    questionText: string;
};

type QuizRunnerProps = {
    embedded?: boolean;
    missionId: string;
    missionTitle: string;
    onComplete: (answers: number[]) => Promise<{ correct: number; earned: number; total: number }>;
    questions: QuizQuestion[];
};

export function QuizRunner({ embedded = false, missionId: _missionId, missionTitle: _missionTitle, onComplete, questions }: QuizRunnerProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
    const [result, setResult] = useState<{ correct: number; earned: number; total: number } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (result) {
        return <QuizResultCard correct={result.correct} earned={result.earned} total={result.total} embedded={embedded} />;
    }

    const question = questions[currentIndex];
    const isLastQuestion = currentIndex === questions.length - 1;
    const hasSelected = selectedAnswers.length > currentIndex;

    function handleSelectOption(optionIndex: number) {
        if (isSubmitting) return;

        const updated = [...selectedAnswers];
        updated[currentIndex] = optionIndex;
        setSelectedAnswers(updated);
    }

    function handleNext() {
        if (!hasSelected) return;
        setCurrentIndex(currentIndex + 1);
    }

    async function handleSubmit() {
        if (!hasSelected || isSubmitting) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const submitResult = await onComplete(selectedAnswers);
            setResult(submitResult);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Submission failed.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <View style={styles.container}>
            <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${((currentIndex + 1) / questions.length) * 100}%` }]} />
            </View>
            <Text style={styles.progressLabel}>
                Frage {currentIndex + 1} von {questions.length}
            </Text>

            <Text style={styles.questionText}>{question.questionText}</Text>

            <View style={styles.optionsContainer}>
                {question.options.map((option, index) => {
                    const isSelected = selectedAnswers[currentIndex] === index;
                    return (
                        <Pressable
                            key={index}
                            onPress={() => handleSelectOption(index)}
                            style={[styles.optionButton, isSelected ? styles.optionButtonSelected : null]}
                        >
                            <Text style={[styles.optionText, isSelected ? styles.optionTextSelected : null]}>
                                {typeof option === 'string' ? option : option.text}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.footer}>
                {isLastQuestion ? (
                    <AppButton
                        disabled={!hasSelected || isSubmitting}
                        fullWidth
                        label={isSubmitting ? 'Wird ausgewertet…' : 'Auswerten'}
                        loading={isSubmitting}
                        onPress={() => {
                            void handleSubmit();
                        }}
                        variant="primary"
                    />
                ) : (
                    <AppButton
                        disabled={!hasSelected}
                        fullWidth
                        label="Weiter"
                        onPress={handleNext}
                        variant="secondary"
                    />
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: 16,
    },
    errorText: {
        color: theme.colors.errorText,
        fontSize: 13,
        fontWeight: '500',
    },
    footer: {
        gap: 10,
        marginTop: 8,
    },
    optionButton: {
        backgroundColor: theme.colors.cardSubtleBackground,
        borderColor: theme.colors.cardBorder,
        borderRadius: 10,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    optionButtonSelected: {
        backgroundColor: theme.colors.orange,
        borderColor: theme.colors.orange,
    },
    optionText: {
        color: theme.colors.cardTextPrimary,
        fontSize: 15,
    },
    optionTextSelected: {
        color: theme.colors.cardTextPrimary,
        fontWeight: '600',
    },
    optionsContainer: {
        gap: 10,
    },
    progressBar: {
        backgroundColor: theme.colors.cardBorder,
        borderRadius: 4,
        height: 6,
        overflow: 'hidden',
    },
    progressFill: {
        backgroundColor: theme.colors.orange,
        borderRadius: 4,
        height: '100%',
    },
    progressLabel: {
        color: theme.colors.cardTextPrimary,
        fontSize: 12,
        textAlign: 'center',
    },
    questionText: {
        color: theme.colors.cardTextPrimary,
        fontSize: 17,
        fontWeight: '600',
        lineHeight: 24,
    },
});
