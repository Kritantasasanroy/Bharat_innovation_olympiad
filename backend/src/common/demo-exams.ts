/**
 * Exams that run in "demo mode": a student may attempt them an unlimited
 * number of times and they are never marked as completed. Every other exam
 * keeps the standard one-attempt-per-instance behaviour.
 */
export const DEMO_EXAM_IDS = new Set<string>([
    '0b95a4e0-66a6-4104-aa44-0c1c314f2fab', // Bio test 1, 22nd may
]);

export function isDemoExam(examId: string): boolean {
    return DEMO_EXAM_IDS.has(examId);
}
