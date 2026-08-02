import * as XLSX from 'xlsx';

/**
 * Parsing for the two question-workbook formats this portal accepts.
 *
 * ## Why there are two
 *
 * The **Olympiad format** is the approved 29/30-field question-database
 * standard the content team authors in. It carries the five-pillar taxonomy,
 * Bloom levels, competencies and image provenance, and — critically — its
 * `Part Name` column is what the exam's *section structure* is built from.
 *
 * The **legacy format** is the nine-column sheet the portal has always taken
 * (`Question | Option A–D | Right Answer | Difficulty Level | Marks |
 * Negative Marks`). Older papers and `backend/scripts/seed-demo-exam.js` still
 * use it, so it keeps working: the format is detected from the header row
 * rather than chosen by the admin, and nothing that imported before stops.
 *
 * Detection is by header signature, not by file extension or sheet position.
 */

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface ParsedOption {
    text: string;
    isCorrect: boolean;
}

export interface ParsedQuestion {
    text: string;
    options: ParsedOption[];
    difficulty: Difficulty;
    marks: number;
    negativeMarks: number;
    explanation?: string;

    // Olympiad-format fields. Absent for legacy sheets.
    externalId?: string;
    grade?: number;
    partCode?: string;
    partName?: string;
    sectionCode?: string;
    sectionName?: string;
    topic?: string;
    learningObjective?: string;
    questionCategory?: string;
    bloomLevel?: string;
    competency?: string;
    questionFormat?: string;
    futureReadyInsight?: string;
    imageFilename?: string;
    imageSourceUrl?: string;
    metadata?: Record<string, unknown>;
}

export interface ParseResult {
    format: 'olympiad' | 'legacy';
    questions: ParsedQuestion[];
    /** The sheet the questions were read from. */
    sheetName: string;
    /**
     * Non-fatal problems. These do not stop the import — a paper should not be
     * blocked because one row's prose answer disagrees with its letter — but
     * they are shown to the admin, because they are usually authoring mistakes.
     */
    warnings: string[];
    /** Distinct Part Names in first-appearance order — the sections to be created. */
    parts: { name: string; count: number }[];
    /** How many rows expect an image. */
    imageCount: number;
}

const LETTER_TO_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

/** The sheet the Olympiad workbooks put their questions on. */
const PREFERRED_SHEETS = ['Question Bank', 'Trial Questions', 'Questions'];

/** Headers that only exist in the Olympiad format. */
const OLYMPIAD_MARKERS = ['Part Name', 'Correct Option', 'Section Name', 'Part ID'];

/**
 * Column aliases, newest naming first.
 *
 * The approved workbook template was renamed between the trial papers and the
 * v1.0 beta sets — `Part Name` became `Part`, `Bloom Level` grew an apostrophe,
 * `Image Filename` became `Image File`. Both namings are read rather than the
 * parser being switched over, because the older `.xlsm` papers are still in the
 * repo and still importable, and a header rename should never be the thing that
 * silently drops a paper's taxonomy on the floor.
 */
const COLUMNS = {
    partCode: ['Part ID', 'Part Code'],
    partName: ['Part', 'Part Name'],
    sectionCode: ['Section ID', 'Section Code'],
    sectionName: ['Section', 'Section Name'],
    topic: ['Topic'],
    bloomLevel: ["Bloom's Level", 'Bloom Level', 'Blooms Level'],
    imageFilename: ['Image File', 'Image Filename'],
    imageSourceUrl: ['Image Link', 'Image URL'],
    competency: ['Competency Assessed', 'Competency'],
} as const;

const str = (v: unknown): string => (v == null ? '' : String(v).trim());

/**
 * A cell's value, ignoring the workbook's "not applicable" sentinels.
 *
 * The v1.0 sets fill every unused cell with the literal string `NA` rather than
 * leaving it blank — `Image File` reads `NA` on all 31 text-only questions. Read
 * naively that becomes an `imageFilename` of "NA" on every one of them, which
 * turns into 31 unresolvable images and an import report full of noise.
 */
const cell = (row: Record<string, unknown>, names: readonly string[]): string => {
    for (const name of names) {
        const value = str(row[name]);
        if (!value) continue;
        const flat = value.toUpperCase().replace(/[^A-Z]/g, '');
        if (flat === 'NA' || flat === 'NIL' || flat === 'NONE') return '';
        return value;
    }
    return '';
};

const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};

function normaliseDifficulty(raw: string, fallback: Difficulty): Difficulty {
    const up = raw.trim().toUpperCase();
    if (up === 'EASY' || up === 'MEDIUM' || up === 'HARD') return up;
    // The v1.0 sets spell the top band "Difficult", not "Hard". Left unmapped it
    // fell through to the fallback and every hard question imported as EASY,
    // which quietly breaks the paper's easy/medium/hard mix.
    if (up === 'DIFFICULT' || up === 'HARDER' || up === 'TOUGH') return 'HARD';
    if (up === 'MODERATE') return 'MEDIUM';
    return fallback;
}

/**
 * Picks the sheet to read.
 *
 * This matters more than it looks. `Grade_8_Easy_Question_Paper_50.xlsm` has
 * four sheets: the question bank, a five-row "Image Questions" sheet that
 * duplicates rows already in the bank *and has no header row*, and two
 * metadata sheets. Blindly taking `SheetNames[0]` happens to work for that
 * file and would silently import garbage from the next one.
 */
function pickSheet(wb: XLSX.WorkBook): string {
    for (const name of PREFERRED_SHEETS) {
        if (wb.SheetNames.includes(name)) return name;
    }
    // Otherwise the first sheet whose header row looks like questions at all.
    for (const name of wb.SheetNames) {
        const headers = headerRow(wb.Sheets[name]);
        if (headers.includes('Question')) return name;
    }
    return wb.SheetNames[0];
}

function headerRow(sheet: XLSX.WorkSheet): string[] {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
    return (rows[0] ?? []).map((h: unknown) => str(h));
}

/** Reads a workbook and returns questions in whichever format it turns out to be. */
export function parseQuestionWorkbook(buffer: ArrayBuffer): ParseResult {
    const wb = XLSX.read(buffer, { type: 'array' });
    if (wb.SheetNames.length === 0) throw new Error('That workbook has no sheets.');

    const sheetName = pickSheet(wb);
    const sheet = wb.Sheets[sheetName];
    const headers = headerRow(sheet);

    if (!headers.includes('Question')) {
        throw new Error(
            `Sheet "${sheetName}" has no "Question" column. ` +
                `Found: ${headers.filter(Boolean).slice(0, 10).join(', ') || '(empty header row)'}.`,
        );
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
    if (rows.length === 0) throw new Error(`Sheet "${sheetName}" has a header but no rows.`);

    const isOlympiad = OLYMPIAD_MARKERS.some((m) => headers.includes(m));
    if (isOlympiad) return parseOlympiad(rows, sheetName);

    // Fail on the header row, not on row 2. Some older internal question banks
    // use a third layout (`Category` / `Sub-Topic` / `Correct Answer` with no
    // answer *letter* column) that neither parser can read; saying so plainly
    // beats "Row 2: invalid Right Answer".
    if (!headers.includes('Right Answer')) {
        throw new Error(
            `Sheet "${sheetName}" is in an unrecognised format — no "Correct Option" ` +
                `(Olympiad format) and no "Right Answer" (legacy format) column.\n` +
                `Found: ${headers.filter(Boolean).join(', ')}`,
        );
    }
    return parseLegacy(rows, sheetName);
}

function parseOlympiad(rows: Record<string, unknown>[], sheetName: string): ParseResult {
    const warnings: string[] = [];
    const questions: ParsedQuestion[] = [];
    const partCounts = new Map<string, number>();
    let imageCount = 0;

    rows.forEach((row, i) => {
        const rowNo = i + 2; // +1 zero-index, +1 header
        const text = str(row['Question']);
        if (!text) {
            warnings.push(`Row ${rowNo}: no question text — row skipped.`);
            return;
        }

        const letter = str(row['Correct Option']).toUpperCase();
        const correctIdx = LETTER_TO_INDEX[letter];
        if (correctIdx === undefined) {
            warnings.push(`Row ${rowNo}: "Correct Option" is "${letter}" (expected A/B/C/D) — row skipped.`);
            return;
        }

        const options = ['Option A', 'Option B', 'Option C', 'Option D'].map((col, idx) => ({
            text: str(row[col]),
            isCorrect: idx === correctIdx,
        }));
        if (options.some((o) => !o.text)) {
            warnings.push(`Row ${rowNo}: at least one option is blank — row skipped.`);
            return;
        }

        // The workbooks carry the answer twice: as a letter and as prose. When
        // they disagree the letter wins (it is what the option list is built
        // from), but say so — it is nearly always an authoring slip.
        const correctAnswerText = str(row['Correct Answer']);
        if (
            correctAnswerText &&
            correctAnswerText.toLowerCase() !== options[correctIdx].text.toLowerCase()
        ) {
            warnings.push(
                `Row ${rowNo}: "Correct Answer" reads "${correctAnswerText}" but option ${letter} is ` +
                    `"${options[correctIdx].text}". Using option ${letter}.`,
            );
        }

        const partName = cell(row, COLUMNS.partName) || cell(row, COLUMNS.partCode) || 'General';
        partCounts.set(partName, (partCounts.get(partName) ?? 0) + 1);

        const imageFilename = cell(row, COLUMNS.imageFilename);
        const imageSourceUrl = cell(row, COLUMNS.imageSourceUrl);
        if (imageFilename || imageSourceUrl) imageCount++;

        // A row that says it needs a picture but names none is an authoring gap,
        // not a text question — it imports, but it is called out, because the
        // question ("Which chart shows…") is unanswerable without the image.
        if (/^y/i.test(str(row['Visual Required'])) && !imageFilename && !imageSourceUrl) {
            warnings.push(`Row ${rowNo}: "Visual Required" is Yes but no image file is named.`);
        }

        // Everything the student never sees, kept for the authoring trail.
        const metadata: Record<string, unknown> = {};
        for (const [key, col] of [
            ['imageDescription', 'Image Description'],
            ['canvaPrompt', 'Canva Prompt'],
            ['reviewerComments', 'Reviewer Comments'],
            ['reviewerName', 'Reviewer Name'],
            ['version', 'Version'],
            ['questionType', 'Question Type'],
            ['visualRequired', 'Visual Required'],
            ['topicId', 'Topic ID'],
            ['questionSequenceNo', 'Question Sequence No.'],
        ] as const) {
            const value = cell(row, [col]);
            if (value) metadata[key] = value;
        }

        questions.push({
            text,
            options,
            // Every row in these papers is Easy, but honour the column.
            difficulty: normaliseDifficulty(str(row['Difficulty']), 'EASY'),
            // The Olympiad format carries no marks column: one mark per
            // question, no negative marking, matching the published scheme.
            marks: num(row['Marks']) ?? 1,
            negativeMarks: num(row['Negative Marks']) ?? 0,
            explanation: cell(row, ['Explanation']) || undefined,
            externalId: cell(row, ['Question ID']) || undefined,
            grade: num(row['Grade']) !== undefined ? Math.round(num(row['Grade'])!) : undefined,
            partCode: cell(row, COLUMNS.partCode) || undefined,
            partName,
            sectionCode: cell(row, COLUMNS.sectionCode) || undefined,
            sectionName: cell(row, COLUMNS.sectionName) || undefined,
            topic: cell(row, COLUMNS.topic) || undefined,
            learningObjective: cell(row, ['Learning Objective']) || undefined,
            questionCategory: cell(row, ['Question Category']) || undefined,
            bloomLevel: cell(row, COLUMNS.bloomLevel) || undefined,
            competency: cell(row, COLUMNS.competency) || undefined,
            questionFormat: cell(row, ['Question Format']) || undefined,
            futureReadyInsight: cell(row, ['Future Ready Insight']) || undefined,
            imageFilename: imageFilename || undefined,
            imageSourceUrl: imageSourceUrl || undefined,
            metadata: Object.keys(metadata).length ? metadata : undefined,
        });
    });

    if (questions.length === 0) {
        throw new Error(
            `No usable questions in "${sheetName}".\n${warnings.slice(0, 10).join('\n')}`,
        );
    }

    // Duplicate ids are worth flagging: the supplied trial workbook genuinely
    // has one, and it is the kind of thing that quietly breaks a later re-import.
    const seen = new Map<string, number>();
    questions.forEach((q) => {
        if (!q.externalId) return;
        seen.set(q.externalId, (seen.get(q.externalId) ?? 0) + 1);
    });
    seen.forEach((count, id) => {
        if (count > 1) warnings.push(`Question ID "${id}" appears ${count} times in this workbook.`);
    });

    const parts: { name: string; count: number }[] = [];
    partCounts.forEach((count, name) => parts.push({ name, count }));

    return {
        format: 'olympiad',
        questions,
        sheetName,
        warnings,
        parts,
        imageCount,
    };
}

function parseLegacy(rows: Record<string, unknown>[], sheetName: string): ParseResult {
    const warnings: string[] = [];
    const questions: ParsedQuestion[] = rows.map((row, i) => {
        const rowNo = i + 2;
        const letter = str(row['Right Answer']).toUpperCase();
        const correctIdx = LETTER_TO_INDEX[letter];
        if (correctIdx === undefined) {
            throw new Error(`Row ${rowNo}: invalid "Right Answer" "${letter}" (expected A/B/C/D)`);
        }
        const text = str(row['Question']);
        if (!text) throw new Error(`Row ${rowNo}: missing Question text`);

        const difficulty = normaliseDifficulty(str(row['Difficulty Level']), 'MEDIUM');
        const marksRaw = num(row['Marks']);
        const marks =
            marksRaw !== undefined && marksRaw > 0
                ? marksRaw
                : difficulty === 'HARD'
                  ? 3
                  : difficulty === 'MEDIUM'
                    ? 2
                    : 1;
        const negRaw = num(row['Negative Marks']);

        return {
            text,
            difficulty,
            marks,
            negativeMarks: negRaw !== undefined && negRaw >= 0 ? negRaw : 0,
            options: ['Option A', 'Option B', 'Option C', 'Option D'].map((col, idx) => ({
                text: str(row[col]),
                isCorrect: idx === correctIdx,
            })),
        };
    });

    return {
        format: 'legacy',
        questions,
        sheetName,
        warnings,
        parts: [],
        imageCount: 0,
    };
}

/** The payload shape `POST /admin/questions/bulk` and friends expect. */
export function toBankPayload(q: ParsedQuestion) {
    return {
        type: 'MCQ' as const,
        difficulty: q.difficulty,
        text: q.text,
        options: q.options,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        ...(q.explanation ? { explanation: q.explanation } : {}),
        ...(q.externalId ? { externalId: q.externalId } : {}),
        ...(q.grade !== undefined ? { grade: q.grade } : {}),
        ...(q.partCode ? { partCode: q.partCode } : {}),
        ...(q.partName ? { partName: q.partName } : {}),
        ...(q.sectionCode ? { sectionCode: q.sectionCode } : {}),
        ...(q.sectionName ? { sectionName: q.sectionName } : {}),
        ...(q.topic ? { topic: q.topic } : {}),
        ...(q.learningObjective ? { learningObjective: q.learningObjective } : {}),
        ...(q.questionCategory ? { questionCategory: q.questionCategory } : {}),
        ...(q.bloomLevel ? { bloomLevel: q.bloomLevel } : {}),
        ...(q.competency ? { competency: q.competency } : {}),
        ...(q.questionFormat ? { questionFormat: q.questionFormat } : {}),
        ...(q.futureReadyInsight ? { futureReadyInsight: q.futureReadyInsight } : {}),
        ...(q.imageFilename ? { imageFilename: q.imageFilename } : {}),
        ...(q.imageSourceUrl ? { imageSourceUrl: q.imageSourceUrl } : {}),
        ...(q.metadata ? { metadata: q.metadata } : {}),
    };
}

/** File types the pickers accept. `.xlsm` matters — both current papers are macro-enabled. */
export const WORKBOOK_ACCEPT = '.xlsx,.xls,.xlsm,.csv';
