import { AttemptStatus } from '@prisma/client';
import { AttemptService } from './attempt.service';
import { DEMO_EXAM_IDS } from '../common/demo-exams';

/**
 * A trial rehearsal or a practice paper is never scored and never produces a
 * result — anywhere. The dashboard's "Recent Results", the results page and the
 * XP total all read from `getResults` / `getRecentResults`, so filtering the
 * practice attempts out there is what keeps the three in step.
 */

const PRACTICE_EXAM_ID = [...DEMO_EXAM_IDS][0];

function service() {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma: any = { attempt: { findMany } };
    const svc = new AttemptService(
        prisma,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
    );
    return { svc, findMany };
}

/** The `where.examInstance.exam` clause the query was built with. */
function examFilter(findMany: jest.Mock) {
    return findMany.mock.calls[0][0].where.examInstance.exam;
}

describe('getResults / getRecentResults — practice papers are excluded', () => {
    it('getResults filters out trial exams', async () => {
        const { svc, findMany } = service();
        await svc.getResults('u1');
        expect(examFilter(findMany)).toEqual(
            expect.objectContaining({ isTrial: false }),
        );
    });

    it('getResults filters out every demo exam by id', async () => {
        const { svc, findMany } = service();
        await svc.getResults('u1');
        const notIn = examFilter(findMany).id.notIn as string[];
        for (const id of DEMO_EXAM_IDS) expect(notIn).toContain(id);
    });

    it('getRecentResults applies the same filter', async () => {
        const { svc, findMany } = service();
        await svc.getRecentResults('u1');
        const f = examFilter(findMany);
        expect(f.isTrial).toBe(false);
        expect(f.id.notIn).toContain(PRACTICE_EXAM_ID);
    });

    it('still scopes to the caller and to submitted statuses', async () => {
        const { svc, findMany } = service();
        await svc.getRecentResults('u1');
        const where = findMany.mock.calls[0][0].where;
        expect(where.userId).toBe('u1');
        expect(where.status.in).toEqual(
            expect.arrayContaining([AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]),
        );
    });
});
