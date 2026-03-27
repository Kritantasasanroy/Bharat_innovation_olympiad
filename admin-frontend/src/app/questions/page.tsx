'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
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
    const [qFormData, setQFormData] = useState({
        text: '',
        type: 'MCQ',
        difficulty: 'MEDIUM',
        marks: 5,
        negativeMarks: 0,
        options: [
            { text: '', isCorrect: true },
            { text: '', isCorrect: false },
            { text: '', isCorrect: false },
            { text: '', isCorrect: false }
        ]
    });

    const openQuestionModal = (sectionId: string) => {
        setActiveSectionId(sectionId);
        setIsQuestionModalOpen(true);
        setQFormData({
            text: '',
            type: 'MCQ',
            difficulty: 'MEDIUM',
            marks: 5,
            negativeMarks: 0,
            options: [
                { text: '', isCorrect: true },
                { text: '', isCorrect: false },
                { text: '', isCorrect: false },
                { text: '', isCorrect: false }
            ]
        });
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

    const addQuestion = async () => {
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
            await api.post(`/admin/sections/${activeSectionId}/questions`, {
                text: qFormData.text,
                type: qFormData.type,
                difficulty: qFormData.difficulty,
                marks: qFormData.marks,
                negativeMarks: qFormData.negativeMarks,
                options: validOptions
            });
            setIsQuestionModalOpen(false);
            fetchExamDetails();
        } catch (err) {
            console.error('Failed to add question', err);
            setError('Failed to add question.');
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
                                            <li key={q.id} style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                                                <strong>Q{i + 1}:</strong> {q.text} 
                                                <span className="badge badge-secondary" style={{ marginLeft: '1rem' }}>{q.type}</span>
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
                                                }
                                                newOptions[idx].isCorrect = !newOptions[idx].isCorrect;
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
                            <button className="btn btn-primary" onClick={addQuestion}>Save Question</button>
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