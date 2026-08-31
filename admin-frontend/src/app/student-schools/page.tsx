'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, Fragment, useCallback, useEffect, useState } from 'react';

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    classBand: number | null;
    section: string | null;
    createdAt: string;
}

interface StudentSchool {
    id: string;
    name: string;
    code: string;
    city: string;
    state: string;
    pincode: string;
    members: number;
    createdAt: string;
    students: Student[];
}

const apiError = (err: unknown, fallback: string): string => {
    const message = (err as { response?: { data?: { message?: string | string[] } } })?.response
        ?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    return message || fallback;
};

export default function AdminStudentSchoolsPage() {
    const [schools, setSchools] = useState<StudentSchool[]>([]);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const load = useCallback(async (search = '') => {
        try {
            setLoading(true);
            const { data } = await api.get<StudentSchool[]>('/admin/manage/student-schools', {
                params: search ? { q: search } : {},
            });
            setSchools(data);
            setError('');
        } catch (err) {
            setError(apiError(err, 'Could not load student-onboarded schools.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        void load(query);
    }

    function toggle(schoolId: string) {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(schoolId)) next.delete(schoolId);
            else next.add(schoolId);
            return next;
        });
    }

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main className="container page-content animate-fade-in">
                <div className="page-header">
                    <div>
                        <h1>Student-onboarded schools</h1>
                        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                            Schools students added themselves because they could not find an
                            officially onboarded school. These are not visible to other students in
                            the directory until staff or a partner onboard them.
                        </p>
                    </div>
                </div>

                <form
                    className="glass-card"
                    style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-3)' }}
                    onSubmit={handleSubmit}
                >
                    <input
                        className="form-control"
                        placeholder="Search by name, code, city or pincode…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <button className="btn btn-primary" type="submit">
                        Search
                    </button>
                </form>

                {error && <div className="form-error" style={{ marginTop: 'var(--space-4)' }}>{error}</div>}

                <div className="glass-card" style={{ marginTop: 'var(--space-6)' }}>
                    {loading ? (
                        <div className="loading-container" style={{ minHeight: 200 }}>
                            <div className="spinner" />
                        </div>
                    ) : schools.length === 0 ? (
                        <p className="text-muted">No student-onboarded schools found.</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>School</th>
                                        <th>Location</th>
                                        <th>Students</th>
                                        <th>Added</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {schools.map((school) => (
                                        <Fragment key={school.id}>
                                            <tr>
                                                <td>
                                                    <div className="student-name">
                                                        <strong>{school.name}</strong>
                                                        <span className="join-date">{school.code}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    {school.city}, {school.state}
                                                    <br />
                                                    <span className="text-muted">{school.pincode}</span>
                                                </td>
                                                <td>{school.members}</td>
                                                <td>{new Date(school.createdAt).toLocaleDateString()}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => toggle(school.id)}
                                                    >
                                                        {expanded.has(school.id) ? 'Hide students' : 'View students'}
                                                    </button>
                                                </td>
                                            </tr>
                                            {expanded.has(school.id) && (
                                                <tr>
                                                    <td colSpan={5} style={{ padding: 0 }}>
                                                        <div
                                                            className="glass-card"
                                                            style={{
                                                                margin: 'var(--space-3)',
                                                                padding: 'var(--space-3)',
                                                                background: 'var(--bg-elevated)',
                                                            }}
                                                        >
                                                            {school.students.length === 0 ? (
                                                                <p className="text-muted">No students attached.</p>
                                                            ) : (
                                                                <table className="data-table">
                                                                    <thead>
                                                                        <tr>
                                                                            <th>Student</th>
                                                                            <th>Email</th>
                                                                            <th>Class</th>
                                                                            <th>Section</th>
                                                                            <th>Registered</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {school.students.map((student) => (
                                                                            <tr key={student.id}>
                                                                                <td>
                                                                                    {student.firstName} {student.lastName}
                                                                                </td>
                                                                                <td>{student.email}</td>
                                                                                <td>{student.classBand ? `Class ${student.classBand}` : '—'}</td>
                                                                                <td>{student.section ?? '—'}</td>
                                                                                <td>{new Date(student.createdAt).toLocaleDateString()}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </AuthGuard>
    );
}
