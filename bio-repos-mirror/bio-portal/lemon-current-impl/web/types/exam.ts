// ── Exam Types ──

export type QuestionType = 'MCQ' | 'MULTI_SELECT' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'NUMERIC';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type AttemptStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'EXPIRED';
export type MediaType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DIAGRAM';

export interface Exam {
    id: string;
    title: string;
    description?: string;
    classBands: number[];
    totalMarks: number;
    durationMinutes: number;
    isPublished: boolean;
    easyPct: number;
    mediumPct: number;
    hardPct: number;
    sections: ExamSection[];
    instances?: ExamInstance[];
    createdAt: string;
}

export interface ExamSection {
    id: string;
    title: string;
    sortOrder: number;
    questionsToAssign: number; // 0 = assign all from pool; N = pick N per student
    questions: Question[];
}

export interface QuestionOption {
    id: string;
    text: string;
    isCorrect?: boolean; // Only visible in admin
}

export interface Question {
    id: string;
    type: QuestionType;
    difficulty: Difficulty;
    text: string;
    options?: QuestionOption[];
    marks: number;
    negativeMarks: number;
    timeLimitSecs?: number;
    mediaUrl?: string;
    mediaType?: MediaType;
    tags: string[];
    explanation?: string;
}

export interface ExamInstance {
    id: string;
    examId: string;
    exam: Exam;
    startsAt: string;
    endsAt: string;
    requireSeb: boolean;
}

export interface Attempt {
    id: string;
    userId: string;
    examInstanceId: string;
    status: AttemptStatus;
    startedAt?: string;
    submittedAt?: string;
    totalScore?: number;
    maxScore?: number;
    riskScore?: number;
    items: AttemptItem[];
}

export interface AttemptItem {
    id: string;
    questionId: string;
    sortOrder: number;
    answer: any;
    isCorrect?: boolean;
    score?: number;
    answeredAt?: string;
}

export interface ExamSession {
    attempt: Attempt;
    exam: Exam;
    questions: Question[];
    currentIndex: number;
    answers: Record<string, any>;
    flagged: Set<string>;
}
