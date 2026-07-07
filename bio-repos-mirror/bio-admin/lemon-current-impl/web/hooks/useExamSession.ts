'use client';

import api from '@/lib/api';
import { useExamStore } from '@/store/examStore';
import type { Attempt, Exam, Question } from '@/types/exam';
import { useCallback } from 'react';

export function useExamSession(instanceId: string) {
    const store = useExamStore();

    const startExam = useCallback(async () => {
        // Start attempt on server
        const { data: attempt } = await api.post<Attempt>(`/exams/${instanceId}/start`);

        // Load exam data
        const { data: exam } = await api.get<Exam>(`/exams/${attempt.examInstanceId}`);

        // Flatten questions from sections
        const questions: Question[] = exam.sections
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .flatMap((s) => s.questions);

        store.setExamSession(exam, attempt, questions);
        return attempt;
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
