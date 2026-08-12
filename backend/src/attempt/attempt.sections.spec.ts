import { AttemptService } from './attempt.service';
import { whatsAppStub } from '../notification/whatsapp.stub';

/**
 * The paper is sat one section at a time.
 *
 * A cross-section shuffle used to run at the end of `buildQuestionSet`, which
 * meant consecutive questions came from different pillars and the section
 * heading above them changed on almost every question — making the heading, and
 * the whole idea of "finish this section, then the next", meaningless.
 *
 * These tests pin the two properties that fix has to hold at once:
 *   1. section **order is never shuffled**, and questions never interleave, and
 *   2. **within** a section, order still varies per student (anti-collusion).
 */

/** The five Olympiad pillars, in the order the workbook lists them. */
const SECTIONS = [
    { code: 'EM', title: 'Entrepreneurship Mindset', count: 13 },
    { code: 'PSI', title: 'Problem Solving & Innovation', count: 12 },
    { code: 'ETDR', title: 'Emerging Technologies & Digital Readiness', count: 10 },
    { code: 'FRG', title: 'Future Readiness & Global Awareness', count: 8 },
    { code: 'FRD', title: 'Financial Readiness', count: 7 },
];

function buildSections() {
    return SECTIONS.map((s, i) => ({
        id: `sec-${s.code}`,
        title: s.title,
        sortOrder: i,
        questionsToAssign: 0, // 0 = assign every question in the pool
        sectionQuestions: Array.from({ length: s.count }, (_, q) => ({
            sortOrder: q,
            question: { id: `${s.code}-${q + 1}`, difficulty: 'EASY' },
        })),
    }));
}

/** `buildQuestionSet` is private; these tests exercise it directly on purpose. */
function build(userId: string, sections = buildSections()) {
    // `buildQuestionSet` is pure — none of the injected services are touched.
    const service = new AttemptService(null as any, null as any, null as any, null as any, whatsAppStub());
    return (service as any).buildQuestionSet(sections, 'exam-1', userId, 30, 50, 20) as any[];
}

describe('buildQuestionSet — section-by-section delivery', () => {
    it('returns every question in the paper', () => {
        expect(build('student-1')).toHaveLength(50);
    });

    it('keeps each section contiguous — questions never interleave across pillars', () => {
        const set = build('student-1');
        // Collapse to the run-length sequence of section ids. If sections are
        // contiguous there is exactly one run per section.
        const runs: string[] = [];
        for (const q of set) {
            if (runs[runs.length - 1] !== q.sectionId) runs.push(q.sectionId);
        }
        expect(runs).toHaveLength(SECTIONS.length);
    });

    it('preserves the section order declared by sortOrder', () => {
        const set = build('student-1');
        const order = [...new Set(set.map((q) => q.sectionTitle))];
        expect(order).toEqual(SECTIONS.map((s) => s.title));
    });

    it('follows sortOrder, not the order sections happened to arrive in', () => {
        // The DB query orders by sortOrder, but nothing should depend on that.
        const shuffledInput = [...buildSections()].reverse();
        const set = build('student-1', shuffledInput);
        const order = [...new Set(set.map((q) => q.sectionTitle))];
        expect(order).toEqual(SECTIONS.map((s) => s.title));
    });

    it('gives each section the right number of questions', () => {
        const set = build('student-1');
        for (const s of SECTIONS) {
            expect(set.filter((q) => q.sectionId === `sec-${s.code}`)).toHaveLength(s.count);
        }
    });

    it('stamps every question with its section, so the player can draw headings', () => {
        const set = build('student-1');
        for (const q of set) {
            expect(typeof q.sectionId).toBe('string');
            expect(typeof q.sectionTitle).toBe('string');
            expect(typeof q.sectionIndex).toBe('number');
        }
        // sectionIndex must agree with the position of the section in the paper.
        const firstOfLast = set.find((q) => q.sectionTitle === SECTIONS[4].title);
        expect(firstOfLast.sectionIndex).toBe(4);
    });

    it('still varies question order between students, inside each section', () => {
        const a = build('student-a').map((q) => q.id);
        const b = build('student-b').map((q) => q.id);
        expect(a).not.toEqual(b);

        // ...but only inside sections: both students see the same *sections* in
        // the same order, so the difference is never a reordered paper.
        const sectionsOf = (ids: string[]) => [...new Set(ids.map((id) => id.split('-')[0]))];
        expect(sectionsOf(a)).toEqual(sectionsOf(b));
    });

    it('is stable for one student across refreshes', () => {
        expect(build('student-a').map((q) => q.id)).toEqual(build('student-a').map((q) => q.id));
    });

    it('skips empty sections rather than emitting a heading with nothing under it', () => {
        const sections = buildSections();
        sections[2].sectionQuestions = [];
        const set = build('student-1', sections);
        expect(set.map((q) => q.sectionTitle)).not.toContain(SECTIONS[2].title);
        expect(set).toHaveLength(50 - SECTIONS[2].count);
    });
});
