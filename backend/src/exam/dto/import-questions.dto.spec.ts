import { ValidationPipe } from '@nestjs/common';
import { ImportQuestionsDto } from './import-questions.dto';

/**
 * The import payload decides how a *live exam* is structured, and it arrives
 * from a spreadsheet an admin picked off their disk. The two older bulk
 * endpoints take `any[]` and hand it straight to `prisma.question.create`,
 * which means a stray column becomes a Prisma error halfway through a 50-row
 * transaction. This DTO exists so that cannot happen here.
 *
 * These tests run the payload through a pipe configured exactly like the global
 * one in `bootstrap.ts` — `whitelist` and `forbidNonWhitelisted` change what
 * survives validation, so testing the DTO without them would prove nothing
 * about production behaviour.
 */
const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
});

const meta = { type: 'body' as const, metatype: ImportQuestionsDto, data: '' };
const run = (value: unknown) => pipe.transform(value, meta);

const question = (over: Record<string, unknown> = {}) => ({
    text: 'Which city hosts the Parliament of India?',
    options: [
        { text: 'Mumbai', isCorrect: false },
        { text: 'New Delhi', isCorrect: true },
        { text: 'Goa', isCorrect: false },
        { text: 'Jaipur', isCorrect: false },
    ],
    ...over,
});

describe('ImportQuestionsDto', () => {
    it('accepts a full Olympiad-format row and keeps every field', async () => {
        const result = await run({
            questions: [
                question({
                    difficulty: 'EASY',
                    marks: 1,
                    negativeMarks: 0,
                    explanation: 'New Delhi is the capital.',
                    externalId: 'EM-GK-05-001',
                    grade: 8,
                    partCode: 'EM',
                    partName: 'Entrepreneurship Mindset',
                    sectionCode: 'GK',
                    sectionName: 'Everyday Awareness',
                    topic: 'Location Awareness',
                    learningObjective: 'Identify India’s capital city.',
                    questionCategory: 'Recall',
                    bloomLevel: 'Remember',
                    competency: 'General awareness',
                    questionFormat: 'MCQ - Single Correct',
                    futureReadyInsight: 'Builds civic awareness.',
                    imageFilename: 'EM_GK_Q1.png',
                    imageSourceUrl: 'https://drive.google.com/file/d/1abcdefghijk/view',
                    metadata: { version: '1.0', reviewerComments: 'Approved' },
                }),
            ],
            replaceExisting: true,
        });

        const q = result.questions[0];
        expect(q.partName).toBe('Entrepreneurship Mindset');
        expect(q.futureReadyInsight).toBe('Builds civic awareness.');
        // The pipe strips undecorated properties — metadata must survive.
        expect(q.metadata).toEqual({ version: '1.0', reviewerComments: 'Approved' });
        expect(result.replaceExisting).toBe(true);
    });

    it('accepts a minimal row — only text and options are required', async () => {
        const result = await run({ questions: [question()] });
        expect(result.questions).toHaveLength(1);
    });

    it('rejects a payload with no questions', async () => {
        await expect(run({ questions: [] })).rejects.toThrow();
        await expect(run({})).rejects.toThrow();
    });

    it('rejects an unknown column rather than letting Prisma fail mid-transaction', async () => {
        await expect(run({ questions: [question({ someRogueColumn: 'x' })] })).rejects.toThrow();
    });

    it('rejects a question with blank or missing text', async () => {
        await expect(run({ questions: [question({ text: '' })] })).rejects.toThrow();
        await expect(run({ questions: [{ options: question().options }] })).rejects.toThrow();
    });

    it('rejects a blank option, which is what an empty spreadsheet cell produces', async () => {
        const opts = question().options.map((o, i) => (i === 2 ? { ...o, text: '' } : o));
        await expect(run({ questions: [question({ options: opts })] })).rejects.toThrow();
    });

    it('coerces a numeric cell to a string rather than rejecting the row', async () => {
        // The global pipe runs with `enableImplicitConversion`, so a question
        // that is literally the number 2024 arrives as "2024". Worth pinning:
        // it is the behaviour, and it is the behaviour we want for spreadsheets.
        const result = await run({ questions: [question({ text: 2024 })] });
        expect(result.questions[0].text).toBe('2024');
    });

    it('rejects a difficulty outside the enum', async () => {
        await expect(run({ questions: [question({ difficulty: 'IMPOSSIBLE' })] })).rejects.toThrow();
    });

    it('rejects an option list that is too short or malformed', async () => {
        await expect(run({ questions: [question({ options: [{ text: 'only one', isCorrect: true }] })] }))
            .rejects.toThrow();
        await expect(run({ questions: [question({ options: [{ text: 'a' }, { text: 'b' }] })] }))
            .rejects.toThrow();
    });

    it('rejects negative or absurd marks', async () => {
        await expect(run({ questions: [question({ marks: -5 })] })).rejects.toThrow();
        await expect(run({ questions: [question({ negativeMarks: -1 })] })).rejects.toThrow();
        await expect(run({ questions: [question({ grade: 99 })] })).rejects.toThrow();
    });

    it('caps the import size so one upload cannot hold a transaction open forever', async () => {
        const tooMany = Array.from({ length: 501 }, () => question());
        await expect(run({ questions: tooMany })).rejects.toThrow();
    });
});
