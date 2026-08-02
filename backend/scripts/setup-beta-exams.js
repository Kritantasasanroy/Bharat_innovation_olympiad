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
 *   node scripts/setup-beta-exams.js --dry-run        # report, change nothing
 *   node scripts/setup-beta-exams.js --skip-archive   # leave other exams alone
 *   node scripts/setup-beta-exams.js --questions-only # ONLY re-import both papers
 *
 * `--questions-only` exists because replacing a question paper and re-cutting the
 * timetable are different jobs with very different blast radii. Loading a
 * corrected workbook should not also delete slots, move the exam window, or
 * archive other exams — and it should not require an operator to reason about
 * which of those side effects they are about to trigger.
 *
 * Env: API_URL (default http://localhost:4000/api), ADMIN_EMAIL, ADMIN_PASSWORD,
 *      MAIN_WORKBOOK (override the Grade 8 paper), IMPORT_QUESTIONS=true
 */

const path = require('path');

/**
 * `xlsx` is a dependency of admin-frontend, not backend, so it is not resolvable
 * from here by name. Try the places it actually lives rather than hard-coding
 * one — the old seed script pointed at a repo-root `node_modules/xlsx` that does
 * not exist, and died before printing anything useful.
 */
const XLSX = (() => {
    const candidates = [
        path.resolve(__dirname, '..', '..', 'admin-frontend', 'node_modules', 'xlsx'),
        path.resolve(__dirname, '..', '..', 'node_modules', 'xlsx'),
        path.resolve(__dirname, '..', 'node_modules', 'xlsx'),
        'xlsx',
    ];
    for (const c of candidates) {
        try { return require(c); } catch { /* try the next one */ }
    }
    throw new Error(
        'Could not load the "xlsx" package. Run `npm install` in admin-frontend/, ' +
        'or `npm install xlsx` in backend/.',
    );
})();

const API_URL = (process.env.API_URL || 'http://localhost:4000/api').replace(/\/+$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@bharatolympiad.in';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'BIO@Admin2025';

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_ARCHIVE = process.argv.includes('--skip-archive');
const QUESTIONS_ONLY = process.argv.includes('--questions-only');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ── What we are building ────────────────────────────────────────────────────

/**
 * The live paper.
 *
 * `titleMatches` exists because the exam already exists in production under a
 * hand-typed name. Matching on it means this script *adopts* that exam and
 * re-slots it, rather than creating a near-duplicate alongside it — which is
 * exactly what a title-only match would have done.
 */
const MAIN_EXAM = {
    title: process.env.MAIN_EXAM_TITLE || 'Bharat Innovation Olympiad — Class 8',
    /**
     * `Bharat Innovation Olympiad` — no grade suffix — is the exam the beta is
     * actually being sat on, and it is listed first so a run adopts it rather
     * than creating a near-duplicate beside it.
     */
    titleMatches: [
        'Bharat Innovation Olympiad',
        'Bharat Innovation Olympiad — Class 8',
        'Bharat Innovation Olympiad — Grade 8',
        'Bharat Innovation Olympiad - Class 8',
    ],
    description:
        'The Class 8 Innovation Olympiad paper. 50 questions across five future-ready ' +
        'dimensions, sat one section at a time. One mark per question, no negative marking.',
    workbook: process.env.MAIN_WORKBOOK || 'Grade_08_Beta_Question_Set_01_v1.0.xlsx',
    /**
     * Left off the update payload in `--questions-only` mode. The live beta exam
     * is open to grades 6–12 even though this paper is written for Grade 8, and
     * narrowing it here as a side effect of loading questions would lock every
     * other grade's testers out of the beta mid-flight.
     */
    classBands: [8],
    durationMinutes: 60,
    totalMarks: 50,
    /** Set IMPORT_QUESTIONS=true to re-import the paper; off by default so a
     *  re-slot never silently rewrites 50 live questions. Implied by
     *  `--questions-only`, which has no other purpose. */
    importQuestions: process.env.IMPORT_QUESTIONS === 'true' || QUESTIONS_ONLY,
};

const TRIAL_EXAM = {
    title: 'Trial Test — Get Exam Ready',
    titleMatches: ['Trial Test — Get Exam Ready', 'Trial Test - Get Exam Ready'],
    description:
        'A short practice run in exactly the same environment as the real exam: fullscreen, ' +
        'webcam proctoring and the live timer. Not scored, and you can retake it as often as you like.',
    workbook: 'Trial_Test_5_Questions.xlsm',
    // Every grade sees the same rehearsal, so it must cover the full range.
    // The gate itself is grade-blind — `findActiveTrialExam` filters on
    // `isTrial` only — but the bands keep the exam coherent for admins.
    classBands: [6, 7, 8, 9, 10, 11, 12],
    durationMinutes: 10,
    // One mark per trial question. Never actually scored, but `POST /admin/exams`
    // requires a number and a 0 here would read as a misconfigured paper.
    totalMarks: 6,
    importQuestions: true,
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

/** Column aliases, newest naming first. Mirrors `COLUMNS` in questionWorkbook.ts. */
const COLUMNS = {
    partCode: ['Part ID', 'Part Code'],
    partName: ['Part', 'Part Name'],
    sectionCode: ['Section ID', 'Section Code'],
    sectionName: ['Section', 'Section Name'],
    bloomLevel: ["Bloom's Level", 'Bloom Level', 'Blooms Level'],
    imageFilename: ['Image File', 'Image Filename'],
    imageSourceUrl: ['Image Link', 'Image URL'],
    competency: ['Competency Assessed', 'Competency'],
};

const str = (v) => (v == null ? '' : String(v).trim());
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);

/**
 * A cell's value, ignoring the "not applicable" sentinels the v1.0 sets write
 * into every unused cell. Without this, `Image File` = "NA" on the 31 text-only
 * questions becomes 31 images that can never resolve.
 */
const cell = (row, names) => {
    for (const name of names) {
        const value = str(row[name]);
        if (!value) continue;
        const flat = value.toUpperCase().replace(/[^A-Z]/g, '');
        if (flat === 'NA' || flat === 'NIL' || flat === 'NONE') return '';
        return value;
    }
    return '';
};

/** "Difficult" is how the v1.0 sets spell the top band. */
function normaliseDifficulty(raw) {
    const up = str(raw).toUpperCase();
    if (['EASY', 'MEDIUM', 'HARD'].includes(up)) return up;
    if (['DIFFICULT', 'HARDER', 'TOUGH'].includes(up)) return 'HARD';
    if (up === 'MODERATE') return 'MEDIUM';
    return 'EASY';
}

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
            ['reviewerName', 'Reviewer Name'],
            ['version', 'Version'],
            ['questionType', 'Question Type'],
            ['visualRequired', 'Visual Required'],
            ['topicId', 'Topic ID'],
            ['questionSequenceNo', 'Question Sequence No.'],
        ]) {
            const value = cell(row, [col]);
            if (value) metadata[key] = value;
        }

        const imageFilename = cell(row, COLUMNS.imageFilename);
        const imageSourceUrl = cell(row, COLUMNS.imageSourceUrl);
        if (/^y/i.test(str(row['Visual Required'])) && !imageFilename && !imageSourceUrl) {
            warnings.push(`Row ${rowNo}: "Visual Required" is Yes but no image file is named.`);
        }

        questions.push({
            text,
            options,
            difficulty: normaliseDifficulty(row['Difficulty']),
            marks: 1,
            negativeMarks: 0,
            explanation: cell(row, ['Explanation']) || undefined,
            externalId,
            grade: num(row['Grade']) !== undefined ? Math.round(num(row['Grade'])) : undefined,
            partCode: cell(row, COLUMNS.partCode) || undefined,
            partName: cell(row, COLUMNS.partName) || cell(row, COLUMNS.partCode) || 'General',
            sectionCode: cell(row, COLUMNS.sectionCode) || undefined,
            sectionName: cell(row, COLUMNS.sectionName) || undefined,
            topic: cell(row, ['Topic']) || undefined,
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

    return { sheetName, questions, warnings };
}

/**
 * Find the exam this spec refers to.
 *
 * Matches on `isTrial` first (a trial is identified by its flag, not its name,
 * so renaming it in the admin UI does not orphan it), then on any of the
 * accepted titles. Falls back to `title` alone.
 */
function findExam(allExams, spec, wantTrial = false) {
    if (wantTrial) {
        const flagged = allExams.find((e) => e.isTrial);
        if (flagged) return flagged;
    }
    const titles = spec.titleMatches || [spec.title];
    const norm = (t) => (t || '').replace(/[—–-]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
    return allExams.find((e) => titles.some((t) => norm(t) === norm(e.title)));
}

/** Create the exam if it does not exist, else return the existing row. */
async function upsertExam(token, allExams, spec, extra, wantTrial = false) {
    const existing = findExam(allExams, spec, wantTrial);
    if (existing) {
        console.log(`  adopting existing exam "${existing.title}" (${existing.id})`);
        // In `--questions-only` mode the exam's own settings are left exactly as
        // an admin left them. Rewriting classBands/duration/marks here is how a
        // "just reload the questions" run would quietly re-scope a live exam.
        if (!DRY_RUN && !QUESTIONS_ONLY) {
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
    }, true);

    if (!DRY_RUN) {
        await api('POST', `/admin/exams/${trialExam.id}/questions/import`, token, {
            questions: trial.questions,
            replaceExisting: true,
        });
        if (QUESTIONS_ONLY) {
            console.log('  questions re-imported (window, slots and publish left alone)\n');
        } else {
            // A wide window with no slots: the rehearsal has to be available the
            // instant a student needs it, which is any time before their sitting.
            await ensureInstance(token, trialExam.id, {
                startsAt: ist(2026, 1, 1, 0).toISOString(),
                endsAt: ist(2027, 12, 31, 23, 59).toISOString(),
            });
            await api('POST', `/admin/exams/${trialExam.id}/publish`, token);
            console.log('  imported, scheduled and published\n');
        }
    }

    // ── 2. The live paper ──
    console.log('2. Main paper');
    const mainExam = await upsertExam(token, allExams, MAIN_EXAM, {
        isTrial: false,
        requiresTrial: true,
    });
    if (!findExam(allExams, MAIN_EXAM)) {
        console.log(`  (no existing exam matched — created "${MAIN_EXAM.title}")`);
    }

    let instance = null;
    if (!DRY_RUN) {
        // Questions are NOT re-imported by default. The exam already carries a
        // reviewed 50-question paper; silently replacing it on a run whose
        // purpose is to fix the slots would be a destructive surprise.
        if (MAIN_EXAM.importQuestions) {
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
                    `  ! ${result.imagesUnresolved.length} question(s) still need an image: ` +
                    `${result.imagesUnresolved.map((u) => u.wanted).join(', ')}`,
                );
                console.warn(
                    '    Run "Sync from Drive" on the Media Gallery, then re-run this import.',
                );
            } else {
                console.log('  every image referenced by the workbook resolved from the gallery');
            }
        } else {
            console.log(
                `  questions left untouched (${mainExam.questionCount ?? '?'} already attached). ` +
                'Set IMPORT_QUESTIONS=true to replace the paper from the workbook.',
            );
        }

        if (!QUESTIONS_ONLY) {
            const first = SCHEDULE.days[0];
            const last = SCHEDULE.days[SCHEDULE.days.length - 1];
            instance = await ensureInstance(token, mainExam.id, {
                startsAt: ist(SCHEDULE.year, first[0], first[1], 0, 0).toISOString(),
                endsAt: ist(SCHEDULE.year, last[0], last[1], 23, 59).toISOString(),
            });
        }
    }

    if (QUESTIONS_ONLY) {
        console.log('\n--questions-only: slots, exam window and archiving all skipped.');
        console.log('\nDone.');
        return;
    }

    // ── 3. Slots: two a day across the window ──
    console.log('\n3. Exam slots');
    if (!DRY_RUN && instance) {
        // The schedule is authoritative: any slot on this exam that is not in it
        // gets removed. The exam carried five stale sittings from 14–15 July
        // with four-hour windows, and merely *adding* the correct ones would
        // have left students able to book the wrong thing.
        //
        // A slot with bookings is never deleted — a student holding it would
        // lose their sitting silently. Those are reported for a human to move.
        const allSlots = await api('GET', '/admin/slots', token).catch(() => []);
        const mine = (Array.isArray(allSlots) ? allSlots : []).filter(
            (s) => s.examInstanceId === instance.id,
        );

        const wanted = [];
        for (const [month, day] of SCHEDULE.days) {
            for (const time of SCHEDULE.times) {
                const startsAt = ist(SCHEDULE.year, month, day, time.hour);
                wanted.push({
                    startsAt,
                    endsAt: new Date(startsAt.getTime() + MAIN_EXAM.durationMinutes * 60_000),
                    label: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')} · ${time.label}`,
                });
            }
        }
        const wantedStarts = new Set(wanted.map((w) => w.startsAt.toISOString()));

        let removed = 0;
        const keptWithBookings = [];
        for (const slot of mine) {
            if (wantedStarts.has(new Date(slot.startsAt).toISOString())) continue;
            if ((slot.booked ?? 0) > 0) {
                keptWithBookings.push(slot);
                continue;
            }
            await api('DELETE', `/admin/slots/${slot.id}`, token).catch((e) =>
                console.warn(`  ! could not delete slot ${slot.id}: ${e.message}`),
            );
            removed++;
        }

        const haveStarts = new Set(mine.map((s) => new Date(s.startsAt).toISOString()));
        let created = 0;
        for (const w of wanted) {
            if (haveStarts.has(w.startsAt.toISOString())) continue;
            await api('POST', '/admin/slots', token, {
                examInstanceId: instance.id,
                label: w.label,
                startsAt: w.startsAt.toISOString(),
                endsAt: w.endsAt.toISOString(),
                capacity: SCHEDULE.capacityPerSlot,
            });
            created++;
        }

        console.log(
            `  ${removed} stale slot(s) removed, ${created} created, ` +
            `${wanted.length} in the schedule (capacity ${SCHEDULE.capacityPerSlot} each)`,
        );
        console.log(`  ${SCHEDULE.days.length} days × ${SCHEDULE.times.length}/day — 1:00 PM and 7:00 PM IST`);
        if (keptWithBookings.length) {
            console.warn(
                `  ! ${keptWithBookings.length} off-schedule slot(s) kept because students are booked into them:`,
            );
            keptWithBookings.forEach((s) =>
                console.warn(`      ${s.id}  ${s.startsAt}  booked=${s.booked}  "${s.label ?? ''}"`),
            );
            console.warn('      Reassign those bookings from /slots, then re-run.');
        }
        console.log('  NOTE: auto-distribution is deliberately NOT run — students pick their own slot.');

        await api('POST', `/admin/exams/${mainExam.id}/publish`, token);
        console.log('  exam published');
    } else {
        const total = SCHEDULE.days.length * SCHEDULE.times.length;
        console.log(`  would replace all slots with ${total} (${SCHEDULE.days.length} days × ${SCHEDULE.times.length})`);
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
