import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
    ExamFeedbackService,
    FEEDBACK_COMMENT_MIN_LENGTH,
    FEEDBACK_COMMENT_REQUIRED_BELOW,
} from './exam-feedback.service';

const ATTEMPT = { id: 'attempt-1', examInstanceId: 'inst-1' };

function serviceWith(overrides: Record<string, unknown> = {}) {
    const prisma = {
        attempt: { findFirst: jest.fn().mockResolvedValue(ATTEMPT) },
        examFeedback: {
            upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 'fb-1', ...create })),
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
            aggregate: jest.fn().mockResolvedValue({ _avg: { rating: null } }),
            groupBy: jest.fn().mockResolvedValue([]),
        },
        ...overrides,
    };
    return { service: new ExamFeedbackService(prisma as never), prisma };
}

const LONG = 'x'.repeat(FEEDBACK_COMMENT_MIN_LENGTH);

describe('ExamFeedbackService.submit', () => {
    it('stores a rating with no comment when the student is happy', async () => {
        const { service, prisma } = serviceWith();

        await service.submit('user-1', 'attempt-1', 5);

        expect(prisma.examFeedback.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { attemptId: 'attempt-1' },
                create: expect.objectContaining({ rating: 5, comment: null, userId: 'user-1' }),
            }),
        );
    });

    it.each([0, 6, -1, 2.5, Number.NaN])('rejects %p as a rating', async (rating) => {
        const { service, prisma } = serviceWith();

        await expect(service.submit('user-1', 'attempt-1', rating as number)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(prisma.examFeedback.upsert).not.toHaveBeenCalled();
    });

    // The rule this whole feature turns on: a low score with no words behind it
    // tells us something is wrong and nothing about what.
    it.each([1, 2])('requires a comment at %i stars', async (rating) => {
        const { service } = serviceWith();

        await expect(service.submit('user-1', 'attempt-1', rating)).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('rejects a comment shorter than the minimum on a low rating', async () => {
        const { service } = serviceWith();

        await expect(
            service.submit('user-1', 'attempt-1', 1, 'x'.repeat(FEEDBACK_COMMENT_MIN_LENGTH - 1)),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('counts length after trimming, so whitespace cannot pad it out', async () => {
        const { service } = serviceWith();

        await expect(
            service.submit('user-1', 'attempt-1', 1, `  ${'x'.repeat(5)}${' '.repeat(40)}  `),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a low rating once the comment is long enough', async () => {
        const { service, prisma } = serviceWith();

        await service.submit('user-1', 'attempt-1', 1, LONG);

        expect(prisma.examFeedback.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ create: expect.objectContaining({ rating: 1, comment: LONG }) }),
        );
    });

    it(`does not demand a comment at ${FEEDBACK_COMMENT_REQUIRED_BELOW} stars or above`, async () => {
        const { service } = serviceWith();

        await expect(service.submit('user-1', 'attempt-1', FEEDBACK_COMMENT_REQUIRED_BELOW))
            .resolves.toBeDefined();
    });

    // A student must not be able to rate somebody else's paper by guessing an id.
    it('refuses an attempt that is not the caller\'s', async () => {
        const { service } = serviceWith({ attempt: { findFirst: jest.fn().mockResolvedValue(null) } });

        await expect(service.submit('user-1', 'someone-elses', 5)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('scopes the attempt lookup to the caller', async () => {
        const { service, prisma } = serviceWith();

        await service.submit('user-1', 'attempt-1', 4);

        expect(prisma.attempt.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'attempt-1', userId: 'user-1' } }),
        );
    });

    // Upsert, not create: a reload or a double-tap must update the one row.
    it('upserts on attemptId so a reload cannot stack ratings', async () => {
        const { service, prisma } = serviceWith();

        await service.submit('user-1', 'attempt-1', 4, 'fine');
        const call = prisma.examFeedback.upsert.mock.calls[0][0];

        expect(call.where).toEqual({ attemptId: 'attempt-1' });
        expect(call.update).toEqual({ rating: 4, comment: 'fine' });
    });

    it('stores an empty comment as null rather than an empty string', async () => {
        const { service, prisma } = serviceWith();

        await service.submit('user-1', 'attempt-1', 5, '   ');

        expect(prisma.examFeedback.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ create: expect.objectContaining({ comment: null }) }),
        );
    });

    it('takes examInstanceId from the attempt, not from the caller', async () => {
        const { service, prisma } = serviceWith();

        await service.submit('user-1', 'attempt-1', 5);

        expect(prisma.examFeedback.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ create: expect.objectContaining({ examInstanceId: 'inst-1' }) }),
        );
    });
});

describe('ExamFeedbackService.adminSummary', () => {
    it('reports every rating bucket, including the ones nobody chose', async () => {
        const { service } = serviceWith({
            examFeedback: {
                count: jest.fn().mockResolvedValue(3),
                aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.3333 } }),
                groupBy: jest.fn().mockResolvedValue([
                    { rating: 5, _count: { rating: 2 } },
                    { rating: 3, _count: { rating: 1 } },
                ]),
            },
        });

        await expect(service.adminSummary()).resolves.toEqual({
            total: 3,
            average: 4.33,
            distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 2 },
        });
    });

    it('reports a null average rather than 0 when nothing has been rated', async () => {
        const { service } = serviceWith();

        await expect(service.adminSummary()).resolves.toEqual({
            total: 0,
            average: null,
            distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        });
    });
});

describe('ExamFeedbackService.adminList', () => {
    it('filters to the unhappy ratings when asked', async () => {
        const { service, prisma } = serviceWith();

        await service.adminList({ maxRating: 2 });

        expect(prisma.examFeedback.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ rating: { lte: 2 } }) }),
        );
    });

    it('asks for newest first', async () => {
        const { service, prisma } = serviceWith();

        await service.adminList();

        expect(prisma.examFeedback.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
        );
    });

    it('flattens the student and exam onto each row for the table', async () => {
        const { service } = serviceWith({
            examFeedback: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'fb-1',
                        rating: 2,
                        comment: 'the timer jumped',
                        createdAt: new Date('2026-09-10T00:00:00Z'),
                        user: {
                            id: 'u1', firstName: 'Asha', lastName: 'Rao', email: 'a@b.c',
                            rollNumber: 'BIO26-G8-00001', classBand: 8, school: { name: 'St Xavier' },
                        },
                        examInstance: { id: 'i1', exam: { id: 'e1', title: 'Grade 8 Olympiad' } },
                    },
                ]),
            },
        });

        await expect(service.adminList()).resolves.toEqual([
            expect.objectContaining({
                studentName: 'Asha Rao',
                schoolName: 'St Xavier',
                examTitle: 'Grade 8 Olympiad',
                rating: 2,
                comment: 'the timer jumped',
            }),
        ]);
    });

    it('survives a student with no school', async () => {
        const { service } = serviceWith({
            examFeedback: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'fb-1', rating: 5, comment: null, createdAt: new Date(),
                        user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.c', rollNumber: null, classBand: null, school: null },
                        examInstance: { id: 'i1', exam: { id: 'e1', title: 'T' } },
                    },
                ]),
            },
        });

        await expect(service.adminList()).resolves.toEqual([
            expect.objectContaining({ schoolName: null }),
        ]);
    });
});
