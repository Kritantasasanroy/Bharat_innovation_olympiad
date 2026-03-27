import { Attempt, Exam, Question } from '@/types/exam';
import { create } from 'zustand';

interface ExamState {
    // Current exam session
    exam: Exam | null;
    attempt: Attempt | null;
    questions: Question[];
    currentIndex: number;
    answers: Record<string, any>;
    flagged: Set<string>;

    // Timer
    remaining: number; // seconds remaining
    questionRemaining: number | null;
    isExpired: boolean;

    // Gamification
    xpEarned: number;
    streak: number;

    // Actions
    setExamSession: (exam: Exam, attempt: Attempt, questions: Question[]) => void;
    setCurrentIndex: (index: number) => void;
    saveAnswer: (questionId: string, answer: any) => void;
    toggleFlag: (questionId: string) => void;
    setRemaining: (secs: number) => void;
    setQuestionRemaining: (secs: number | null) => void;
    setExpired: (expired: boolean) => void;
    addXp: (points: number) => void;
    incrementStreak: () => void;
    resetStreak: () => void;
    resetExam: () => void;
}

export const useExamStore = create<ExamState>((set) => ({
    exam: null,
    attempt: null,
    questions: [],
    currentIndex: 0,
    answers: {},
    flagged: new Set(),
    remaining: 0,
    questionRemaining: null,
    isExpired: false,
    xpEarned: 0,
    streak: 0,

    setExamSession: (exam, attempt, questions) =>
        set({ exam, attempt, questions, currentIndex: 0, answers: {}, flagged: new Set() }),

    setCurrentIndex: (index) => set({ currentIndex: index }),

    saveAnswer: (questionId, answer) =>
        set((state) => ({
            answers: { ...state.answers, [questionId]: answer },
        })),

    toggleFlag: (questionId) =>
        set((state) => {
            const flagged = new Set(state.flagged);
            if (flagged.has(questionId)) {
                flagged.delete(questionId);
            } else {
                flagged.add(questionId);
            }
            return { flagged };
        }),

    setRemaining: (secs) => set({ remaining: secs }),
    setQuestionRemaining: (secs) => set({ questionRemaining: secs }),
    setExpired: (expired) => set({ isExpired: expired }),
    addXp: (points) => set((s) => ({ xpEarned: s.xpEarned + points })),
    incrementStreak: () => set((s) => ({ streak: s.streak + 1 })),
    resetStreak: () => set({ streak: 0 }),
    resetExam: () =>
        set({
            exam: null,
            attempt: null,
            questions: [],
            currentIndex: 0,
            answers: {},
            flagged: new Set(),
            remaining: 0,
            questionRemaining: null,
            isExpired: false,
            xpEarned: 0,
            streak: 0,
        }),
}));
