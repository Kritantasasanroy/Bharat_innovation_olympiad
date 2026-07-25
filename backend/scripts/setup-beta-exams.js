/**
 * Stand up the beta: the Grade 8 paper with its slots, the trial paper that
 * gates it, and the retirement of everything else.
 *
 * Drives the admin REST API rather than Prisma directly, so it goes through the
 * same validation, section-building and gating the admin portal does — if this
 * script can produce the exam, so can a human with the UI.
 *
 * Safe to re-run. Exams are matched by title and updated in place; the question
 * import replaces the paper rather than appending it; slots are matched by
 * start time so a second run does not double them.
 *
 * Usage (from backend/):
 *   node scripts/setup-beta-exams.js
 *   node scripts/setup-beta-exams.js --dry-run      # report, change nothing
 *   node scripts/setup-beta-exams.js --skip-archive # leave other exams alone
 *
 * Env: API_URL (default http://localhost:4000/api), ADMIN_EMAIL, ADMIN_PASSWORD
 */

const path = require('path');
const XLSX = require(path.resolve(__dirname, '..', '..', 'node_modules', 'xlsx'));

const API_URL = (process.env.API_URL || 'http://localhost:4000/api').replace(/\/+$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@bharatolympiad.in';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'BIO@Admin2025';

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_ARCHIVE = process.argv.includes('--skip-archive');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ── What we are building ────────────────────────────────────────────────────

const MAIN_EXAM = {
    title: 'Bharat Innovation Olympiad — Grade 8',
    description:
        'The Grade 8 Innovation Olympiad paper. 50 questions across five future-ready ' +
        'dimensions, sat one section at a time. One mark per question, no negative marking.',
    workbook: 'Grade_8_Easy_Question_Paper_50.xlsm',
    classBands: [8],
    durationMinutes: 60,
    totalMarks: 50,
};

const TRIAL_EXAM = {
    title: 'Trial Test — Get Exam Ready',
    description:
        'A short practice run in exactly the same environment as the real exam: fullscreen, ' +
        'webcam proctoring and the live timer. Not scored, and you can retake it as often as you like.',
    workbook: 'Trial_Test_5_Questions.xlsm',
    // Every grade sees the same rehearsal, so it must cover the full range.
    classBands: [6, 7, 8, 9, 10, 11, 12],
    durationMinutes: 10,
};

/**
 * The exam window and the sittings inside it, in IST.
 *
 * Slots are declared in IST and converted here rather than being written as
 * UTC literals, because "1 PM and 7 PM" is the thing that has to stay true —
 * a UTC literal silently becomes the wrong local time the moment anyone edits
 * it without doing the arithmetic.
 */
const IST_OFFSET_MIN = 5 * 60 + 30;

/** An IST wall-clock time as a real UTC Date. */
function ist(year, month, day, hour, minute = 0) {
    return new Date(Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MIN * 60_000);
}

const SCHEDULE = {
    year: 2026,
    // 26 July → 2 August inclusive.
    days: [
        [7, 26], [7, 27], [7, 28], [7, 29], [7, 30], [7, 31],
        [8, 1], [8, 2],
    ],
    // Two sittings a day.
    times: [
        { label: 'Afternoon · 1:00 PM', hour: 13 },
        { label: 'Evening · 7:00 PM', hour: 19 },
    ],
    capacityPerSlot: Number(process.env.SLOT_CAPACITY || 500),
};

// ── Plumbing ────────────────────────────────────────────────────────────────

const LETTER_TO_INDEX = { A: 0, B: 1, C: 2, D: 3 };
const PREFERRED_SHEETS = ['Question Bank', 'Trial Questions', 'Questions'];

const str = (v) => (v == null ? '' : String(v).trim());
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);

async function api(method, pathSuffix, token, body) {
    const res = await fetch(`${API_URL}${pathSuffix}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
        throw new Error(
            `${method} ${pathSuffix} → ${res.status}: ` +
            (typeof data === 'string' ? data : JSON.stringify(data)),
        );
    }
    return data;
}

/**
 * Reads the Olympiad 30-column workbook.
 *
 * Mirrors `admin-frontend/src/lib/questionWorkbook.ts` — the admin portal and
 * this script must agree on what a workbook means, or a paper set up here
 * differs from one an admin uploads.
 */
function parseWorkbook(file) {
    const wb = XLSX.readFile(path.resolve(REPO_ROOT, file));
    const sheetName =
        PREFERRED_SHEETS.find((n) => wb.SheetNames.includes(n)) ?? wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });

    const questions = [];
    const warnings = [];
    const seenIds = new Map();

    rows.forEach((row, i) => {
        const rowNo = i + 2;
        const text = str(row['Question']);
        if (!text) return;

        const letter = str(row['Correct Option']).toUpperCase();
        const correctIdx = LETTER_TO_INDEX[letter];
        if (correctIdx === undefined) {
            warnings.push(`Row ${rowNo}: Correct Option "${letter}" is not A/B/C/D — skipped.`);
            return;
        }

        const options = ['Option A', 'Option B', 'Option C', 'Option D'].map((col, idx) => ({
            text: str(row[col]),
            isCorrect: idx === correctIdx,
        }));
        if (options.some((o) => !o.text)) {
            warnings.push(`Row ${rowNo}: blank option — skipped.`);
            return;
        }

        const answerText = str(row['Correct Answer']);
        if (answerText && answerText.toLowerCase() !== options[correctIdx].text.toLowerCase()) {
            warnings.push(
                `Row ${rowNo}: "Correct Answer" says "${answerText}" but option ${letter} is ` +
                `"${options[correctIdx].text}" — using option ${letter}.`,
            );
        }

        // Question IDs are not unique in every supplied workbook (the trial file
        // reuses one). Suffix the repeats so the id stays a usable handle for
        // finding a specific question later.
        let externalId = str(row['Question ID']) || undefined;
        if (externalId) {
            const seen = (seenIds.get(externalId) ?? 0) + 1;
            seenIds.set(externalId, seen);
            if (seen > 1) {
                warnings.push(`Row ${rowNo}: duplicate Question ID "${externalId}" → "${externalId}-${seen}".`);
                externalId = `${externalId}-${seen}`;
            }
        }

        const metadata = {};
        for (const [key, col] of [
            ['imageDescription', 'Image Description'],
            ['canvaPrompt', 'Canva Prompt'],
            ['reviewerComments', 'Reviewer Comments'],
            ['version', 'Version'],
            ['questionType', 'Question Type'],
            ['visualRequired', 'Visual Required'],
        ]) {
            const value = str(row[col]);
            if (value) metadata[key] = value;
        }

        const difficulty = str(row['Difficulty']).toUpperCase();
        questions.push({
            text,
            options,
            difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(difficulty) ? difficulty : 'EASY',
            marks: 1,
            negativeMarks: 0,
            explanation: str(row['Explanation']) || undefined,
            externalId,
            grade: num(row['Grade']) !== undefined ? Math.round(num(row['Grade'])) : undefined,
            partCode: str(row['Part Code']) || undefined,
            partName: str(row['Part Name']) || str(row['Part Code']) || 'General',
            sectionCode: str(row['Section Code']) || undefined,
            sectionName: str(row['Section Name']) || undefined,
            topic: str(row['Topic']) || undefined,
            learningObjective: str(row['Learning Objective']) || undefined,
            questionCategory: str(row['Question Category']) || undefined,
            bloomLevel: str(row['Bloom Level']) || undefined,
            competency: str(row['Competency Assessed']) || undefined,
            questionFormat: str(row['Question Format']) || undefined,
            futureReadyInsight: str(row['Future Ready Insight']) || undefined,
            imageFilename: str(row['Image Filename']) || undefined,
            imageSourceUrl: str(row['Image Link']) || undefined,
            metadata: Object.keys(metadata).length ? metadata : undefined,
        });
    });

    return { sheetName, questions, warnings };
}

/** Create the exam if it does not exist, else return the existing row. */
async function upsertExam(token, allExams, spec, extra) {
    const existing = allExams.find((e) => e.title === spec.title);
    if (existing) {
        console.log(`  exam "${spec.title}" exists (${existing.id}) — updating`);
        if (!DRY_RUN) {
            await api('PUT', `/admin/exams/${existing.id}`, token, {
                description: spec.description,
                classBands: spec.classBands,
                durationMinutes: spec.durationMinutes,
                totalMarks: spec.totalMarks,
                ...extra,
            });
        }
        return existing;
    }

    console.log(`  creating exam "${spec.title}"`);
    if (DRY_RUN) return { id: '<dry-run>', title: spec.title };
    return api('POST', '/admin/exams', token, {
        title: spec.title,
        description: spec.description,
        classBands: spec.classBands,
        totalMarks: spec.totalMarks,
        durationMinutes: spec.durationMinutes,
        ...extra,
    });
}

(async () => {
    console.log(`API_URL = ${API_URL}`);
    if (DRY_RUN) console.log('DRY RUN — nothing will be written.\n');

    // ── Read both workbooks before touching anything ──
    // A typo in the Excel should fail the run before it has half-built an exam.
    const main = parseWorkbook(MAIN_EXAM.workbook);
    const trial = parseWorkbook(TRIAL_EXAM.workbook);

    for (const [name, parsed] of [['Grade 8', main], ['Trial', trial]]) {
        const parts = [...new Set(parsed.questions.map((q) => q.partName))];
        console.log(
            `${name}: sheet "${parsed.sheetName}", ${parsed.questions.length} questions, ` +
            `${parts.length} sections (${parts.join(', ')})`,
        );
        parsed.warnings.forEach((w) => console.warn(`  ! ${w}`));
    }
    if (main.questions.length === 0 || trial.questions.length === 0) {
        throw new Error('One of the workbooks produced no questions — aborting.');
    }
    console.log('');

    // ── Login ──
    const { accessToken: token } = await api('POST', '/auth/admin-login', null, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
    });
    const allExams = await api('GET', '/admin/exams?includeArchived=true', token);
    console.log(`Found ${allExams.length} existing exams.\n`);

    // ── 1. Trial paper ──
    console.log('1. Trial test');
    const trialExam = await upsertExam(token, allExams, TRIAL_EXAM, {
        isTrial: true,
        requiresTrial: false,
        feeAmount: 0,
    });

    if (!DRY_RUN) {
        await api('POST', `/admin/exams/${trialExam.id}/questions/import`, token, {
            questions: trial.questions,
            replaceExisting: true,
        });
        // A wide window with no slots: the rehearsal has to be available the
        // instant a student needs it, which is any time before their sitting.
        await ensureInstance(token, trialExam.id, {
            startsAt: ist(2026, 1, 1, 0).toISOString(),
            endsAt: ist(2027, 12, 31, 23, 59).toISOString(),
        });
        await api('POST', `/admin/exams/${trialExam.id}/publish`, token);
        console.log('  imported, scheduled and published\n');
    }

    // ── 2. Grade 8 paper ──
    console.log('2. Grade 8 paper');
    const mainExam = await upsertExam(token, allExams, MAIN_EXAM, {
        isTrial: false,
        requiresTrial: true,
    });

    let instance = null;
    if (!DRY_RUN) {
        const result = await api('POST', `/admin/exams/${mainExam.id}/questions/import`, token, {
            questions: main.questions,
            replaceExisting: true,
        });
        console.log(
            `  imported ${result.questionCount} questions into ${result.sections.length} sections:`,
        );
        result.sections.forEach((s) => console.log(`    • ${s.title} — ${s.questions}`));
        if (result.imagesUnresolved?.length) {
            console.warn(
                `  ! ${result.imagesUnresolved.length} question(s) still need an image. ` +
                'Run "Sync from Drive" on the Media Gallery, then re-run this script.',
            );
        }

        const first = SCHEDULE.days[0];
        const last = SCHEDULE.days[SCHEDULE.days.length - 1];
        instance = await ensureInstance(token, mainExam.id, {
            startsAt: ist(SCHEDULE.year, first[0], first[1], 0, 0).toISOString(),
            endsAt: ist(SCHEDULE.year, last[0], last[1], 23, 59).toISOString(),
        });
    }

    // ── 3. Slots: two a day across the window ──
    console.log('\n3. Exam slots');
    if (!DRY_RUN && instance) {
        const existingSlots = await api('GET', `/admin/slots?examInstanceId=${instance.id}`, token)
            .catch(() => []);
        const haveStarts = new Set(
            (Array.isArray(existingSlots) ? existingSlots : [])
                .filter((s) => s.examInstanceId === instance.id)
                .map((s) => new Date(s.startsAt).toISOString()),
        );

        let created = 0;
        for (const [month, day] of SCHEDULE.days) {
            for (const time of SCHEDULE.times) {
                const startsAt = ist(SCHEDULE.year, month, day, time.hour);
                const endsAt = new Date(startsAt.getTime() + MAIN_EXAM.durationMinutes * 60_000);
                if (haveStarts.has(startsAt.toISOString())) continue;

                const date = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
                await api('POST', '/admin/slots', token, {
                    examInstanceId: instance.id,
                    label: `${date} · ${time.label}`,
                    startsAt: startsAt.toISOString(),
                    endsAt: endsAt.toISOString(),
                    capacity: SCHEDULE.capacityPerSlot,
                });
                created++;
            }
        }
        console.log(
            `  ${created} slot(s) created, ${haveStarts.size} already existed ` +
            `(capacity ${SCHEDULE.capacityPerSlot} each)`,
        );
        console.log('  NOTE: auto-distribution is deliberately NOT run — students pick their own slot.');

        await api('POST', `/admin/exams/${mainExam.id}/publish`, token);
        console.log('  exam published');
    } else {
        const total = SCHEDULE.days.length * SCHEDULE.times.length;
        console.log(`  would create ${total} slots (${SCHEDULE.days.length} days × ${SCHEDULE.times.length})`);
    }

    // ── 4. Retire everything else ──
    console.log('\n4. Retiring other exams');
    if (SKIP_ARCHIVE) {
        console.log('  skipped (--skip-archive)');
    } else if (DRY_RUN) {
        const others = allExams.filter(
            (e) => !e.isArchived && !e.isTrial && e.id !== mainExam.id,
        );
        console.log(`  would archive ${others.length}: ${others.map((e) => e.title).join(', ') || '(none)'}`);
    } else {
        // Unpublish + hide, never delete: these exams still own real attempts,
        // payments and certificates. Practice and trial papers are exempt.
        const res = await api('POST', '/admin/exams/archive-others', token, {
            keepExamIds: [mainExam.id, trialExam.id],
        });
        console.log(`  archived ${res.archived}: ${res.exams.map((e) => e.title).join(', ') || '(none)'}`);
    }

    console.log('\nDone.');
})().catch((err) => {
    console.error(`\nFAILED: ${err.message}`);
    process.exit(1);
});

/** Reuse the exam's existing sitting window if it has one, else create it. */
async function ensureInstance(token, examId, window) {
    const instances = await api('GET', `/admin/exams/${examId}/instances`, token).catch(() => []);
    const list = Array.isArray(instances) ? instances : [];
    if (list.length > 0) {
        const updated = await api('PUT', `/admin/instances/${list[0].id}`, token, window);
        console.log(`  window updated: ${window.startsAt} → ${window.endsAt}`);
        return updated ?? list[0];
    }
    const created = await api('POST', `/admin/exams/${examId}/instances`, token, window);
    console.log(`  window created: ${window.startsAt} → ${window.endsAt}`);
    return created;
}
