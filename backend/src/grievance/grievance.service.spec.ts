import { AttemptStatus, GrievanceStatus, GrievanceType } from '@prisma/client';
import { GrievanceService } from './grievance.service';

/**
 * Hand-rolled in-memory fake of the slice of PrismaService this service uses.
 *
 * Real semantics are enforced (rows actually mutate) rather than canned return
 * values, so the re-attempt test below can genuinely assert that the attempt was
 * reset and its answers deleted — a jest.fn() returning a fixed object could not.
 *
 * `$transaction` takes an array of already-issued promises, matching how the
 * service builds its write list and how Prisma resolves an array transaction.
 */
function createFakeDb() {
    let seq = 0;
    const nextId = (prefix: string) => `${prefix}-${++seq}`;

    const attempts: any[] = [];
    const attemptItems: { attemptId: string }[] = [];
    const grievances: any[] = [];
    const auditLogs: any[] = [];

    const prisma: any = {
        attempt: {
            findUnique: async ({ where }: any) => attempts.find((a) => a.id === where.id) ?? null,
            update: async ({ where, data }: any) => {
                const row = attempts.find((a) => a.id === where.id);
                Object.assign(row, data);
                return row;
            },
        },
        attemptItem: {
            deleteMany: async ({ where }: any) => {
                for (let i = attemptItems.length - 1; i >= 0; i -= 1) {
                    if (attemptItems[i].attemptId === where.attemptId) attemptItems.splice(i, 1);
                }
                return { count: 0 };
            },
        },
        grievance: {
            create: async ({ data }: any) => {
                const row = {
                    id: nextId('g'),
                    status: GrievanceStatus.OPEN,
                    attemptId: null,
                    resolution: null,
                    decidedBy: null,
                    decidedAt: null,
                    createdAt: new Date(),
                    ...data,
                };
                grievances.push(row);
                return row;
            },
            findUnique: async ({ where, include }: any) => {
                const row = grievances.find((g) => g.id === where.id);
                if (!row) return null;
                if (!include?.attempt) return row;
                const attempt = attempts.find((a) => a.id === row.attemptId);
                return {
                    ...row,
                    attempt: attempt
                        ? {
                              ...attempt,
                              _count: {
                                  items: attemptItems.filter((i) => i.attemptId === attempt.id).length,
                              },
                          }
                        : null,
                };
            },
            findMany: async () => grievances.slice(),
            update: async ({ where, data }: any) => {
                const row = grievances.find((g) => g.id === where.id);
                Object.assign(row, data);
                return row;
            },
        },
        auditLog: {
            create: async ({ data }: any) => {
                auditLogs.push(data);
                return data;
            },
        },
        // The service issues its writes eagerly, then hands the promises here.
        $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    };

    return { prisma, attempts, attemptItems, grievances, auditLogs, nextId };
}

function seedAttempt(db: ReturnType<typeof createFakeDb>, userId: string) {
    const attempt = {
        id: db.nextId('a'),
        userId,
        examInstanceId: 'inst-1',
        status: AttemptStatus.SUBMITTED,
        startedAt: new Date('2026-08-01T10:00:00Z'),
        submittedAt: new Date('2026-08-01T11:00:00Z'),
        totalScore: 72,
        maxScore: 100,
        normalizedScore: 68.5,
        percentile: 81.25,
        rank: 3,
    };
    db.attempts.push(attempt);
    db.attemptItems.push({ attemptId: attempt.id }, { attemptId: attempt.id });
    return attempt;
}

describe('GrievanceService.create', () => {
    it('rejects a blank subject or description', async () => {
        const db = createFakeDb();
        const service = new GrievanceService(db.prisma);
        await expect(
            service.create('u1', { type: GrievanceType.GRIEVANCE, subject: '  ', description: 'x' }),
        ).rejects.toThrow(/subject and description/i);
    });

    it('requires an attempt for a re-attempt request', async () => {
        const db = createFakeDb();
        const service = new GrievanceService(db.prisma);
        await expect(
            service.create('u1', {
                type: GrievanceType.REATTEMPT,
                subject: 'Please let me retake',
                description: 'Power cut',
            }),
        ).rejects.toThrow(/must reference an attempt/i);
    });

    it("refuses to attach another student's attempt", async () => {
        const db = createFakeDb();
        const attempt = seedAttempt(db, 'someone-else');
        const service = new GrievanceService(db.prisma);
        await expect(
            service.create('u1', {
                type: GrievanceType.REATTEMPT,
                subject: 's',
                description: 'd',
                attemptId: attempt.id,
            }),
        ).rejects.toThrow(/Attempt not found/i);
    });

    it('opens a plain grievance without an attempt', async () => {
        const db = createFakeDb();
        const service = new GrievanceService(db.prisma);
        const grievance = await service.create('u1', {
            type: GrievanceType.GRIEVANCE,
            subject: '  Wrong score  ',
            description: '  Q3 was marked wrong  ',
        });
        expect(grievance.status).toBe(GrievanceStatus.OPEN);
        expect(grievance.subject).toBe('Wrong score'); // trimmed
        expect(grievance.attemptId ?? null).toBeNull();
    });
});

describe('GrievanceService.decide', () => {
    it('rejects a blank resolution', async () => {
        const db = createFakeDb();
        const service = new GrievanceService(db.prisma);
        const g = await service.create('u1', {
            type: GrievanceType.GRIEVANCE,
            subject: 's',
            description: 'd',
        });
        await expect(service.decide(g.id, GrievanceStatus.RESOLVED, '  ', 'admin')).rejects.toThrow(
            /resolution is required/i,
        );
    });

    it('404s on an unknown grievance', async () => {
        const db = createFakeDb();
        const service = new GrievanceService(db.prisma);
        await expect(
            service.decide('nope', GrievanceStatus.RESOLVED, 'ok', 'admin'),
        ).rejects.toThrow(/not found/i);
    });

    it('resolves a plain grievance and records the actor, without touching any attempt', async () => {
        const db = createFakeDb();
        const attempt = seedAttempt(db, 'u1');
        const service = new GrievanceService(db.prisma);
        const g = await service.create('u1', {
            type: GrievanceType.GRIEVANCE,
            subject: 's',
            description: 'd',
            attemptId: attempt.id,
        });

        await service.decide(g.id, GrievanceStatus.RESOLVED, 'Re-marked; score stands.', 'admin-1');

        const stored = db.grievances.find((x) => x.id === g.id);
        expect(stored.status).toBe(GrievanceStatus.RESOLVED);
        expect(stored.decidedBy).toBe('admin-1');
        expect(stored.decidedAt).toBeInstanceOf(Date);

        // The submission is untouched.
        expect(attempt.status).toBe(AttemptStatus.SUBMITTED);
        expect(attempt.totalScore).toBe(72);
        expect(db.attemptItems).toHaveLength(2);
    });

    it('cannot be decided twice', async () => {
        const db = createFakeDb();
        const service = new GrievanceService(db.prisma);
        const g = await service.create('u1', {
            type: GrievanceType.GRIEVANCE,
            subject: 's',
            description: 'd',
        });
        await service.decide(g.id, GrievanceStatus.REJECTED, 'No merit.', 'admin-1');
        await expect(
            service.decide(g.id, GrievanceStatus.RESOLVED, 'Changed my mind', 'admin-2'),
        ).rejects.toThrow(/already decided/i);
    });

    it('grants a re-attempt: resets the attempt and clears its answers', async () => {
        const db = createFakeDb();
        const attempt = seedAttempt(db, 'u1');
        const service = new GrievanceService(db.prisma);
        const g = await service.create('u1', {
            type: GrievanceType.REATTEMPT,
            subject: 'Power cut',
            description: 'Lost 20 minutes',
            attemptId: attempt.id,
        });

        await service.decide(g.id, GrievanceStatus.RESOLVED, 'Verified outage; re-attempt granted.', 'admin-1');

        expect(attempt.status).toBe(AttemptStatus.NOT_STARTED);
        expect(attempt.submittedAt).toBeNull();
        expect(attempt.startedAt).toBeNull();
        expect(attempt.totalScore).toBeNull();
        expect(attempt.normalizedScore).toBeNull();
        expect(attempt.percentile).toBeNull();
        expect(attempt.rank).toBeNull();
        expect(db.attemptItems).toHaveLength(0); // answers cleared so the retake is fresh
    });

    it('snapshots the original submission into the audit log before clearing it', async () => {
        const db = createFakeDb();
        const attempt = seedAttempt(db, 'u1');
        const service = new GrievanceService(db.prisma);
        const g = await service.create('u1', {
            type: GrievanceType.REATTEMPT,
            subject: 's',
            description: 'd',
            attemptId: attempt.id,
        });

        await service.decide(g.id, GrievanceStatus.RESOLVED, 'Granted.', 'admin-1');

        const audit = db.auditLogs.find((a) => a.action === 'grievance.resolved');
        expect(audit).toBeDefined();
        expect(audit.userId).toBe('admin-1');
        expect(audit.details.grantsReattempt).toBe(true);
        // The evidence of the first sitting survives the reset.
        expect(audit.details.clearedAttempt).toMatchObject({
            id: attempt.id,
            totalScore: 72,
            maxScore: 100,
            answeredQuestions: 2,
        });
    });

    it('REJECTING a re-attempt request leaves the original submission intact', async () => {
        const db = createFakeDb();
        const attempt = seedAttempt(db, 'u1');
        const service = new GrievanceService(db.prisma);
        const g = await service.create('u1', {
            type: GrievanceType.REATTEMPT,
            subject: 's',
            description: 'd',
            attemptId: attempt.id,
        });

        await service.decide(g.id, GrievanceStatus.REJECTED, 'No outage on record.', 'admin-1');

        expect(attempt.status).toBe(AttemptStatus.SUBMITTED);
        expect(attempt.totalScore).toBe(72);
        expect(db.attemptItems).toHaveLength(2);
        const audit = db.auditLogs.find((a) => a.action === 'grievance.rejected');
        expect(audit.details.grantsReattempt).toBe(false);
    });

    it('resolving a GRIEVANCE that references an attempt does not grant a re-attempt', async () => {
        const db = createFakeDb();
        const attempt = seedAttempt(db, 'u1');
        const service = new GrievanceService(db.prisma);
        const g = await service.create('u1', {
            type: GrievanceType.GRIEVANCE, // not REATTEMPT
            subject: 's',
            description: 'd',
            attemptId: attempt.id,
        });

        await service.decide(g.id, GrievanceStatus.RESOLVED, 'Explained.', 'admin-1');

        expect(attempt.status).toBe(AttemptStatus.SUBMITTED);
        expect(db.attemptItems).toHaveLength(2);
    });
});
