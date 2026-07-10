import { AttemptStatus } from '@prisma/client';
import { ResultsService } from './results.service';

/**
 * In-memory fake of the Prisma slice ResultsService touches. Rows really mutate,
 * so the gating assertions below (normalize-before-release, no re-normalizing a
 * released instance) test actual behaviour rather than stubbed return values.
 */
function createFakeDb() {
    const exams: any[] = [{ id: 'exam-1', title: 'Science Olympiad', totalMarks: 100, isResultReleased: false }];
    const instances: any[] = [
        { id: 'inst-1', examId: 'exam-1', resultsNormalizedAt: null, resultsReleasedAt: null, resultsReleasedBy: null },
    ];
    const attempts: any[] = [];
    const auditLogs: any[] = [];
    const certificates: any[] = [];

    const prisma: any = {
        examInstance: {
            findUnique: async ({ where, include }: any) => {
                const row = instances.find((i) => i.id === where.id);
                if (!row) return null;
                if (!include) return row;
                return { ...row, exam: exams.find((e) => e.id === row.examId) };
            },
            update: async ({ where, data }: any) => {
                const row = instances.find((i) => i.id === where.id);
                Object.assign(row, data);
                return row;
            },
            findMany: async () => instances.map((i) => ({ ...i, exam: exams.find((e) => e.id === i.examId), _count: { attempts: 0, certificates: 0 } })),
        },
        exam: {
            update: async ({ where, data }: any) => {
                const row = exams.find((e) => e.id === where.id);
                Object.assign(row, data);
                return row;
            },
        },
        attempt: {
            findMany: async ({ where }: any) =>
                attempts.filter(
                    (a) => a.examInstanceId === where.examInstanceId && where.status.in.includes(a.status),
                ),
            count: async ({ where }: any) =>
                attempts.filter(
                    (a) => a.examInstanceId === where.examInstanceId && where.status.in.includes(a.status),
                ).length,
            update: async ({ where, data }: any) => {
                const row = attempts.find((a) => a.id === where.id);
                Object.assign(row, data);
                return row;
            },
        },
        certificate: { count: async () => certificates.length },
        auditLog: {
            create: async ({ data }: any) => {
                auditLogs.push(data);
                return data;
            },
        },
        $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    };

    return { prisma, exams, instances, attempts, auditLogs };
}

function seedAttempts(db: ReturnType<typeof createFakeDb>, scores: number[]) {
    scores.forEach((score, i) => {
        db.attempts.push({
            id: `a-${i}`,
            examInstanceId: 'inst-1',
            status: AttemptStatus.SUBMITTED,
            totalScore: score,
            maxScore: 100,
            normalizedScore: null,
            percentile: null,
            rank: null,
        });
    });
}

describe('ResultsService.normalize', () => {
    it('refuses when there are no submitted attempts', async () => {
        const db = createFakeDb();
        const service = new ResultsService(db.prisma);
        await expect(service.normalize('inst-1', 'admin')).rejects.toThrow(/No submitted attempts/i);
    });

    it('404s on an unknown instance', async () => {
        const db = createFakeDb();
        const service = new ResultsService(db.prisma);
        await expect(service.normalize('nope', 'admin')).rejects.toThrow(/not found/i);
    });

    it('writes normalizedScore, percentile and rank onto every attempt and stamps the instance', async () => {
        const db = createFakeDb();
        seedAttempts(db, [90, 50, 10]);
        const service = new ResultsService(db.prisma);

        const result = await service.normalize('inst-1', 'admin-1');

        expect(result.attempts).toBe(3);
        for (const attempt of db.attempts) {
            expect(attempt.normalizedScore).toEqual(expect.any(Number));
            expect(attempt.percentile).toEqual(expect.any(Number));
            expect(attempt.rank).toEqual(expect.any(Number));
        }
        const top = db.attempts.find((a) => a.totalScore === 90);
        expect(top.rank).toBe(1);
        expect(db.instances[0].resultsNormalizedAt).toBeInstanceOf(Date);
        expect(db.auditLogs.some((a) => a.action === 'results.normalized')).toBe(true);
    });

    it('is idempotent — re-running recomputes cleanly (a late submission can be folded in)', async () => {
        const db = createFakeDb();
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);
        await service.normalize('inst-1', 'admin');

        // A late attempt arrives; normalize again.
        db.attempts.push({
            id: 'a-late',
            examInstanceId: 'inst-1',
            status: AttemptStatus.AUTO_SUBMITTED,
            totalScore: 100,
            maxScore: 100,
            normalizedScore: null,
            percentile: null,
            rank: null,
        });
        const second = await service.normalize('inst-1', 'admin');

        expect(second.attempts).toBe(3);
        expect(db.attempts.find((a) => a.id === 'a-late').rank).toBe(1);
    });

    it('refuses to normalize once results are released (it would rewrite published scores)', async () => {
        const db = createFakeDb();
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);
        await service.normalize('inst-1', 'admin');
        await service.release('inst-1', 'admin', 'Checked.');

        await expect(service.normalize('inst-1', 'admin')).rejects.toThrow(/already released/i);
    });
});

describe('ResultsService.release — the gate', () => {
    it('REFUSES to release results that have not been normalized', async () => {
        const db = createFakeDb();
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);

        await expect(service.release('inst-1', 'admin', 'Looks fine')).rejects.toThrow(
            /must be normalized before/i,
        );
        expect(db.instances[0].resultsReleasedAt).toBeNull();
        expect(db.exams[0].isResultReleased).toBe(false);
    });

    it('requires a written reason', async () => {
        const db = createFakeDb();
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);
        await service.normalize('inst-1', 'admin');

        await expect(service.release('inst-1', 'admin', '   ')).rejects.toThrow(/reason is required/i);
    });

    it('releases once normalized, flips the student-facing gate, and audits the actor + reason', async () => {
        const db = createFakeDb();
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);
        await service.normalize('inst-1', 'admin');

        await service.release('inst-1', 'admin-7', 'QC complete, ranks verified.');

        expect(db.instances[0].resultsReleasedAt).toBeInstanceOf(Date);
        expect(db.instances[0].resultsReleasedBy).toBe('admin-7');
        // Legacy student-facing flag kept in step.
        expect(db.exams[0].isResultReleased).toBe(true);

        const audit = db.auditLogs.find((a) => a.action === 'results.released');
        expect(audit.userId).toBe('admin-7');
        expect(audit.details.reason).toBe('QC complete, ranks verified.');
    });

    it('cannot be released twice', async () => {
        const db = createFakeDb();
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);
        await service.normalize('inst-1', 'admin');
        await service.release('inst-1', 'admin', 'Done.');

        await expect(service.release('inst-1', 'admin', 'Again')).rejects.toThrow(/already released/i);
    });
});

describe('ResultsService.getStatus', () => {
    it('reports canRelease only after normalization and before release', async () => {
        const db = createFakeDb();
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);

        expect((await service.getStatus('inst-1')).canRelease).toBe(false);

        await service.normalize('inst-1', 'admin');
        expect((await service.getStatus('inst-1')).canRelease).toBe(true);

        await service.release('inst-1', 'admin', 'Done.');
        expect((await service.getStatus('inst-1')).canRelease).toBe(false);
    });
});
