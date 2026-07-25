'use client';

import api from '@/lib/api';
import { useExamStore } from '@/store/examStore';
import type { Attempt, Exam, Question } from '@/types/exam';
import { useCallback } from 'react';

export function useExamSession(instanceId: string) {
    const store = useExamStore();

    const startExam = useCallback(async () => {
        store.setError(null);
        try {
            // Get exam metadata + the active instance ID in one call
            const { data: examData } = await api.get<Exam>(`/exams/${instanceId}`);
            const activeInstance = examData.instances?.[0];

            if (!activeInstance) {
                throw new Error('No active instance found for this exam');
            }

            // Start/resume attempt — server now returns { attempt, questions }
            // where questions are the student's seeded, difficulty-selected subset
            const { data: result } = await api.post<{ attempt: Attempt; questions: Question[] }>(
                `/exams/${activeInstance.id}/start`,
            );

            store.setExamSession(examData, result.attempt, result.questions);
            return result.attempt;
        } catch (err: any) {
            console.error('Failed to start exam:', err);
            store.setError(err.response?.data?.message || err.message || 'Failed to load exam');
            throw err;
        }
    }, [instanceId]);

    const saveAnswer = useCallback(
        async (questionId: string, answer: any) => {
            store.saveAnswer(questionId, answer);

            if (store.attempt) {
                await api.post(`/attempts/${store.attempt.id}/answer`, {
                    questionId,
                    answer,
                });
            }
        },
        [store.attempt]
    );

    const submitExam = useCallback(async () => {
        if (!store.attempt) return;

        const { data } = await api.post(`/attempts/${store.attempt.id}/submit`);
        return data;
    }, [store.attempt]);

    const goToQuestion = useCallback(
        (index: number) => {
            if (index >= 0 && index < store.questions.length) {
                store.setCurrentIndex(index);
            }
        },
        [store.questions.length]
    );

    const nextQuestion = useCallback(() => {
        goToQuestion(store.currentIndex + 1);
    }, [store.currentIndex, goToQuestion]);

    const prevQuestion = useCallback(() => {
        goToQuestion(store.currentIndex - 1);
    }, [store.currentIndex, goToQuestion]);

    return {
        exam: store.exam,
        attempt: store.attempt,
        questions: store.questions,
        currentIndex: store.currentIndex,
        currentQuestion: store.questions[store.currentIndex] || null,
        answers: store.answers,
        flagged: store.flagged,
        error: store.error,
        xpEarned: store.xpEarned,
        streak: store.streak,
        startExam,
        saveAnswer,
        submitExam,
        goToQuestion,
        nextQuestion,
        prevQuestion,
        toggleFlag: store.toggleFlag,
    };
}
