'use client';

import api from '@/lib/api';
import { useExamStore } from '@/store/examStore';
import type { Attempt, Exam, Question } from '@/types/exam';
import { useCallback } from 'react';

export function useExamSession(instanceId: string) {
    const store = useExamStore();

    const startExam = useCallback(async () => {
        // Find instance id first, because we only have exam id from route
        // Assuming the route is /exams/[id] where id is the examId, not instanceId
        const { data: examData } = await api.get<Exam>(`/exams/${instanceId}`);
        const activeInstance = examData.instances?.[0]; // Get the first active instance
        
        if (!activeInstance) {
            throw new Error('No active instance found for this exam');
        }

        // Start attempt on server using the instance ID
        const { data: attempt } = await api.post<Attempt>(`/exams/${activeInstance.id}/start`);

        // Load full exam data including questions
        const { data: exam } = await api.get<Exam>(`/exams/${examData.id}`);

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
