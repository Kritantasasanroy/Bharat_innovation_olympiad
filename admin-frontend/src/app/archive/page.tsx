'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';

type TypeFilter = 'ALL' | 'STUDENT' | 'SCHOOL' | 'PARTNER';

interface ArchivedEntity {
    id: string;
    entityType: 'STUDENT' | 'SCHOOL' | 'PARTNER';
    originalId: string;
    name: string;
    email: string | null;
    phone: string | null;
    reason: string | null;
    deletedBy: string;
    deletedByEmail: string | null;
    deletedAt: string;
}

const TYPE_BADGE: Record<ArchivedEntity['entityType'], string> = {
    STUDENT: 'badge badge-info',
    SCHOOL: 'badge badge-success',
    PARTNER: 'badge badge-warning',
};

/**
 * The deletion archive — the preserved details of every student, school, and
 * partner permanently removed from the database. Read-only: a record here is a
 * tombstone, kept so a deletion is accountable and the contact recoverable.
 */
export default function ArchivePage() {
    const [rows, setRows] = useState<ArchivedEntity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [type, setType] = useState<TypeFilter>('ALL');
    const [query, setQuery] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = type === 'ALL' ? {} : { type };
            const { data } = await api.get<ArchivedEntity[]>('/admin/manage/archive', { params });
            setRows(data);
        } catch {
            setError('Could not load the archive.');
        } finally {
            setLoading(false);
        }
    }, [type]);

    useEffect(() => {
        void load();
    }, [load]);

    const visible = rows.filter((r) => {
        const q = query.toLowerCase();
        return (
            !q ||
            r.name.toLowerCase().includes(q) ||
            (r.email ?? '').toLowerCase().includes(q) ||
            (r.phone ?? '').includes(query)
        );
    });

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <div className="page-content">
                <div className="page-header">
                    <h1>Archive</h1>
                    <p className="text-muted">
                        Preserved details of permanently deleted students, schools, and partners. Their
                        operational data was removed; these records are kept for recovery and audit.
                    </p>
                </div>

                <div className="analytics-toolbar">
                    <div className="class-pills">
                        {(['ALL', 'STUDENT', 'SCHOOL', 'PARTNER'] as TypeFilter[]).map((t) => (
                            <button
                                key={t}
                                className={`class-pill ${type === t ? 'active' : ''}`}
                                onClick={() => setType(t)}
                            >
                                {t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>
                    <input
                        className="search-input"
                        placeholder="Search name, email, or phone…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <span className="stats-pill">{visible.length} records</span>
                </div>

                {error && <div className="form-error">{error}</div>}

                <div className="glass-card table-responsive">
                    {loading ? (
                        <div className="loading-container">
                            <div className="spinner" />
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="empty-state">
                            <h3>Nothing archived</h3>
                            <p className="text-muted">Deleted records will appear here.</p>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Reason</th>
                                    <th>Deleted</th>
                                    <th>By</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((r) => (
                                    <tr key={r.id}>
                                        <td>
                                            <span className={TYPE_BADGE[r.entityType]}>{r.entityType}</span>
                                        </td>
                                        <td><strong>{r.name}</strong></td>
                                        <td className="text-muted">{r.email ?? '—'}</td>
                                        <td className="text-muted">{r.phone ?? '—'}</td>
                                        <td className="text-muted">{r.reason ?? '—'}</td>
                                        <td className="text-muted">
                                            {new Date(r.deletedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                                        </td>
                                        <td className="text-muted">{r.deletedByEmail ?? r.deletedBy}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </AuthGuard>
    );
}
