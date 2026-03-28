'use client';

import AuthGuard from '@/components/admin/layout/AuthGuard';
import Navbar from '@/components/admin/layout/Navbar';
import api from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function QuestionsContent() {
    const searchParams = useSearchParams();
    const examId = searchParams.get('examId');

    const [loading, setLoading] = useState(true);
    const [sections, setSections] = useState<any[]>([]);
    const [newSectionTitle, setNewSectionTitle] = useState('');
    const [error, setError] = useState('');

    // Modal state for adding questions
    const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
    const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
    const [qFormData, setQFormData] = useState({
        text: '',
        type: 'MCQ',
        difficulty: 'MEDIUM',
        marks: 5,
        negativeMarks: 0,
        mediaUrl: '',
        mediaType: 'NONE',
        options: [
            { text: '', isCorrect: true },
            { text: '', isCorrect: false },
            { text: '', isCorrect: false },
            { text: '', isCorrect: false }
        ]
    });

    const openQuestionModal = (sectionId: string, existingQuestion?: any) => {
        setActiveSectionId(sectionId);
        setIsQuestionModalOpen(true);
        if (existingQuestion) {
            setEditingQuestionId(existingQuestion.id);
            setQFormData({
                text: existingQuestion.text || '',
                type: existingQuestion.type || 'MCQ',
                difficulty: existingQuestion.difficulty || 'MEDIUM',
                marks: existingQuestion.marks || 1,
                negativeMarks: existingQuestion.negativeMarks || 0,
                mediaUrl: existingQuestion.mediaUrl || '',
                mediaType: existingQuestion.mediaType || 'NONE',
                options: existingQuestion.options || [
                    { text: '', isCorrect: true },
                    { text: '', isCorrect: false },
                    { text: '', isCorrect: false },
                    { text: '', isCorrect: false }
                ]
            });
        } else {
            setEditingQuestionId(null);
            setQFormData({
                text: '',
                type: 'MCQ',
                difficulty: 'MEDIUM',
                marks: 5,
                negativeMarks: 0,
                mediaUrl: '',
                mediaType: 'NONE',
                options: [
                    { text: '', isCorrect: true },
                    { text: '', isCorrect: false },
                    { text: '', isCorrect: false },
                    { text: '', isCorrect: false }
                ]
            });
        }
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

    const saveQuestion = async () => {
        if (!activeSectionId) return;
        
        // Validation
        if (!qFormData.text.trim()) {
            setError('Question text is required.');
            return;
        }

        const validOptions = qFormData.options.filter(o => o.text.trim());
        if (qFormData.type === 'MCQ' || qFormData.type === 'MULTI_SELECT') {
            if (validOptions.length < 2) {
                setError('At least two options are required.');
                return;
            }
            if (!validOptions.some(o => o.isCorrect)) {
                setError('At least one correct option must be selected.');
                return;
            }
        }

        try {
            const payload = {
                text: qFormData.text,
                type: qFormData.type,
                difficulty: qFormData.difficulty,
                marks: qFormData.marks,
                negativeMarks: qFormData.negativeMarks,
                mediaUrl: qFormData.mediaType !== 'NONE' ? qFormData.mediaUrl : null,
                mediaType: qFormData.mediaType !== 'NONE' ? qFormData.mediaType : null,
                options: validOptions
            };

            if (editingQuestionId) {
                await api.put(`/admin/questions/${editingQuestionId}`, payload);
            } else {
                await api.post(`/admin/sections/${activeSectionId}/questions`, payload);
            }

            setIsQuestionModalOpen(false);
            setEditingQuestionId(null);
            fetchExamDetails();
        } catch (err) {
            console.error('Failed to save question', err);
            setError('Failed to save question.');
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
                        Add sections and questions to this exam.
                    </p>
                </div>
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
                                placeholder="Section Title (e.g. Physics)"
                                value={newSectionTitle}
                                onChange={(e) => setNewSectionTitle(e.target.value)}
                            />
                            <button className="btn btn-primary" onClick={addSection}>Add Section</button>
                        </div>
                    </div>

                    {sections.map((section: any) => (
                        <div key={section.id} className="glass-card" style={{ marginBottom: 'var(--space-4)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3>{section.title}</h3>
                                <button className="btn btn-sm btn-secondary" onClick={() => openQuestionModal(section.id)}>
                                    + Add Question
                                </button>
                            </div>
                            
                            <div style={{ marginTop: '1rem' }}>
                                {section.questions?.length === 0 ? (
                                    <p style={{ color: 'var(--text-muted)' }}>No questions in this section yet.</p>
                                ) : (
                                    <ul style={{ listStyleType: 'none', padding: 0 }}>
                                        {section.questions?.map((q: any, i: number) => (
                                            <li key={q.id} style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <strong>Q{i + 1}:</strong> {q.text} 
                                                    <span className="badge badge-secondary" style={{ marginLeft: '1rem' }}>{q.type}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button className="btn btn-sm btn-secondary" onClick={() => openQuestionModal(section.id, q)}>Edit</button>
                                                    <button className="btn btn-sm btn-danger" onClick={() => deleteQuestion(q.id)}>Delete</button>
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

            {/* Add Question Modal */}
            {isQuestionModalOpen && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="modal-content glass-card" style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2>Add Question</h2>
                        
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
                                <label>Media Type (Optional)</label>
                                <select 
                                    className="form-control"
                                    value={qFormData.mediaType}
                                    onChange={(e) => setQFormData({...qFormData, mediaType: e.target.value})}
                                >
                                    <option value="NONE">None</option>
                                    <option value="IMAGE">Image</option>
                                    <option value="VIDEO">Video</option>
                                    <option value="AUDIO">Audio</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Media URL (if applicable)</label>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    placeholder="https://..."
                                    value={qFormData.mediaUrl}
                                    onChange={(e) => setQFormData({...qFormData, mediaUrl: e.target.value})}
                                    disabled={qFormData.mediaType === 'NONE'}
                                />
                            </div>
                        </div>

                        <div className="grid-2" style={{ gap: '1rem', marginTop: '1rem' }}>
                            <div className="form-group">
                                <label>Type</label>
                                <select 
                                    className="form-control"
                                    value={qFormData.type}
                                    onChange={(e) => setQFormData({...qFormData, type: e.target.value})}
                                >
                                    <option value="MCQ">Multiple Choice</option>
                                    <option value="MULTI_SELECT">Multi Select</option>
                                    <option value="TRUE_FALSE">True/False</option>
                                </select>
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
                                <label>Negative Marks</label>
                                <input 
                                    type="number" 
                                    className="form-control" 
                                    value={qFormData.negativeMarks}
                                    onChange={(e) => setQFormData({...qFormData, negativeMarks: Number(e.target.value)})}
                                />
                            </div>
                        </div>

                        {(qFormData.type === 'MCQ' || qFormData.type === 'MULTI_SELECT') && (
                            <div style={{ marginTop: '1.5rem' }}>
                                <h4>Options</h4>
                                {qFormData.options.map((opt, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', alignItems: 'center' }}>
                                        <input 
                                            type={qFormData.type === 'MCQ' ? 'radio' : 'checkbox'} 
                                            name="correct_option"
                                            checked={opt.isCorrect}
                                            onChange={() => {
                                                const newOptions = [...qFormData.options];
                                                if (qFormData.type === 'MCQ') {
                                                    newOptions.forEach(o => o.isCorrect = false);
                                                    newOptions[idx].isCorrect = true;
                                                } else {
                                                    newOptions[idx].isCorrect = !newOptions[idx].isCorrect;
                                                }
                                                setQFormData({...qFormData, options: newOptions});
                                            }}
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
                            <button className="btn btn-primary" onClick={saveQuestion}>{editingQuestionId ? 'Update Question' : 'Save Question'}</button>
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