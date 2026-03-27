'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { useEffect, useState } from 'react';

interface Attempt {
    id: string;
    status: string;
    totalScore: number | null;
    maxScore: number | null;
    submittedAt: string | null;
    examInstance: {
        exam: {
            title: string;
        }
    }
}

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    classBand: number | null;
    school: { name: string } | null;
    createdAt: string;
    attempts: Attempt[];
}

export default function AdminAnalyticsPage() {
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchStudents = async () => {
            try {
                const { data } = await api.get<Student[]>('/auth/admin/users');
                setStudents(data);
            } catch (err) {
                console.error('Failed to fetch students data', err);
            } finally {
                setLoading(false);
            }
        };

        fetchStudents();
    }, []);

    const filteredStudents = students.filter(student => {
        const query = searchTerm.toLowerCase();
        const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
        return fullName.includes(query) || 
               student.email.toLowerCase().includes(query) ||
               (student.school?.name || '').toLowerCase().includes(query);
    });

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main className="container page-content animate-fade-in">
                <div className="page-header">
                    <div>
                        <h1>Student Analytics</h1>
                        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                            Monitor all registered students, their schools, and their performance across exams.
                        </p>
                    </div>
                </div>

                <div className="analytics-toolbar">
                    <input 
                        type="text" 
                        placeholder="Search by name, email, or school..." 
                        className="search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <div className="stats-pill glass-card">
                        Total Students: <strong>{students.length}</strong>
                    </div>
                </div>

                {loading ? (
                    <div className="loading-container" style={{ minHeight: '300px' }}>
                        <div className="spinner" />
                    </div>
                ) : filteredStudents.length > 0 ? (
                    <div className="table-responsive glass-card">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Student Name</th>
                                    <th>School</th>
                                    <th>Class</th>
                                    <th>Email</th>
                                    <th>Exam Performance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStudents.map((student) => (
                                    <tr key={student.id}>
                                        <td>
                                            <div className="student-name">
                                                <strong>{student.firstName} {student.lastName}</strong>
                                                <span className="join-date">
                                                    Joined {new Date(student.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </td>
                                        <td>{student.school?.name || <span className="text-muted">—</span>}</td>
                                        <td>{student.classBand ? `Class ${student.classBand}` : <span className="text-muted">—</span>}</td>
                                        <td className="text-muted">{student.email}</td>
                                        <td>
                                            {student.attempts.length > 0 ? (
                                                <div className="attempts-list">
                                                    {student.attempts.map(attempt => (
                                                        <div key={attempt.id} className="attempt-badge">
                                                            <span className="exam-title" title={attempt.examInstance.exam.title}>
                                                                {attempt.examInstance.exam.title.length > 25 
                                                                    ? attempt.examInstance.exam.title.substring(0, 25) + '...' 
                                                                    : attempt.examInstance.exam.title}
                                                            </span>
                                                            <span className={`status-pill ${attempt.status.toLowerCase()}`}>
                                                                {attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED' 
                                                                    ? `${attempt.totalScore || 0} / ${attempt.maxScore || 100}` 
                                                                    : attempt.status.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-muted">No exams attempted yet</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="glass-card empty-state">
                        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>📊</div>
                        <h3>No Students Found</h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                            {searchTerm ? 'Try adjusting your search query.' : 'There are no students registered in the system yet.'}
                        </p>
                    </div>
                )}

                
            </main>
        </AuthGuard>
    );
}
