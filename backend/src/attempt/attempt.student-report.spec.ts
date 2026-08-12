import { NotFoundException } from '@nestjs/common';
import { AttemptStatus } from '@prisma/client';
import { AttemptService } from './attempt.service';
import { whatsAppStub } from '../notification/whatsapp.stub';

/**
 * The student's own attempt report, and the answer key it does or does not carry.
 *
 * This is a leak test more than a feature test. "Answer key in report after the
 * season ends" is only true if the key is genuinely absent beforehand — not merely
 * hidden by the client. Every assertion below therefore checks the *payload*, not
 * the rendering.
 */
describe('AttemptService.getStudentReport', () => {
    const USER = 'student-1';
    const ATTEMPT = 'attempt-1';

    const question = {
        id: 'q-1',
        text: 'Which is a renewable resource?',
        options: [{ id: 'a', text: 'Coal' }, { id: 'b', text: 'Solar' }],
        correctAnswer: 'b',
        explanation: 'Solar energy is replenished continuously; coal is finite.',
        marks: 1,
        sectionName: 'Future Readiness',
        topic: 'Sustainability',
    };

    function serviceFor(
        instance: Partial<Record<string, any>>,
        status: AttemptStatus = AttemptStatus.SUBMITTED,
    ) {
        const prisma: any = {
            attempt: {
                findFirst: jest.fn().mockResolvedValue({
                    id: ATTEMPT,
                    userId: USER,
                    status,
                    submittedAt: new Date('2026-07-01T10:00:00Z'),
                    totalScore: 7,
                    maxScore: 10,
                    normalizedScore: 72.5,
                    rank: 12,
                    percentile: 88.4,
                    examInstance: {
                        finalResultsReleasedAt: null,
                        answerKeyReleasedAt: null,
                        exam: { title: 'Grade 8 Olympiad', totalMarks: 10 },
                        ...instance,
                    },
                    items: [
                        {
                            questionId: 'q-1',
                            sortOrder: 0,
                            answer: 'a',
                            isCorrect: false,
                            score: 0,
                            question,
                        },
                    ],
                }),
            },
        };
        return new AttemptService(prisma, null as any, null as any, null as any, whatsAppStub());
    }

    /** Everything the client receives, flattened, so a leak anywhere is caught. */
    const serialised = (report: unknown) => JSON.stringify(report);

    describe('before the final report is published', () => {
        it('reports the score as provisional', async () => {
            const report: any = await serviceFor({}).getStudentReport(USER, ATTEMPT);
            expect(report.stage).toBe('PROVISIONAL');
            expect(report.isProvisional).toBe(true);
            expect(report.score).toBe(7);
            expect(report.provisionalNote).toMatch(/unverified/i);
        });

        it('withholds rank and percentile — they can still move', async () => {
            const report: any = await serviceFor({}).getStudentReport(USER, ATTEMPT);
            expect(report.rank).toBeUndefined();
            expect(report.percentile).toBeUndefined();
        });

        it('leaks neither the correct answer nor the explanation', async () => {
            const report = await serviceFor({}).getStudentReport(USER, ATTEMPT);
            const body = serialised(report);
            expect(body).not.toContain('Solar energy is replenished');
            expect((report as any).questions).toEqual([]);
            expect((report as any).answerKeyAvailable).toBe(false);
        });
    });

    describe('once final results are published but the key is held back', () => {
        const instance = { finalResultsReleasedAt: new Date(), answerKeyReleasedAt: null };

        it('gives the rank and percentile', async () => {
            const report: any = await serviceFor(instance).getStudentReport(USER, ATTEMPT);
            expect(report.stage).toBe('FINAL');
            expect(report.rank).toBe(12);
            expect(report.percentile).toBe(88.4);
            expect(report.normalizedScore).toBe(72.5);
        });

        it('still withholds the answer key', async () => {
            // The case this protects: a re-sit still pending for a few students.
            const report: any = await serviceFor(instance).getStudentReport(USER, ATTEMPT);
            expect(report.answerKeyAvailable).toBe(false);
            expect(report.questions).toEqual([]);
            expect(serialised(report)).not.toContain('Solar energy is replenished');
        });
    });

    describe('once the answer key is published', () => {
        const instance = {
            finalResultsReleasedAt: new Date(),
            answerKeyReleasedAt: new Date(),
        };

        it('returns each question with the answer, the choice made, and why', async () => {
            const report: any = await serviceFor(instance).getStudentReport(USER, ATTEMPT);
            expect(report.answerKeyAvailable).toBe(true);
            expect(report.questions).toHaveLength(1);
            expect(report.questions[0]).toMatchObject({
                number: 1,
                correctAnswer: 'b',
                yourAnswer: 'a',
                isCorrect: false,
                explanation: question.explanation,
            });
        });
    });

    describe('a disqualified attempt', () => {
        const instance = {
            finalResultsReleasedAt: new Date(),
            answerKeyReleasedAt: new Date(),
        };

        it('is shown to the student, with no score and no key', async () => {
            const report: any = await serviceFor(instance, AttemptStatus.DISQUALIFIED)
                .getStudentReport(USER, ATTEMPT);

            expect(report.stage).toBe('DISQUALIFIED');
            expect(report.isDisqualified).toBe(true);
            // Not a silent zero — it says what happened and how to challenge it.
            expect(report.disqualificationNote).toMatch(/grievance/i);
            expect(report.score).toBeNull();
            // Even with the key published, a disqualified attempt gets no paper.
            expect(report.questions).toEqual([]);
            expect(serialised(report)).not.toContain('Solar energy is replenished');
        });
    });

    describe('ownership', () => {
        it('scopes the query to the caller and 404s otherwise', async () => {
            const prisma: any = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
            const service = new AttemptService(prisma, null as any, null as any, null as any, whatsAppStub());

            await expect(service.getStudentReport(USER, ATTEMPT)).rejects.toThrow(NotFoundException);
            // The userId must be in the WHERE clause, not filtered afterwards —
            // an attempt id in a URL must never read another student's answers.
            expect(prisma.attempt.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: ATTEMPT, userId: USER } }),
            );
        });
    });
});
