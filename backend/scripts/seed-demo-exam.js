/**
 * Strip the demo exam back to bare metadata, then repopulate it from the
 * Excel sheet using the admin REST API the same way the admin portal
 * would. Safe to re-run.
 *
 * Usage (from backend/):  node scripts/seed-demo-exam.js
 * Optional env: API_URL (default http://localhost:4000/api), DEMO_EXAM_ID
 */

const path = require('path');
const XLSX = require(path.resolve(__dirname, '..', '..', 'node_modules', 'xlsx'));

const API_URL = (process.env.API_URL || 'http://localhost:4000/api').replace(/\/+$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@bharatolympiad.in';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'BIO@Admin2025';
const DEMO_EXAM_ID = process.env.DEMO_EXAM_ID || '0b95a4e0-66a6-4104-aa44-0c1c314f2fab';
const XLSX_PATH = path.resolve(__dirname, '..', '..', 'Innovation_Olympiad_25Q_Mixed.xlsx');

const MARKS_BY_DIFFICULTY = { Easy: 1, Medium: 2, Hard: 3 };
const LETTER_TO_INDEX = { A: 0, B: 1, C: 2, D: 3 };

// Collapse near-duplicate Excel categories into a single section.
// Keyed by the Excel "Question Category" value; the value is the
// canonical section title we want to end up with.
const CATEGORY_ALIASES = {
    'AI / STEM': 'STEM',
    'Entrepreneurship / Startup Trends': 'Entrepreneurship',
    'Startup Trends': 'Entrepreneurship',
};

// Per-row overrides for questions that don't fit the single-correct MCQ
// schema. Keyed by the original Excel question text.
const QUESTION_OVERRIDES = {
    'WHICH TWO are startup funding sources? (Select 2)': {
        text: 'Which of the following is a startup funding source?',
        rightAnswer: 'A',
    },
};

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
        throw new Error(`${method} ${pathSuffix} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }
    return data;
}

(async () => {
    console.log(`API_URL=${API_URL}`);
    console.log(`DEMO_EXAM_ID=${DEMO_EXAM_ID}`);
    console.log(`XLSX=${XLSX_PATH}`);

    // ── Parse Excel ──
    const wb = XLSX.readFile(XLSX_PATH);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
    if (rows.length !== 25) console.warn(`Expected 25 rows, got ${rows.length}`);

    // Build sections in order of first appearance, by category
    // (after collapsing aliases so near-duplicates become one section)
    const sectionsOrder = [];
    const bySection = new Map();
    for (const row of rows) {
        const rawCat = row['Question Category'] || 'General';
        const cat = CATEGORY_ALIASES[rawCat] ?? rawCat;
        if (!bySection.has(cat)) {
            bySection.set(cat, []);
            sectionsOrder.push(cat);
        }
        bySection.get(cat).push(row);
    }
    let totalMarks = 0;
    for (const row of rows) totalMarks += (MARKS_BY_DIFFICULTY[row['Difficulty Level']] ?? 1);
    console.log(`Sections (${sectionsOrder.length}):`, sectionsOrder.map(c => `${c}(${bySection.get(c).length})`).join(', '));
    console.log(`Total marks: ${totalMarks}`);

    // ── Login ──
    console.log('Logging in as admin...');
    const login = await api('POST', '/auth/admin-login', null, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    const token = login.accessToken;

    // ── Fetch current exam → existing sections ──
    console.log('Fetching current exam...');
    const exam = await api('GET', `/exams/${DEMO_EXAM_ID}`, token);
    console.log(`Current: title="${exam.title}", sections=${(exam.sections||[]).length}, duration=${exam.durationMinutes}, totalMarks=${exam.totalMarks}`);

    // ── Strip existing sections (cascades questions) ──
    for (const s of (exam.sections || [])) {
        await api('DELETE', `/admin/sections/${s.id}`, token);
        console.log(`  deleted section ${s.id} "${s.title}"`);
    }

    // ── Update exam metadata ──
    await api('PUT', `/admin/exams/${DEMO_EXAM_ID}`, token, {
        durationMinutes: 30,
        totalMarks,
    });
    console.log(`Updated exam: durationMinutes=30, totalMarks=${totalMarks}`);

    // ── Create sections + questions ──
    for (let i = 0; i < sectionsOrder.length; i++) {
        const cat = sectionsOrder[i];
        const sec = await api('POST', `/admin/exams/${DEMO_EXAM_ID}/sections`, token, {
            title: cat,
            sortOrder: i,
        });
        console.log(`Section ${i + 1}/${sectionsOrder.length}: "${cat}" (id=${sec.id})`);

        for (const row of bySection.get(cat)) {
            const diff = row['Difficulty Level'];
            const marks = MARKS_BY_DIFFICULTY[diff] ?? 1;
            const override = QUESTION_OVERRIDES[row['Question']];
            const questionText = override?.text ?? row['Question'];
            const rightAnswerLetter = (override?.rightAnswer ?? row['Right Answer'] ?? '').toUpperCase();
            const correctIdx = LETTER_TO_INDEX[rightAnswerLetter];
            if (correctIdx === undefined) throw new Error(`Bad Right Answer "${rightAnswerLetter}" for: ${row['Question']}`);

            const options = ['Option A', 'Option B', 'Option C', 'Option D'].map((col, idx) => ({
                text: String(row[col] ?? '').trim(),
                isCorrect: idx === correctIdx,
            }));

            await api('POST', `/admin/sections/${sec.id}/questions`, token, {
                type: 'MCQ',
                difficulty: (diff || 'EASY').toUpperCase(),
                text: questionText,
                options,
                correctAnswer: String(correctIdx),
                marks,
                negativeMarks: 0,
                tags: [cat],
            });
        }
        console.log(`  +${bySection.get(cat).length} questions`);
    }

    // ── Verify ──
    const final = await api('GET', `/exams/${DEMO_EXAM_ID}`, token);
    const qCount = (final.sections || []).reduce((n, s) => n + (s.questions || []).length, 0);
    console.log(`\nDone. Final: ${final.sections.length} sections, ${qCount} questions, ${final.durationMinutes} min, totalMarks=${final.totalMarks}`);
})().catch(err => { console.error(err); process.exit(1); });
