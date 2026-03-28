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
            options: options
        });
        setIsQuestionModalOpen(true);
    };

    const fetchExamDetails = async () => {
        if (!examId) return;
        try {
            setLoading(true);
            const { data } = await api.get(`/exams/${examId}`);
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

    return (
        <main className="container page-content animate-fade-in">
            <div className="page-header">
                <div>
                    <h1>Manage Questions</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                        Organize your sections and question bank for this exam.
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
                <div style={{ marginTop: 'var(--space-6)' }}>
                    <div className="glass-card" style={{ marginBottom: 'var(--space-6)' }}>
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
                        <div key={section.id} className="glass-card" style={{ marginBottom: 'var(--space-4)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                                        <h3>{section.title}</h3>
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
                            
                            <div style={{ marginTop: '1.5rem' }}>
                                {section.questions?.length === 0 ? (
                                    <p style={{ color: 'var(--text-muted)' }}>No questions in this section yet.</p>
                                ) : (
                                    <ul style={{ listStyleType: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {section.questions?.map((q: any, i: number) => (
                                            <li key={q.id} className="question-item glass-card" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem' }}>
                                                <div>
                                                    <strong>Q{i + 1}:</strong> {q.text} 
                                                    <span className="badge badge-secondary" style={{ marginLeft: '1rem' }}>MCQ</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button className="btn btn-sm btn-secondary" onClick={() => openEditQuestionModal(section.id, q)}>
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button className="btn btn-sm btn-danger" onClick={() => deleteQuestion(q.id)}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
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