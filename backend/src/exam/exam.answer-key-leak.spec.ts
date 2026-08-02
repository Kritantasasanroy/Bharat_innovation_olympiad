import { ExamService } from './exam.service';

/**
 * `GET /exams/:id` must not carry the answer key.
 *
 * A question's `explanation` routinely states the correct answer in prose. It
 * was already removed from the attempt payload for that reason — and this second
 * route was missed. The instructions page fetches `/exams/:id` *before* the
 * paper starts, so every explanation for all 50 questions of a live exam was
 * readable in the network tab of anyone about to sit it.
 *
 * These tests assert on the Prisma `select`, not on the response body, because
 * that is where the guarantee has to hold: a student read must never load the
 * column at all, so no later refactor of the response shaping can put it back.
 */
describe('findExamById — answer-key exposure', () => {
    /** The `question.select` that the call handed to Prisma. */
    const selectFor = async (userId?: string) => {
        let captured: Record<string, unknown> | undefined;

        const prisma = {
            exam: {
                findUnique: async (args: any) => {
                    captured =
                        args.include.sections.include.sectionQuestions.include.question.select;
                    return {
                        id: 'exam-1',
                        isArchived: false,
                        isTrial: false,
                        instances: [],
                        sections: [],
                    };
                },
            },
        };

        const service = new ExamService(prisma as any, {} as any, {} as any, {} as any);
        await service.findExamById('exam-1', userId);
        return captured!;
    };

    it('does not read explanations on a student request', async () => {
        const select = await selectFor('student-1');

        expect(select.explanation).toBe(false);
    });

    it('never reads correctAnswer, for anyone', async () => {
        expect((await selectFor('student-1')).correctAnswer).toBeUndefined();
        expect((await selectFor(undefined)).correctAnswer).toBeUndefined();
    });

    it('still reads explanations for an admin, who authors them', async () => {
        const select = await selectFor(undefined);

        expect(select.explanation).toBe(true);
    });

    it('still returns everything a student is meant to see', async () => {
        const select = await selectFor('student-1');

        // The paper itself, plus the taxonomy the player renders as section and
        // topic labels. A leak fix that quietly blanked the paper would pass a
        // test that only checked what is absent.
        for (const field of [
            'id', 'text', 'options', 'marks', 'negativeMarks',
            'imageUrl', 'videoUrl', 'mediaUrl', 'mediaType',
            'partName', 'sectionName', 'topic', 'bloomLevel', 'futureReadyInsight',
        ]) {
            expect(select[field]).toBe(true);
        }
    });
});
