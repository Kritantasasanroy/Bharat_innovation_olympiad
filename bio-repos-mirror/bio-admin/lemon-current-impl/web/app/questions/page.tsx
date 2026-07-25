'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Trash2, Upload, BookOpen } from 'lucide-react';
import * as XLSX from 'xlsx';

// ── Excel column format (shared) ──
// Question | Option A | Option B | Option C | Option D |
// Right Answer (A-D) | Difficulty Level | Marks | Negative Marks
const LETTER_TO_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

function parseExcelRows(rows: any[]): any[] {
    return rows.map((row: any, i: number) => {
        const letter = String(row['Right Answer'] || '').trim().toUpperCase();
        const correctIdx = LETTER_TO_INDEX[letter];
        if (correctIdx === undefined) throw new Error(`Row ${i + 1}: invalid "Right Answer" "${letter}" (expected A/B/C/D)`);
        const text = String(row['Question'] || '').trim();
        if (!text) throw new Error(`Row ${i + 1}: missing Question text`);
        const diffRaw = String(row['Difficulty Level'] || 'MEDIUM').trim().toUpperCase();
        const difficulty = ['EASY', 'MEDIUM', 'HARD'].includes(diffRaw) ? diffRaw : 'MEDIUM';
        const marks = Number(row['Marks']) > 0 ? Number(row['Marks']) : (difficulty === 'HARD' ? 3 : difficulty === 'MEDIUM' ? 2 : 1);
        const negativeMarks = Number(row['Negative Marks']) >= 0 ? Number(row['Negative Marks']) : 0;
        const options = ['Option A', 'Option B', 'Option C', 'Option D'].map((col, idx) => ({
            text: String(row[col] ?? '').trim(),
            isCorrect: idx === correctIdx,
        }));
        return { type: 'MCQ', difficulty, text, options, marks, negativeMarks };
    });
}

// ── Global Question Bank View (no examId) ──
type QFormShape = {
    text: string;
    type: 'MCQ';
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    marks: number;
    negativeMarks: number;
    timeLimitSecs: number;
    explanation: string;
    options: { text: string; isCorrect: boolean }[];
};

const BLANK_Q_FORM: QFormShape = {
    text: '', type: 'MCQ', difficulty: 'MEDIUM', marks: 1, negativeMarks: 0,
    timeLimitSecs: 0, explanation: '',
    options: [
        { text: '', isCorrect: true }, { text: '', isCorrect: false },
        { text: '', isCorrect: false }, { text: '', isCorrect: false },
    ],
};

function GlobalBankView() {
    const [questions, setQuestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [difficulty, setDifficulty] = useState('');
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Add/Edit modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [qForm, setQForm] = useState<QFormShape>(BLANK_Q_FORM);
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState('');

    const load = async (q?: string, diff?: string) => {
        try {
            setLoading(true);
            const params: Record<string, string> = {};
            if (q) params.q = q;
            if (diff) params.difficulty = diff;
            const { data } = await api.get('/admin/questions', { params });
            setQuestions(data);
        } catch {
            setError('Failed to load question bank.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const importFromExcel = async (file: File) => {
        try {
            setImporting(true);
            setError('');
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]], { defval: null });
            if (rows.length === 0) throw new Error('No rows found in the Excel sheet.');
            const questionsPayload = parseExcelRows(rows);
            const { data } = await api.post<{ count: number }>('/admin/questions/bulk', { questions: questionsPayload });
            setError('');
            await load(search, difficulty);
            alert(`Imported ${data.count} question${data.count !== 1 ? 's' : ''} into the bank.`);
        } catch (err: any) {
            setError(err?.response?.data?.message || err?.message || 'Import failed.');
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const deleteQuestion = async (id: string) => {
        if (!confirm('Permanently delete this question from the bank? It will be removed from every exam that uses it.')) return;
        setDeleteId(id);
        try {
            await api.delete(`/admin/questions/${id}`);
            setQuestions((prev) => prev.filter((q) => q.id !== id));
        } catch {
            setError('Failed to delete question.');
        } finally {
            setDeleteId(null);
        }
    };

    const openAddModal = () => {
        setEditingId(null);
        setQForm(BLANK_Q_FORM);
        setModalError('');
        setModalOpen(true);
    };

    const openEditModal = (q: any) => {
        const opts = Array.isArray(q.options) && q.options.length > 0
            ? q.options.map((o: any) => ({ text: o.text || '', isCorrect: !!o.isCorrect }))
            : BLANK_Q_FORM.options;
        // Pad to at least 4 options for the form
        while (opts.length < 4) opts.push({ text: '', isCorrect: false });
        setEditingId(q.id);
        setQForm({
            text: q.text || '',
            type: 'MCQ',
            difficulty: (q.difficulty as QFormShape['difficulty']) || 'MEDIUM',
            marks: q.marks ?? 1,
            negativeMarks: q.negativeMarks ?? 0,
            timeLimitSecs: q.timeLimitSecs ?? 0,
            explanation: q.explanation || '',
            options: opts,
        });
        setModalError('');
        setModalOpen(true);
    };

    const saveQuestion = async () => {
        const text = qForm.text.trim();
        if (!text) { setModalError('Question text is required.'); return; }
        const validOptions = qForm.options.filter((o) => o.text.trim());
        if (validOptions.length < 2) { setModalError('At least two options are required.'); return; }
        if (!validOptions.some((o) => o.isCorrect)) { setModalError('Mark at least one option as correct.'); return; }

        const payload = {
            text,
            type: 'MCQ',
            difficulty: qForm.difficulty,
            marks: qForm.marks,
            negativeMarks: qForm.negativeMarks,
            timeLimitSecs: qForm.timeLimitSecs > 0 ? qForm.timeLimitSecs : null,
            explanation: qForm.explanation || null,
            options: validOptions,
        };

        try {
            setSaving(true);
            setModalError('');
            if (editingId) {
                await api.put(`/admin/questions/${editingId}`, payload);
            } else {
                await api.post('/admin/questions', payload);
            }
            setModalOpen(false);
            await load(search, difficulty);
        } catch (err: any) {
            setModalError(err?.response?.data?.message || err?.message || 'Failed to save question.');
        } finally {
            setSaving(false);
        }
    };

    const updateOption = (idx: number, patch: Partial<{ text: string; isCorrect: boolean }>) => {
        setQForm((prev) => {
            const next = [...prev.options];
            next[idx] = { ...next[idx], ...patch };
            return { ...prev, options: next };
        });
    };

    const setCorrectOption = (idx: number) => {
        setQForm((prev) => ({
            ...prev,
            options: prev.options.map((o, i) => ({ ...o, isCorrect: i === idx })),
        }));
    };

    return (
        <main className="container page-content animate-fade-in">
            <div className="page-header">
                <div>
                    <h1>Question Bank</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                        All questions available across your exams. Import or manage here, then attach to specific exam sections.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <a href="/exams" className="btn btn-secondary">← Back to Exams</a>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        style={{ display: 'none' }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) importFromExcel(f); }}
                    />
                    <button
                        className="btn btn-secondary"
                        disabled={importing}
                        onClick={() => fileInputRef.current?.click()}
                        title="Import questions from Excel into the bank (no section attached — you can attach them later)"
                    >
                        <Upload size={16} style={{ marginRight: '0.5rem' }} />
                        {importing ? 'Importing…' : 'Import from Excel'}
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={openAddModal}
                        title="Create a new question manually and add it to the bank"
                    >
                        + Add Question
                    </button>
                </div>
            </div>

            {/* Excel format hint */}
            <div className="glass-card" style={{ padding: 'var(--space-4)', marginTop: 'var(--space-4)', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <BookOpen size={16} style={{ flexShrink: 0 }} />
                <span>
                    <strong>Excel format:</strong> Columns: <code>Question</code> · <code>Option A</code> · <code>Option B</code> · <code>Option C</code> · <code>Option D</code> · <code>Right Answer</code> (A/B/C/D) · <code>Difficulty Level</code> (Easy/Medium/Hard) · <code>Marks</code> · <code>Negative Marks</code>
                </span>
            </div>

            {error && <div className="form-error" style={{ marginTop: 'var(--space-4)' }}>{error}</div>}

            {/* Search / filter */}
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)', flexWrap: 'wrap' }}>
                <input
                    type="text"
                    className="form-control"
                    placeholder="Search question text…"
                    value={search}
                    style={{ flex: 1, minWidth: '220px' }}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') load(search, difficulty); }}
                />
                <select
                    className="form-control"
                    value={difficulty}
                    style={{ maxWidth: '170px' }}
                    onChange={(e) => { setDifficulty(e.target.value); load(search, e.target.value); }}
                >
                    <option value="">All difficulties</option>
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HARD">Hard</option>
                </select>
                <button className="btn btn-secondary" onClick={() => load(search, difficulty)} disabled={loading}>
                    {loading ? '…' : 'Search'}
                </button>
            </div>

            {/* Stats */}
            <p style={{ marginTop: 'var(--space-3)', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                {loading ? 'Loading…' : `${questions.length} question${questions.length !== 1 ? 's' : ''} in bank`}
            </p>

            {/* Questions list */}
            {loading ? (
                <div className="loading-container" style={{ minHeight: '200px' }}><div className="spinner" /></div>
            ) : questions.length === 0 ? (
                <div className="glass-card empty-state" style={{ marginTop: 'var(--space-6)' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-4)' }}>📭</div>
                    <h3>No Questions Found</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Import from Excel or add questions via an exam's section.</p>
                </div>
            ) : (
                <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {questions.map((q: any) => (
                        <div key={q.id} className="glass-card" style={{ padding: 'var(--space-4)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem', alignItems: 'center' }}>
                                        <span className={`badge ${q.difficulty === 'EASY' ? 'badge-success' : q.difficulty === 'HARD' ? 'badge-danger' : 'badge-warning'}`}>
                                            {q.difficulty}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{q.marks} marks{q.negativeMarks > 0 ? ` / -${q.negativeMarks} penalty` : ''}</span>
                                        {(q.sectionLinks || []).length > 0 ? (
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                Used in {q.sectionLinks.length} section{q.sectionLinks.length !== 1 ? 's' : ''}
                                                {' ('}
                                                {q.sectionLinks.slice(0, 2).map((l: any) => l.section?.exam?.title || l.section?.title).join(', ')}
                                                {q.sectionLinks.length > 2 ? ', …' : ''}
                                                {')'}
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Not attached to any section</span>
                                        )}
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5 }}>{q.text}</p>

                                    {/* Inline option preview */}
                                    {Array.isArray(q.options) && q.options.length > 0 && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.4rem', marginTop: '0.6rem' }}>
                                            {q.options.map((opt: any, idx: number) => (
                                                <div key={idx} style={{
                                                    padding: '0.4rem 0.6rem',
                                                    borderRadius: 'var(--radius-sm)',
                                                    backgroundColor: opt.isCorrect ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)',
                                                    border: opt.isCorrect ? '1px solid rgba(34,197,94,0.3)' : '1px solid var(--border-subtle)',
                                                    display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem',
                                                }}>
                                                    <span style={{ fontWeight: 600, color: opt.isCorrect ? 'var(--success-400)' : 'var(--text-secondary)' }}>
                                                        {String.fromCharCode(65 + idx)}.
                                                    </span>
                                                    <span style={{ color: opt.isCorrect ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{opt.text}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                                    <button
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => openEditModal(q)}
                                        title="Edit question"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <button
                                        className="btn btn-sm btn-danger"
                                        onClick={() => deleteQuestion(q.id)}
                                        disabled={deleteId === q.id}
                                        title="Permanently delete from bank"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Question Modal */}
            {modalOpen && (
                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div className="modal-content glass-card" style={{ width: '100%', maxWidth: '650px', maxHeight: '92vh', overflowY: 'auto', padding: 'var(--space-6)' }}>
                        <h2 style={{ marginBottom: '0.25rem' }}>{editingId ? 'Edit Question' : 'Add Question to Bank'}</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                            {editingId
                                ? 'Changes apply everywhere this question is used.'
                                : 'Question will be saved to the bank — you can attach it to any exam section later.'}
                        </p>

                        {modalError && <div className="form-error" style={{ marginBottom: '1rem' }}>{modalError}</div>}

                        <div className="form-group">
                            <label>Question Text *</label>
                            <textarea
                                className="form-control"
                                rows={3}
                                value={qForm.text}
                                onChange={(e) => setQForm({ ...qForm, text: e.target.value })}
                                placeholder="Enter the question text…"
                            />
                        </div>

                        <div className="grid-2" style={{ gap: '1rem', marginTop: '1rem' }}>
                            <div className="form-group">
                                <label>Difficulty</label>
                                <select
                                    className="form-control"
                                    value={qForm.difficulty}
                                    onChange={(e) => setQForm({ ...qForm, difficulty: e.target.value as QFormShape['difficulty'] })}
                                >
                                    <option value="EASY">Easy</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="HARD">Hard</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Marks</label>
                                <input
                                    type="number"
                                    min={0}
                                    className="form-control"
                                    value={qForm.marks}
                                    onChange={(e) => setQForm({ ...qForm, marks: Number(e.target.value) })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Negative Marks (Penalty)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min={0}
                                    className="form-control"
                                    value={qForm.negativeMarks}
                                    onChange={(e) => setQForm({ ...qForm, negativeMarks: Number(e.target.value) })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Per-Question Time Limit (s, 0 = none)</label>
                                <input
                                    type="number"
                                    min={0}
                                    className="form-control"
                                    value={qForm.timeLimitSecs}
                                    onChange={(e) => setQForm({ ...qForm, timeLimitSecs: Number(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="form-group" style={{ marginTop: '1rem' }}>
                            <label>Explanation (Optional)</label>
                            <textarea
                                className="form-control"
                                rows={2}
                                value={qForm.explanation}
                                onChange={(e) => setQForm({ ...qForm, explanation: e.target.value })}
                                placeholder="Why is the correct answer correct?"
                            />
                        </div>

                        <div style={{ marginTop: '1.25rem' }}>
                            <h4 style={{ marginBottom: '0.5rem' }}>
                                MCQ Options
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '0.5rem' }}>
                                    — pick the radio button next to the correct answer
                                </span>
                            </h4>
                            {qForm.options.map((opt, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', alignItems: 'center' }}>
                                    <input
                                        type="radio"
                                        name="bank_correct_option"
                                        checked={opt.isCorrect}
                                        onChange={() => setCorrectOption(idx)}
                                        style={{ cursor: 'pointer', transform: 'scale(1.2)', flexShrink: 0 }}
                                    />
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                                        value={opt.text}
                                        onChange={(e) => updateOption(idx, { text: e.target.value })}
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="modal-actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveQuestion} disabled={saving}>
                                {saving ? (editingId ? 'Saving…' : 'Creating…') : (editingId ? 'Save Changes' : 'Create Question')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

// ── Per-Exam Questions View ──
function ExamQuestionsContent({ examId }: { examId: string }) {
    const [loading, setLoading] = useState(true);
    const [exam, setExam] = useState<any>(null);
    const [sections, setSections] = useState<any[]>([]);
    const [newSectionTitle, setNewSectionTitle] = useState('');
    const [error, setError] = useState('');

    const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
    const [isEditingQuestion, setIsEditingQuestion] = useState(false);
    const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

    const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
    const [editSectionTitle, setEditSectionTitle] = useState('');

    const [bulkBusySection, setBulkBusySection] = useState<string | null>(null);
    const [reorderBusy, setReorderBusy] = useState<string | null>(null);
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const [bankModalSection, setBankModalSection] = useState<string | null>(null);
    const [bankLoading, setBankLoading] = useState(false);
    const [bankQuestions, setBankQuestions] = useState<any[]>([]);
    const [bankSearch, setBankSearch] = useState('');
    const [bankDifficulty, setBankDifficulty] = useState('');
    const [bankSelected, setBankSelected] = useState<Record<string, boolean>>({});
    const [bankAttaching, setBankAttaching] = useState(false);

    const blankQForm = {
        text: '', type: 'MCQ', difficulty: 'MEDIUM', marks: 1, negativeMarks: 0,
        timeLimitSecs: 0, explanation: '',
        options: [
            { text: '', isCorrect: true }, { text: '', isCorrect: false },
            { text: '', isCorrect: false }, { text: '', isCorrect: false },
        ],
    };
    const [qFormData, setQFormData] = useState(blankQForm);

    const resetForm = () => { setQFormData(blankQForm); setIsEditingQuestion(false); setEditingQuestionId(null); };

    const openQuestionModal = (sectionId: string) => { setActiveSectionId(sectionId); resetForm(); setIsQuestionModalOpen(true); };

    const openEditQuestionModal = (sectionId: string, question: any) => {
        setActiveSectionId(sectionId);
        setIsEditingQuestion(true);
        setEditingQuestionId(question.id);
        const qOptions = Array.isArray(question.options) && question.options.length > 0
            ? question.options
            : [{ text: '', isCorrect: true }, { text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }];
        setQFormData({ text: question.text || '', type: 'MCQ', difficulty: question.difficulty || 'MEDIUM', marks: question.marks || 1, negativeMarks: question.negativeMarks || 0, timeLimitSecs: question.timeLimitSecs || 0, explanation: question.explanation || '', options: qOptions });
        setIsQuestionModalOpen(true);
    };

    const fetchExamDetails = async () => {
        try {
            setLoading(true);
            const { data } = await api.get(`/exams/${examId}`);
            setExam(data);
            setSections(data.sections || []);
        } catch {
            setError('Failed to load exam details.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchExamDetails(); }, [examId]);

    const addSection = async () => {
        if (!newSectionTitle.trim()) return;
        try {
            await api.post(`/admin/exams/${examId}/sections`, { title: newSectionTitle, sortOrder: sections.length });
            setNewSectionTitle('');
            fetchExamDetails();
        } catch { setError('Failed to add section.'); }
    };

    const saveSectionTitle = async (sectionId: string) => {
        if (!editSectionTitle.trim()) return;
        try {
            await api.put(`/admin/sections/${sectionId}`, { title: editSectionTitle });
            setEditingSectionId(null);
            fetchExamDetails();
        } catch { setError('Failed to update section.'); }
    };

    const deleteSection = async (sectionId: string) => {
        if (!confirm('Delete this section and remove all its questions from it?')) return;
        try { await api.delete(`/admin/sections/${sectionId}`); fetchExamDetails(); }
        catch { setError('Failed to delete section.'); }
    };

    const detachQuestion = async (sectionId: string, questionId: string) => {
        if (!confirm('Remove from this section? Question stays in the bank and can be re-attached.')) return;
        try { await api.delete(`/admin/sections/${sectionId}/questions/${questionId}`); fetchExamDetails(); }
        catch { setError('Failed to detach question.'); }
    };

    const deleteQuestionFromBank = async (questionId: string) => {
        if (!confirm('Permanently delete from the bank? Removes from every exam that uses it.')) return;
        try { await api.delete(`/admin/questions/${questionId}`); fetchExamDetails(); }
        catch { setError('Failed to delete question.'); }
    };

    const reorderSection = async (sectionId: string, direction: 'up' | 'down') => {
        const idx = sections.findIndex((s: any) => s.id === sectionId);
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (idx < 0 || targetIdx < 0 || targetIdx >= sections.length) return;
        const a = sections[idx], b = sections[targetIdx];
        try {
            setReorderBusy(sectionId);
            await Promise.all([api.put(`/admin/sections/${a.id}`, { sortOrder: b.sortOrder }), api.put(`/admin/sections/${b.id}`, { sortOrder: a.sortOrder })]);
            await fetchExamDetails();
        } catch { setError('Failed to reorder section.'); } finally { setReorderBusy(null); }
    };

    const reorderQuestion = async (sectionId: string, questionId: string, direction: 'up' | 'down') => {
        const sec = sections.find((s: any) => s.id === sectionId);
        if (!sec) return;
        const qs = sec.questions || [];
        const idx = qs.findIndex((q: any) => q.id === questionId);
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (idx < 0 || targetIdx < 0 || targetIdx >= qs.length) return;
        const a = qs[idx], b = qs[targetIdx];
        try {
            setReorderBusy(questionId);
            await Promise.all([
                api.put(`/admin/sections/${sectionId}/questions/${a.id}`, { sortOrder: b.sortOrder ?? targetIdx }),
                api.put(`/admin/sections/${sectionId}/questions/${b.id}`, { sortOrder: a.sortOrder ?? idx }),
            ]);
            await fetchExamDetails();
        } catch { setError('Failed to reorder question.'); } finally { setReorderBusy(null); }
    };

    const moveQuestion = async (sourceSectionId: string, questionId: string, targetSectionId: string) => {
        try { await api.post(`/admin/sections/${sourceSectionId}/questions/${questionId}/move`, { targetSectionId }); await fetchExamDetails(); }
        catch { setError('Failed to move question.'); }
    };

    const openBankModal = async (sectionId: string) => {
        setBankModalSection(sectionId);
        setBankSelected({});
        setBankSearch('');
        setBankDifficulty('');
        await loadBank('', '');
    };

    const loadBank = async (q: string, diff: string) => {
        try {
            setBankLoading(true);
            const params: Record<string, string> = {};
            if (q) params.q = q;
            if (diff) params.difficulty = diff;
            const { data } = await api.get('/admin/questions', { params });
            setBankQuestions(data);
        } catch { setError('Failed to load bank questions.'); } finally { setBankLoading(false); }
    };

    const attachSelectedFromBank = async () => {
        if (!bankModalSection) return;
        const ids = Object.entries(bankSelected).filter(([, v]) => v).map(([k]) => k);
        if (ids.length === 0) return;
        try {
            setBankAttaching(true);
            for (const questionId of ids) {
                try { await api.post(`/admin/sections/${bankModalSection}/questions/attach`, { questionId }); }
                catch (err: any) { if (err?.response?.status !== 400) throw err; }
            }
            setBankModalSection(null);
            await fetchExamDetails();
        } catch { setError('Failed to attach some questions.'); } finally { setBankAttaching(false); }
    };

    const bulkImportFromExcel = async (sectionId: string, file: File) => {
        try {
            setBulkBusySection(sectionId);
            setError('');
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]], { defval: null });
            if (rows.length === 0) throw new Error('No rows found in the Excel sheet.');
            const questions = parseExcelRows(rows);
            await api.post(`/admin/sections/${sectionId}/questions/bulk`, { questions });
            await fetchExamDetails();
        } catch (err: any) {
            setError(err?.message || 'Bulk import failed.');
        } finally {
            setBulkBusySection(null);
            const input = fileInputRefs.current[sectionId];
            if (input) input.value = '';
        }
    };

    const saveQuestion = async () => {
        if (!activeSectionId) return;
        if (!qFormData.text.trim()) { setError('Question text is required.'); return; }
        const validOptions = qFormData.options.filter(o => o.text.trim());
        if (validOptions.length < 2) { setError('At least two options are required.'); return; }
        if (!validOptions.some(o => o.isCorrect)) { setError('Mark at least one option as correct.'); return; }
        const payload = { text: qFormData.text, type: 'MCQ', difficulty: qFormData.difficulty, marks: qFormData.marks, negativeMarks: qFormData.negativeMarks, timeLimitSecs: qFormData.timeLimitSecs > 0 ? qFormData.timeLimitSecs : null, explanation: qFormData.explanation || null, options: validOptions };
        try {
            if (isEditingQuestion && editingQuestionId) {
                await api.put(`/admin/questions/${editingQuestionId}`, payload);
            } else {
                await api.post(`/admin/sections/${activeSectionId}/questions`, payload);
            }
            setIsQuestionModalOpen(false);
            fetchExamDetails();
        } catch { setError('Failed to save question.'); }
    };

    const totalQuestions = sections.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
    const createdMarks = sections.reduce((sum, s) => sum + (s.questions?.reduce((qSum: number, q: any) => qSum + (q.marks || 0), 0) || 0), 0);

    return (
        <main className="container page-content animate-fade-in">
            <div className="page-header">
                <div>
                    <h1>Manage Questions</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                        {exam ? `Exam: ${exam.title}` : 'Organise sections and questions for this exam.'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <a href="/questions" className="btn btn-secondary" title="Browse all questions in the bank">
                        <BookOpen size={15} style={{ marginRight: '0.4rem' }} /> Question Bank
                    </a>
                    <a href="/exams" className="btn btn-secondary">← Back to Exams</a>
                </div>
            </div>

            {error && <div className="form-error" style={{ marginTop: 'var(--space-4)' }}>{error}</div>}

            {loading ? (
                <div className="loading-container"><div className="spinner" /></div>
            ) : (
                <div style={{ marginTop: 'var(--space-6)', display: 'grid', gap: 'var(--space-6)' }}>

                    {exam && (
                        <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
                            {/* Stats */}
                            <div className="grid-4">
                                <div className="stat-card glass-card">
                                    <div className="stat-value">{sections.length}</div>
                                    <div className="stat-label">Total Sections</div>
                                </div>
                                <div className="stat-card glass-card">
                                    <div className="stat-value">{totalQuestions}</div>
                                    <div className="stat-label">Total Questions</div>
                                </div>
                                <div className="stat-card glass-card">
                                    <div className="stat-value">{exam.totalMarks}</div>
                                    <div className="stat-label">Max Marks (Target)</div>
                                </div>
                                <div className="stat-card glass-card">
                                    <div className="stat-value" style={{
                                        color: createdMarks === exam.totalMarks ? 'var(--success-400)' : createdMarks > exam.totalMarks ? 'var(--danger-400)' : 'var(--warning-400)',
                                    }}>
                                        {createdMarks} / {exam.totalMarks}
                                    </div>
                                    <div className="stat-label">Created Marks</div>
                                </div>
                            </div>

                            {/* Section table */}
                            <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
                                <h3 style={{ marginBottom: 'var(--space-4)' }}>Section Weightage</h3>
                                {sections.length === 0 ? (
                                    <p style={{ color: 'var(--text-muted)' }}>No sections yet. Add one below.</p>
                                ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                                                    <th style={{ padding: '0.75rem 1rem' }}>Section</th>
                                                    <th style={{ padding: '0.75rem 1rem' }}>Questions</th>
                                                    <th style={{ padding: '0.75rem 1rem' }}>Marks</th>
                                                    <th style={{ padding: '0.75rem 1rem' }}>Weightage</th>
                                                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sections.map((s: any) => {
                                                    const qCount = s.questions?.length || 0;
                                                    const sMarks = s.questions?.reduce((sum: number, q: any) => sum + (q.marks || 0), 0) || 0;
                                                    const weightage = exam.totalMarks > 0 ? ((sMarks / exam.totalMarks) * 100).toFixed(1) : '0';
                                                    return (
                                                        <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                            <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{s.title}</td>
                                                            <td style={{ padding: '0.75rem 1rem' }}>{qCount} qs</td>
                                                            <td style={{ padding: '0.75rem 1rem' }}>{sMarks}</td>
                                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                    <div className="progress-bar" style={{ width: '80px', height: '6px' }}>
                                                                        <div className="progress-bar-fill" style={{ width: `${Math.min(100, parseFloat(weightage))}%` }} />
                                                                    </div>
                                                                    <span>{weightage}%</span>
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                                {qCount === 0 ? <span className="badge badge-warning">Empty</span> : <span className="badge badge-success">Ready</span>}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Add section */}
                    <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
                        <h3>Add New Section</h3>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                            <input type="text" className="form-control" placeholder="Section title (e.g. Logical Reasoning)" value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)} />
                            <button className="btn btn-primary" onClick={addSection}>Add Section</button>
                        </div>
                    </div>

                    {/* Sections */}
                    {sections.map((section: any) => (
                        <div key={section.id} className="glass-card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-4)' }}>
                            {/* Section header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                                {editingSectionId === section.id ? (
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <input type="text" className="form-control" value={editSectionTitle} onChange={(e) => setEditSectionTitle(e.target.value)} />
                                        <button className="btn btn-sm btn-primary" onClick={() => saveSectionTitle(section.id)}>Save</button>
                                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingSectionId(null)}>Cancel</button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <h3 style={{ margin: 0 }}>{section.title}</h3>
                                        <button className="btn btn-sm btn-secondary" disabled={reorderBusy === section.id || sections.findIndex((s: any) => s.id === section.id) === 0} onClick={() => reorderSection(section.id, 'up')} title="Move up"><ArrowUp size={14} /></button>
                                        <button className="btn btn-sm btn-secondary" disabled={reorderBusy === section.id || sections.findIndex((s: any) => s.id === section.id) === sections.length - 1} onClick={() => reorderSection(section.id, 'down')} title="Move down"><ArrowDown size={14} /></button>
                                        <button className="btn btn-sm btn-secondary" onClick={() => { setEditingSectionId(section.id); setEditSectionTitle(section.title); }}><Pencil size={14} /></button>
                                        <button className="btn btn-sm btn-danger" onClick={() => deleteSection(section.id)}><Trash2 size={14} /></button>
                                    </div>
                                )}

                                {/* Section actions — prominently displayed */}
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <input
                                        ref={(el) => { fileInputRefs.current[section.id] = el; }}
                                        type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                                        onChange={(e) => { const f = e.target.files?.[0]; if (f) bulkImportFromExcel(section.id, f); }}
                                    />
                                    <button
                                        className="btn btn-sm btn-secondary"
                                        disabled={bulkBusySection === section.id}
                                        onClick={() => fileInputRefs.current[section.id]?.click()}
                                        title="Import questions from Excel into this section"
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                    >
                                        <Upload size={14} />
                                        {bulkBusySection === section.id ? 'Importing…' : 'Import Excel'}
                                    </button>
                                    <button
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => openBankModal(section.id)}
                                        title="Attach existing bank questions to this section"
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                    >
                                        <BookOpen size={14} /> Attach from Bank
                                    </button>
                                    <button className="btn btn-sm btn-primary" onClick={() => openQuestionModal(section.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        + Add Question
                                    </button>
                                </div>
                            </div>

                            {/* Questions list */}
                            <div>
                                {(section.questions?.length || 0) === 0 ? (
                                    <p style={{ color: 'var(--text-muted)', margin: 0, padding: 'var(--space-4) 0' }}>
                                        No questions yet. Use the buttons above to add or import questions.
                                    </p>
                                ) : (
                                    <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        {section.questions?.map((q: any, i: number) => (
                                            <li key={q.id} className="question-item glass-card" style={{ padding: '1.25rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                                                            <strong style={{ color: 'var(--primary-400)' }}>Q{i + 1}</strong>
                                                            <span className={`badge ${q.difficulty === 'EASY' ? 'badge-success' : q.difficulty === 'HARD' ? 'badge-danger' : 'badge-warning'}`}>{q.difficulty}</span>
                                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{q.marks} marks{q.negativeMarks > 0 ? ` / -${q.negativeMarks}` : ''}</span>
                                                        </div>
                                                        <p style={{ fontSize: '1rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>{q.text}</p>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                                                        <button className="btn btn-sm btn-secondary" disabled={reorderBusy === q.id || i === 0} onClick={() => reorderQuestion(section.id, q.id, 'up')} title="Move up"><ArrowUp size={14} /></button>
                                                        <button className="btn btn-sm btn-secondary" disabled={reorderBusy === q.id || i === (section.questions?.length || 0) - 1} onClick={() => reorderQuestion(section.id, q.id, 'down')} title="Move down"><ArrowDown size={14} /></button>
                                                        {sections.length > 1 && (
                                                            <select className="form-control" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', maxWidth: '140px' }} value={section.id} onChange={(e) => { if (e.target.value !== section.id) moveQuestion(section.id, q.id, e.target.value); }} title="Move to section">
                                                                {sections.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
                                                            </select>
                                                        )}
                                                        <button className="btn btn-sm btn-secondary" onClick={() => openEditQuestionModal(section.id, q)} title="Edit"><Pencil size={14} /></button>
                                                        <button className="btn btn-sm btn-secondary" onClick={() => detachQuestion(section.id, q.id)} title="Remove from section (stays in bank)">Detach</button>
                                                        <button className="btn btn-sm btn-danger" onClick={() => deleteQuestionFromBank(q.id)} title="Delete from bank"><Trash2 size={14} /></button>
                                                    </div>
                                                </div>

                                                {/* Options */}
                                                {q.options && Array.isArray(q.options) && (
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', marginTop: '0.75rem' }}>
                                                        {q.options.map((opt: any, idx: number) => (
                                                            <div key={idx} style={{ padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: opt.isCorrect ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)', border: opt.isCorrect ? '1px solid rgba(34,197,94,0.3)' : '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <span style={{ fontWeight: 'bold', color: opt.isCorrect ? 'var(--success-400)' : 'var(--text-secondary)', fontSize: '0.85rem' }}>{String.fromCharCode(65 + idx)}.</span>
                                                                <span style={{ color: opt.isCorrect ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '0.9rem' }}>{opt.text}</span>
                                                                {opt.isCorrect && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', backgroundColor: 'rgba(34,197,94,0.15)', color: 'var(--success-400)', padding: '1px 6px', borderRadius: '999px', fontWeight: 'bold', flexShrink: 0 }}>✓</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {q.explanation && (
                                                    <div style={{ marginTop: '0.5rem', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(255,255,255,0.02)', borderLeft: '3px solid var(--primary-400)', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                                        <strong>Explanation:</strong> {q.explanation}
                                                    </div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Question Modal */}
            {isQuestionModalOpen && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="modal-content glass-card" style={{ width: '90%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2>{isEditingQuestion ? 'Edit Question' : 'Add Question'}</h2>
                        <div className="form-group" style={{ marginTop: '1rem' }}>
                            <label>Question Text</label>
                            <textarea className="form-control" rows={3} value={qFormData.text} onChange={(e) => setQFormData({ ...qFormData, text: e.target.value })} placeholder="Enter the question text here..." />
                        </div>
                        <div className="grid-2" style={{ gap: '1rem', marginTop: '1rem' }}>
                            <div className="form-group">
                                <label>Difficulty</label>
                                <select className="form-control" value={qFormData.difficulty} onChange={(e) => setQFormData({ ...qFormData, difficulty: e.target.value })}>
                                    <option value="EASY">Easy</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="HARD">Hard</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Marks</label>
                                <input type="number" className="form-control" value={qFormData.marks} onChange={(e) => setQFormData({ ...qFormData, marks: Number(e.target.value) })} />
                            </div>
                            <div className="form-group">
                                <label>Negative Marks (Penalty)</label>
                                <input type="number" step="0.1" className="form-control" value={qFormData.negativeMarks} onChange={(e) => setQFormData({ ...qFormData, negativeMarks: Number(e.target.value) })} />
                            </div>
                            <div className="form-group">
                                <label>Per-Question Time Limit (s, 0 = none)</label>
                                <input type="number" min="0" className="form-control" value={qFormData.timeLimitSecs} onChange={(e) => setQFormData({ ...qFormData, timeLimitSecs: Number(e.target.value) })} />
                            </div>
                        </div>
                        <div className="form-group" style={{ marginTop: '1rem' }}>
                            <label>Explanation (Optional)</label>
                            <textarea className="form-control" rows={2} value={qFormData.explanation} onChange={(e) => setQFormData({ ...qFormData, explanation: e.target.value })} placeholder="Why is the correct answer correct?" />
                        </div>
                        <div style={{ marginTop: '1.5rem' }}>
                            <h4>MCQ Options <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>— click radio button to mark correct</span></h4>
                            {qFormData.options.map((opt, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', alignItems: 'center' }}>
                                    <input type="radio" name="correct_option" checked={opt.isCorrect} onChange={() => { const o = qFormData.options.map((x, i) => ({ ...x, isCorrect: i === idx })); setQFormData({ ...qFormData, options: o }); }} style={{ cursor: 'pointer', transform: 'scale(1.2)', flexShrink: 0 }} />
                                    <input type="text" className="form-control" placeholder={`Option ${String.fromCharCode(65 + idx)}`} value={opt.text} onChange={(e) => { const o = [...qFormData.options]; o[idx] = { ...o[idx], text: e.target.value }; setQFormData({ ...qFormData, options: o }); }} />
                                </div>
                            ))}
                        </div>
                        <div className="modal-actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button className="btn btn-secondary" onClick={() => setIsQuestionModalOpen(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveQuestion}>{isEditingQuestion ? 'Save Changes' : 'Create Question'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bank attach modal */}
            {bankModalSection && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="modal-content glass-card" style={{ width: '92%', maxWidth: '900px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ margin: 0 }}>Attach from Question Bank</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.25rem 0 1rem' }}>
                            Pick existing bank questions to attach to this section. Questions stay in the bank and can be re-used across exams.
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                            <input type="text" className="form-control" placeholder="Search…" value={bankSearch} onChange={(e) => setBankSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadBank(bankSearch, bankDifficulty); }} style={{ flex: 1, minWidth: '200px' }} />
                            <select className="form-control" value={bankDifficulty} onChange={(e) => { setBankDifficulty(e.target.value); loadBank(bankSearch, e.target.value); }} style={{ maxWidth: '150px' }}>
                                <option value="">All</option>
                                <option value="EASY">Easy</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HARD">Hard</option>
                            </select>
                            <button className="btn btn-secondary" onClick={() => loadBank(bankSearch, bankDifficulty)} disabled={bankLoading}>{bankLoading ? '…' : 'Search'}</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}>
                            {bankLoading ? (
                                <div className="loading-container"><div className="spinner" /></div>
                            ) : bankQuestions.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', padding: '1rem', textAlign: 'center', margin: 0 }}>No questions match. Create one with &quot;+ Add Question&quot;.</p>
                            ) : (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {bankQuestions.map((q: any) => {
                                        const alreadyAttached = (q.sectionLinks || []).some((l: any) => l.sectionId === bankModalSection);
                                        return (
                                            <li key={q.id} style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', backgroundColor: alreadyAttached ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                                <input type="checkbox" disabled={alreadyAttached} checked={!!bankSelected[q.id]} onChange={(e) => setBankSelected((p) => ({ ...p, [q.id]: e.target.checked }))} style={{ marginTop: '0.25rem', transform: 'scale(1.2)', cursor: alreadyAttached ? 'not-allowed' : 'pointer', flexShrink: 0 }} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem', alignItems: 'center' }}>
                                                        <span className={`badge ${q.difficulty === 'EASY' ? 'badge-success' : q.difficulty === 'HARD' ? 'badge-danger' : 'badge-warning'}`}>{q.difficulty}</span>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{q.marks} marks</span>
                                                        {alreadyAttached && <span className="badge badge-success">Already attached</span>}
                                                        {!alreadyAttached && (q.sectionLinks || []).length > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Used in {q.sectionLinks.length} other section{q.sectionLinks.length !== 1 ? 's' : ''}</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.9rem' }}>{q.text}</div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                        <div className="modal-actions" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{Object.values(bankSelected).filter(Boolean).length} selected</span>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-secondary" onClick={() => setBankModalSection(null)} disabled={bankAttaching}>Cancel</button>
                                <button className="btn btn-primary" onClick={attachSelectedFromBank} disabled={bankAttaching || Object.values(bankSelected).filter(Boolean).length === 0}>{bankAttaching ? 'Attaching…' : 'Attach Selected'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

// ── Page entry ──
function QuestionsContent() {
    const searchParams = useSearchParams();
    const examId = searchParams.get('examId');

    if (!examId) return <GlobalBankView />;
    return <ExamQuestionsContent examId={examId} />;
}

export default function QuestionsPage() {
    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <Suspense fallback={<div className="loading-container"><div className="spinner" /></div>}>
                <QuestionsContent />
            </Suspense>
        </AuthGuard>
    );
}
