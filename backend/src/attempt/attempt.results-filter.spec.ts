import { AttemptStatus } from '@prisma/client';
import { AttemptService } from './attempt.service';
import { DEMO_EXAM_IDS } from '../common/demo-exams';
import { objectStorageStub } from '../common/services/object-storage.stub';

/**
 * Only the **trial rehearsal** is kept out of a student's results.
 *
 * The dashboard's "Recent Results", the results page and the XP total all read
 * from `getResults` / `getRecentResults`, so the rule lives in one place and the
 * three stay in step. The free **practice papers must NOT be filtered** — a
 * student sits one to gauge themselves, so its score and result are the point.
 * They were briefly excluded here alongside the trial; that was wrong, and these
 * tests pin the distinction so it does not come back.
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
        {} as never,
        objectStorageStub(),
    );
    return { svc, findMany };
}

/** The `where.examInstance.exam` clause the query was built with. */
function examFilter(findMany: jest.Mock) {
    return findMany.mock.calls[0][0].where.examInstance.exam;
}

describe('getResults / getRecentResults — only the trial is excluded', () => {
    it('getResults filters out trial exams', async () => {
        const { svc, findMany } = service();
        await svc.getResults('u1');
        expect(examFilter(findMany)).toEqual(
            expect.objectContaining({ isTrial: false }),
        );
    });

    it('getRecentResults applies the same filter', async () => {
        const { svc, findMany } = service();
        await svc.getRecentResults('u1');
        expect(examFilter(findMany).isTrial).toBe(false);
    });

    // The regression this file exists for: a practice paper is scored, so it
    // has to reach the results list, the dashboard and the XP total.
    it.each([
        ['getResults', (s: AttemptService) => s.getResults('u1')],
        ['getRecentResults', (s: AttemptService) => s.getRecentResults('u1')],
    ])('%s does NOT exclude the practice papers by id', async (_label, call) => {
        const { svc, findMany } = service();
        await call(svc);
        const filter = examFilter(findMany) as Record<string, unknown>;
        expect(filter.id).toBeUndefined();
        expect(JSON.stringify(filter)).not.toContain(PRACTICE_EXAM_ID);
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
