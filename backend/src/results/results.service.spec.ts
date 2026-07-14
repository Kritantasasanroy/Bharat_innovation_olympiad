import { AttemptStatus } from '@prisma/client';
import { ResultsService } from './results.service';

/**
 * In-memory fake of the Prisma slice ResultsService touches. Rows really mutate,
 * so the gating assertions below (normalize-before-release, no re-normalizing a
 * released instance) test actual behaviour rather than stubbed return values.
 */
const HOUR = 3_600_000;
/** By default the exam is over — releasing is only legal once it is (item 1). */
const ENDED_WINDOW = {
    startsAt: new Date(Date.now() - 4 * HOUR),
    endsAt: new Date(Date.now() - 2 * HOUR),
};

function createFakeDb(window: { startsAt: Date; endsAt: Date } = ENDED_WINDOW) {
    const exams: any[] = [{ id: 'exam-1', title: 'Science Olympiad', totalMarks: 100, isResultReleased: false }];
    const instances: any[] = [
        {
            id: 'inst-1',
            examId: 'exam-1',
            startsAt: window.startsAt,
            endsAt: window.endsAt,
            resultsNormalizedAt: null,
            resultsReleasedAt: null,
            resultsReleasedBy: null,
            resultsReleasedToStudentsAt: null,
            resultsReleasedToSchoolsAt: null,
            resultsReleasedToPartnersAt: null,
        },
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
            /normaliz/i,
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

describe('ResultsService.release — the exam must be over (item 1)', () => {
    const HOUR_MS = 3_600_000;

    it('REFUSES to release for an exam that has not started', async () => {
        const db = createFakeDb({
            startsAt: new Date(Date.now() + 2 * HOUR_MS),
            endsAt: new Date(Date.now() + 4 * HOUR_MS),
        });
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);
        db.instances[0].resultsNormalizedAt = new Date();

        await expect(service.release('inst-1', 'admin', 'Eager')).rejects.toThrow(
            /not started/i,
        );
        expect(db.instances[0].resultsReleasedAt).toBeNull();
        expect(db.exams[0].isResultReleased).toBe(false);
    });

    it('REFUSES to release while the exam is still running', async () => {
        const db = createFakeDb({
            startsAt: new Date(Date.now() - HOUR_MS),
            endsAt: new Date(Date.now() + HOUR_MS),
        });
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);
        db.instances[0].resultsNormalizedAt = new Date();

        await expect(service.release('inst-1', 'admin', 'Early')).rejects.toThrow(
            /still in progress/i,
        );
        expect(db.instances[0].resultsReleasedAt).toBeNull();
    });
});

describe('ResultsService.release — per audience (item 19)', () => {
    it('releasing to schools does NOT hand students their scores', async () => {
        const db = createFakeDb();
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);
        await service.normalize('inst-1', 'admin');

        await service.release('inst-1', 'admin', 'School QC first.', ['SCHOOLS']);

        expect(db.instances[0].resultsReleasedToSchoolsAt).toBeInstanceOf(Date);
        expect(db.instances[0].resultsReleasedToStudentsAt).toBeNull();
        // The legacy student-facing gate tracks STUDENTS only.
        expect(db.exams[0].isResultReleased).toBe(false);
    });

    it('adds a further audience later without re-releasing the ones already out', async () => {
        const db = createFakeDb();
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);
        await service.normalize('inst-1', 'admin');

        await service.release('inst-1', 'admin', 'Schools first.', ['SCHOOLS']);
        const schoolsAt = db.instances[0].resultsReleasedToSchoolsAt;

        const second = await service.release('inst-1', 'admin', 'Now students.', [
            'SCHOOLS',
            'STUDENTS',
        ]);

        // Only the genuinely new audience was released.
        expect(second.released).toEqual(['STUDENTS']);
        // The school release timestamp was not overwritten.
        expect(db.instances[0].resultsReleasedToSchoolsAt).toBe(schoolsAt);
        expect(db.exams[0].isResultReleased).toBe(true);
    });

    it('refuses when every requested audience already has the results', async () => {
        const db = createFakeDb();
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);
        await service.normalize('inst-1', 'admin');
        await service.release('inst-1', 'admin', 'Out.', ['PARTNERS']);

        await expect(
            service.release('inst-1', 'admin', 'Again', ['PARTNERS']),
        ).rejects.toThrow(/already released to partners/i);
    });

    it('revoking from students closes the student result pages again', async () => {
        const db = createFakeDb();
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);
        await service.normalize('inst-1', 'admin');
        await service.release('inst-1', 'admin', 'Out.', ['STUDENTS', 'SCHOOLS']);
        expect(db.exams[0].isResultReleased).toBe(true);

        await service.revoke('inst-1', 'admin', 'Scoring error found.', ['STUDENTS']);

        expect(db.instances[0].resultsReleasedToStudentsAt).toBeNull();
        expect(db.exams[0].isResultReleased).toBe(false);
        // Schools keep theirs — the revoke was scoped.
        expect(db.instances[0].resultsReleasedToSchoolsAt).toBeInstanceOf(Date);
        expect(db.auditLogs.some((a) => a.action === 'results.revoked')).toBe(true);
    });
});

describe('ResultsService.getStatus', () => {
    it('reports canRelease only after normalization, and says why when it cannot', async () => {
        const db = createFakeDb();
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);

        const before = await service.getStatus('inst-1');
        expect(before.canRelease).toBe(false);
        expect(before.releaseBlockedReason).toMatch(/normaliz/i);
        expect(before.hasEnded).toBe(true);

        await service.normalize('inst-1', 'admin');
        const after = await service.getStatus('inst-1');
        expect(after.canRelease).toBe(true);
        expect(after.releaseBlockedReason).toBeNull();
        expect(after.releasedTo.STUDENTS).toBeNull();
    });

    it('reports the exam-still-running block, not a normalization block', async () => {
        const db = createFakeDb({
            startsAt: new Date(Date.now() - 3_600_000),
            endsAt: new Date(Date.now() + 3_600_000),
        });
        seedAttempts(db, [90, 50]);
        const service = new ResultsService(db.prisma);
        await service.normalize('inst-1', 'admin');

        const status = await service.getStatus('inst-1');
        expect(status.canRelease).toBe(false);
        expect(status.hasEnded).toBe(false);
        expect(status.releaseBlockedReason).toMatch(/still in progress/i);
    });
});
