'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

function QuestionsContent() {
    const searchParams = useSearchParams();
    const examId = searchParams.get('examId');

    const [loading, setLoading] = useState(true);
    const [exam, setExam] = useState<any>(null);
    const [sections, setSections] = useState<any[]>([]);
    const [newSectionTitle, setNewSectionTitle] = useState('');
    const [error, setError] = useState('');

    // Modal state for adding questions
    const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
    const [isEditingQuestion, setIsEditingQuestion] = useState(false);
    const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

    // Section edit state
    const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
    const [editSectionTitle, setEditSectionTitle] = useState('');

    const [qFormData, setQFormData] = useState({
        text: '',
        type: 'MCQ',
        difficulty: 'MEDIUM',
        marks: 1,
        negativeMarks: 0,
        explanation: '',
        options: [
            { text: '', isCorrect: true },
            { text: '', isCorrect: false },
            { text: '', isCorrect: false },
            { text: '', isCorrect: false }
        ]
    });

    const resetForm = () => {
        setQFormData({
            text: '',
            type: 'MCQ',
            difficulty: 'MEDIUM',
            marks: 1,
            negativeMarks: 0,
            explanation: '',
            options: [
                { text: '', isCorrect: true },
                { text: '', isCorrect: false },
                { text: '', isCorrect: false },
                { text: '', isCorrect: false }
            ]
        });
        setIsEditingQuestion(false);
        setEditingQuestionId(null);
    };

    const openQuestionModal = (sectionId: string) => {
        setActiveSectionId(sectionId);
        resetForm();
        setIsQuestionModalOpen(true);
    };

    const openEditQuestionModal = (sectionId: string, question: any) => {
        setActiveSectionId(sectionId);
        setIsEditingQuestion(true);
        setEditingQuestionId(question.id);
        
        const qOptions = Array.isArray(question.options) ? question.options : [];
        const options = qOptions.length > 0 ? qOptions : [
            { text: '', isCorrect: true },
            { text: '', isCorrect: false },
            { text: '', isCorrect: false },
            { text: '', isCorrect: false }
        ];

        setQFormData({
            text: question.text || '',
            type: 'MCQ',
            difficulty: question.difficulty || 'MEDIUM',
            marks: question.marks || 1,
            negativeMarks: question.negativeMarks || 0,
            explanation: question.explanation || '',
            options: options
        });
        setIsQuestionModalOpen(true);
    };

    const fetchExamDetails = async () => {
        if (!examId) return;
        try {
            setLoading(true);
            const { data } = await api.get(`/exams/${examId}`);
            setExam(data);
            setSections(data.sections || []);
        } catch (err) {
            console.error('Failed to fetch exam', err);
            setError('Failed to load exam details.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExamDetails();
    }, [examId]);

    const addSection = async () => {
        if (!newSectionTitle.trim()) return;
        try {
            await api.post(`/admin/exams/${examId}/sections`, {
                title: newSectionTitle,
                sortOrder: sections.length,
            });
            setNewSectionTitle('');
            fetchExamDetails();
        } catch (err) {
            console.error('Failed to add section', err);
            setError('Failed to add section.');
        }
    };

    const saveSectionTitle = async (sectionId: string) => {
        if (!editSectionTitle.trim()) return;
        try {
            await api.put(`/admin/sections/${sectionId}`, { title: editSectionTitle });
            setEditingSectionId(null);
            fetchExamDetails();
        } catch (err) {
            console.error('Failed to update section', err);
            setError('Failed to update section.');
        }
    };

    const deleteSection = async (sectionId: string) => {
        if (!confirm('Are you sure you want to delete this section and all its questions?')) return;
        try {
            await api.delete(`/admin/sections/${sectionId}`);
            fetchExamDetails();
        } catch (err) {
            console.error('Failed to delete section', err);
            setError('Failed to delete section.');
        }
    };

    const deleteQuestion = async (questionId: string) => {
        if (!confirm('Are you sure you want to delete this question?')) return;
        try {
            await api.delete(`/admin/questions/${questionId}`);
            fetchExamDetails();
        } catch (err) {
            console.error('Failed to delete question', err);
            setError('Failed to delete question.');
        }
    };

    const saveQuestion = async () => {
        if (!activeSectionId) return;
        
        // Validation
        if (!qFormData.text.trim()) {
            setError('Question text is required.');
            return;
        }

        const validOptions = qFormData.options.filter(o => o.text.trim());
        if (qFormData.type === 'MCQ') {
            if (validOptions.length < 2) {
                setError('At least two options are required.');
                return;
            }
            if (!validOptions.some(o => o.isCorrect)) {
                setError('At least one correct option must be selected.');
                return;
            }
        }

        const payload = {
            text: qFormData.text,
            type: 'MCQ',
            difficulty: qFormData.difficulty,
            marks: qFormData.marks,
            negativeMarks: qFormData.negativeMarks,
            explanation: qFormData.explanation || null,
            options: validOptions
        };

        try {
            if (isEditingQuestion && editingQuestionId) {
                await api.put(`/admin/questions/${editingQuestionId}`, payload);
            } else {
                await api.post(`/admin/sections/${activeSectionId}/questions`, payload);
            }
            setIsQuestionModalOpen(false);
            fetchExamDetails();
        } catch (err) {
            console.error('Failed to save question', err);
            setError('Failed to save question.');
        }
    };

    if (!examId) {
        return (
            <div className="container page-content animate-fade-in">
                <h2>No Exam Selected</h2>
                <p>Please select an exam from the Exams page to manage its questions.</p>
            </div>
        );
    }

    const totalQuestions = sections.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
    const createdMarks = sections.reduce((sum, s) => sum + (s.questions?.reduce((qSum: number, q: any) => qSum + (q.marks || 0), 0) || 0), 0);

    return (
        <main className="container page-content animate-fade-in">
            <div className="page-header">
                <div>
                    <h1>Manage Questions</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                        {exam ? `Exam: ${exam.title}` : 'Organize your sections and question bank for this exam.'}
                    </p>
                </div>
                <button className="btn btn-secondary" onClick={() => window.location.href = '/exams'}>
                    Back to Exams
                </button>
            </div>

            {error && <div className="form-error">{error}</div>}

            {loading ? (
                <div className="loading-container">
                    <div className="spinner" />
                </div>
            ) : (
                <div style={{ marginTop: 'var(--space-6)', display: 'grid', gap: 'var(--space-6)' }}>
                    
                    {/* Detailed Question Statistics */}
                    {exam && (
                        <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
                            {/* High-level Counters */}
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
                                        color: createdMarks === exam.totalMarks ? 'var(--success-400)' : createdMarks > exam.totalMarks ? 'var(--danger-400)' : 'var(--warning-400)'
                                    }}>
                                        {createdMarks} / {exam.totalMarks}
                                    </div>
                                    <div className="stat-label">Created Marks Worth</div>
                                </div>
                            </div>

                            {/* Section breakdown table */}
                            <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
                                <h3 style={{ marginBottom: 'var(--space-4)' }}>Section Weightage & Details</h3>
                                {sections.length === 0 ? (
                                    <p style={{ color: 'var(--text-muted)' }}>No sections created yet. Add a section below to get started.</p>
                                ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                                                    <th style={{ padding: '0.75rem 1rem' }}>Section Name</th>
                                                    <th style={{ padding: '0.75rem 1rem' }}>Questions</th>
                                                    <th style={{ padding: '0.75rem 1rem' }}>Total Marks</th>
                                                    <th style={{ padding: '0.75rem 1rem' }}>Weightage (Target)</th>
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
                                                            <td style={{ padding: '0.75rem 1rem' }}>{sMarks} marks</td>
                                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                    <div className="progress-bar" style={{ width: '80px', height: '6px' }}>
                                                                        <div 
                                                                            className="progress-bar-fill" 
                                                                            style={{ width: `${Math.min(100, parseFloat(weightage))}%` }} 
                                                                        />
                                                                    </div>
                                                                    <span>{weightage}%</span>
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                                {qCount === 0 ? (
                                                                    <span className="badge badge-warning">Empty</span>
                                                                ) : (
                                                                    <span className="badge badge-success">Configured</span>
                                                                )}
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

                    <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
                        <h3>Add New Section</h3>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                            <input
                                type="text"
                                className="form-control"
                                placeholder="Section Title (e.g. Logical Reasoning)"
                                value={newSectionTitle}
                                onChange={(e) => setNewSectionTitle(e.target.value)}
                            />
                            <button className="btn btn-primary" onClick={addSection}>Add Section</button>
                        </div>
                    </div>

                    {sections.map((section: any) => (
                        <div key={section.id} className="glass-card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-4)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-4)' }}>
                                {editingSectionId === section.id ? (
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <input 
                                            type="text" 
                                            className="form-control" 
                                            value={editSectionTitle}
                                            onChange={(e) => setEditSectionTitle(e.target.value)}
                                        />
                                        <button className="btn btn-sm btn-primary" onClick={() => saveSectionTitle(section.id)}>Save</button>
                                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingSectionId(null)}>Cancel</button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <h3 style={{ margin: 0 }}>{section.title}</h3>
                                        <button className="btn btn-sm btn-secondary" onClick={() => { setEditingSectionId(section.id); setEditSectionTitle(section.title); }}>
                                            <Pencil size={14} />
                                        </button>
                                        <button className="btn btn-sm btn-danger" onClick={() => deleteSection(section.id)}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                )}
                                
                                <button className="btn btn-sm btn-primary" onClick={() => openQuestionModal(section.id)}>
                                    + Add Question
                                </button>
                            </div>
                            
                            <div>
                                {section.questions?.length === 0 ? (
                                    <p style={{ color: 'var(--text-muted)', margin: 0, padding: 'var(--space-4) 0' }}>No questions in this section yet.</p>
                                ) : (
                                    <ul style={{ listStyleType: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        {section.questions?.map((q: any, i: number) => (
                                            <li key={q.id} className="question-item glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                                                            <strong style={{ fontSize: '1rem', color: 'var(--primary-400)' }}>Q{i + 1}</strong>
                                                            <span className="badge badge-primary">MCQ</span>
                                                            <span className={`badge ${
                                                                q.difficulty === 'EASY' ? 'badge-success' : 
                                                                q.difficulty === 'HARD' ? 'badge-danger' : 'badge-warning'
                                                            }`}>
                                                                {q.difficulty}
                                                            </span>
                                                            <span className="badge badge-primary" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)' }}>
                                                                {q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}
                                                            </span>
                                                            {q.negativeMarks > 0 ? (
                                                                <span className="badge badge-danger">
                                                                    -{q.negativeMarks} Penalty
                                                                </span>
                                                            ) : (
                                                                <span className="badge badge-success" style={{ backgroundColor: 'rgba(34, 197, 94, 0.05)' }}>
                                                                    No Penalty
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p style={{ fontSize: '1.05rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', color: 'var(--text-primary)', margin: 0 }}>
                                                            {q.text}
                                                        </p>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
                                                        <button className="btn btn-sm btn-secondary" onClick={() => openEditQuestionModal(section.id, q)}>
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button className="btn btn-sm btn-danger" onClick={() => deleteQuestion(q.id)}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* MCQ Options list */}
                                                {q.options && Array.isArray(q.options) && (
                                                    <div style={{ 
                                                        display: 'grid', 
                                                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
                                                        gap: '0.75rem',
                                                        marginTop: '0.5rem' 
                                                    }}>
                                                        {q.options.map((opt: any, idx: number) => (
                                                            <div 
                                                                key={idx} 
                                                                style={{ 
                                                                    padding: '0.75rem 1rem', 
                                                                    borderRadius: 'var(--radius-md)', 
                                                                    backgroundColor: opt.isCorrect ? 'rgba(34, 197, 94, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                                                                    border: opt.isCorrect ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid var(--border-subtle)',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.75rem'
                                                                }}
                                                            >
                                                                <span style={{ 
                                                                    fontWeight: 'bold', 
                                                                    color: opt.isCorrect ? 'var(--success-400)' : 'var(--text-secondary)',
                                                                    fontSize: '0.9rem'
                                                                }}>
                                                                    {String.fromCharCode(65 + idx)}.
                                                                </span>
                                                                <span style={{ 
                                                                    color: opt.isCorrect ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                                    fontSize: '0.95rem'
                                                                }}>
                                                                    {opt.text}
                                                                </span>
                                                                {opt.isCorrect && (
                                                                    <span style={{ 
                                                                        marginLeft: 'auto', 
                                                                        fontSize: '0.7rem', 
                                                                        backgroundColor: 'rgba(34, 197, 94, 0.15)', 
                                                                        color: 'var(--success-400)',
                                                                        padding: '2px 8px',
                                                                        borderRadius: 'var(--radius-full)',
                                                                        fontWeight: 'bold'
                                                                    }}>
                                                                        Correct
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Explanation */}
                                                {q.explanation && (
                                                    <div style={{ 
                                                        marginTop: '0.25rem', 
                                                        padding: '0.75rem 1rem', 
                                                        borderRadius: 'var(--radius-md)', 
                                                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                                        borderLeft: '3px solid var(--primary-400)',
                                                        fontSize: '0.9rem',
                                                        color: 'var(--text-secondary)'
                                                    }}>
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
                            <textarea 
                                className="form-control" 
                                rows={3}
                                value={qFormData.text}
                                onChange={(e) => setQFormData({...qFormData, text: e.target.value})}
                                placeholder="Enter the question text here..."
                            />
                        </div>

                        <div className="grid-2" style={{ gap: '1rem', marginTop: '1rem' }}>
                            <div className="form-group">
                                <label>Type</label>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    value="Multiple Choice (MCQ)"
                                    disabled
                                />
                            </div>
                            <div className="form-group">
                                <label>Difficulty</label>
                                <select 
                                    className="form-control"
                                    value={qFormData.difficulty}
                                    onChange={(e) => setQFormData({...qFormData, difficulty: e.target.value})}
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
                                    className="form-control" 
                                    value={qFormData.marks}
                                    onChange={(e) => setQFormData({...qFormData, marks: Number(e.target.value)})}
                                />
                            </div>
                            <div className="form-group">
                                <label>Negative Marks (Penalty)</label>
                                <input 
                                    type="number" 
                                    step="0.1"
                                    className="form-control" 
                                    value={qFormData.negativeMarks}
                                    onChange={(e) => setQFormData({...qFormData, negativeMarks: Number(e.target.value)})}
                                />
                            </div>
                        </div>

                        {/* Explanation Field */}
                        <div className="form-group" style={{ marginTop: '1rem' }}>
                            <label>Explanation (Optional)</label>
                            <textarea 
                                className="form-control" 
                                rows={2}
                                value={qFormData.explanation}
                                onChange={(e) => setQFormData({...qFormData, explanation: e.target.value})}
                                placeholder="Explain why the correct answer is correct (optional)..."
                            />
                        </div>

                        {qFormData.type === 'MCQ' && (
                            <div style={{ marginTop: '1.5rem' }}>
                                <h4>MCQ Options</h4>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    Provide up to 4 options and check the radio button for the correct one.
                                </p>
                                {qFormData.options.map((opt, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', alignItems: 'center' }}>
                                        <input 
                                            type="radio" 
                                            name="correct_option"
                                            checked={opt.isCorrect}
                                            onChange={() => {
                                                const newOptions = [...qFormData.options];
                                                newOptions.forEach(o => o.isCorrect = false);
                                                newOptions[idx].isCorrect = true;
                                                setQFormData({...qFormData, options: newOptions});
                                            }}
                                            style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                                        />
                                        <input 
                                            type="text" 
                                            className="form-control" 
                                            placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                                            value={opt.text}
                                            onChange={(e) => {
                                                const newOptions = [...qFormData.options];
                                                newOptions[idx].text = e.target.value;
                                                setQFormData({...qFormData, options: newOptions});
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="modal-actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button className="btn btn-secondary" onClick={() => setIsQuestionModalOpen(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveQuestion}>{isEditingQuestion ? 'Save Changes' : 'Create Question'}</button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
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