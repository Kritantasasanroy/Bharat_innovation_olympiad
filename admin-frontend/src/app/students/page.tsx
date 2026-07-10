'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type RoleFilter = 'STUDENT' | 'SCHOOL' | 'ALL';

interface ManagedUser {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    classBand: number | null;
    schoolId: string | null;
    schoolName: string | null;
    schoolCode: string | null;
    isActive: boolean;
    activatedAt: string | null;
    invitedAt: string | null;
    createdAt: string;
    attempts: number;
    payments: number;
    bookings: number;
}

interface SchoolOption {
    id: string;
    name: string;
    code: string;
}

/**
 * People management — the admin's full view of every user, with edit and
 * permanent delete. A delete archives the user's details (recoverable in
 * /archive) and requires typing their name, since it cannot be undone.
 */
export default function StudentsAdminPage() {
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [schools, setSchools] = useState<SchoolOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [role, setRole] = useState<RoleFilter>('STUDENT');
    const [query, setQuery] = useState('');

    const [editing, setEditing] = useState<ManagedUser | null>(null);
    const [deleting, setDeleting] = useState<ManagedUser | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = role === 'ALL' ? {} : { role };
            const { data } = await api.get<ManagedUser[]>('/admin/manage/users', { params });
            setUsers(data);
        } catch {
            setError('Could not load users.');
        } finally {
            setLoading(false);
        }
    }, [role]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        api.get<SchoolOption[]>('/admin/schools').then(({ data }) => setSchools(data)).catch(() => {});
    }, []);

    const visible = users.filter((u) => {
        const q = query.toLowerCase();
        return (
            !q ||
            `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            (u.schoolName ?? '').toLowerCase().includes(q)
        );
    });

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <div className="page-content">
                <div className="page-header">
                    <h1>People</h1>
                    <p className="text-muted">
                        Every registered user. Edit a profile, move a student between schools, or permanently
                        delete an account. Deletions are archived and can be reviewed under Archive.
                    </p>
                </div>

                <div className="analytics-toolbar">
                    <div className="class-pills">
                        {(['STUDENT', 'SCHOOL', 'ALL'] as RoleFilter[]).map((r) => (
                            <button
                                key={r}
                                className={`class-pill ${role === r ? 'active' : ''}`}
                                onClick={() => setRole(r)}
                            >
                                {r === 'STUDENT' ? 'Students' : r === 'SCHOOL' ? 'Coordinators' : 'All'}
                            </button>
                        ))}
                    </div>
                    <input
                        className="search-input"
                        placeholder="Search name, email, or school…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <span className="stats-pill">{visible.length} shown</span>
                </div>

                {error && <div className="form-error">{error}</div>}

                <div className="glass-card table-responsive">
                    {loading ? (
                        <div className="loading-container">
                            <div className="spinner" />
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="empty-state">
                            <h3>No users</h3>
                            <p className="text-muted">Nothing matches this filter.</p>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Class</th>
                                    <th>School</th>
                                    <th>Status</th>
                                    <th>Activity</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((u) => (
                                    <tr key={u.id}>
                                        <td>
                                            <div className="student-name">
                                                <Link href={`/students/${u.id}`} style={{ textDecoration: 'none' }}>
                                                    <strong style={{ color: 'var(--primary-400)' }}>
                                                        {u.firstName} {u.lastName}
                                                    </strong>
                                                </Link>
                                                <span className="join-date">{u.role}</span>
                                            </div>
                                        </td>
                                        <td className="text-muted">{u.email}</td>
                                        <td>{u.classBand ? `Class ${u.classBand}` : '—'}</td>
                                        <td>
                                            {u.schoolName ? (
                                                <span title={u.schoolCode ?? ''}>{u.schoolName}</span>
                                            ) : (
                                                <span className="text-muted">Independent</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`badge ${u.isActive ? 'badge-success' : 'badge-danger'}`}>
                                                {u.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                            {!u.activatedAt && u.invitedAt && (
                                                <span className="badge badge-warning" style={{ marginLeft: 4 }}>
                                                    Invited
                                                </span>
                                            )}
                                        </td>
                                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                            {u.attempts} exam{u.attempts === 1 ? '' : 's'} · {u.payments} paid
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                <button className="btn btn-sm btn-secondary" onClick={() => setEditing(u)}>
                                                    Edit
                                                </button>
                                                <button className="btn btn-sm btn-danger" onClick={() => setDeleting(u)}>
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {editing && (
                <EditUserModal
                    user={editing}
                    schools={schools}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        void load();
                    }}
                />
            )}

            {deleting && (
                <DeleteUserModal
                    user={deleting}
                    onClose={() => setDeleting(null)}
                    onDeleted={() => {
                        setDeleting(null);
                        void load();
                    }}
                />
            )}
        </AuthGuard>
    );
}

function EditUserModal({
    user,
    schools,
    onClose,
    onSaved,
}: {
    user: ManagedUser;
    schools: SchoolOption[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [firstName, setFirstName] = useState(user.firstName);
    const [lastName, setLastName] = useState(user.lastName);
    const [email, setEmail] = useState(user.email);
    const [classBand, setClassBand] = useState(user.classBand ?? '');
    const [schoolId, setSchoolId] = useState(user.schoolId ?? '');
    const [isActive, setIsActive] = useState(user.isActive);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(event: FormEvent) {
        event.preventDefault();
        setSaving(true);
        setError(null);
        try {
            await api.patch(`/admin/manage/users/${user.id}`, {
                firstName,
                lastName,
                email,
                classBand: classBand === '' ? undefined : Number(classBand),
                schoolId: schoolId === '' ? null : schoolId,
                isActive,
            });
            onSaved();
        } catch (e) {
            const err = e as { response?: { data?: { message?: string } } };
            setError(err.response?.data?.message ?? 'Could not save changes.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={() => !saving && onClose()}>
            <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                <h2>Edit {user.firstName} {user.lastName}</h2>
                <form className="exam-form" onSubmit={submit}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div className="form-group">
                            <label>First name</label>
                            <input className="form-control" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Last name</label>
                            <input className="form-control" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Email</label>
                        <input className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div className="form-group">
                            <label>Class</label>
                            <select className="form-control" value={classBand} onChange={(e) => setClassBand(e.target.value)}>
                                <option value="">—</option>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((c) => (
                                    <option key={c} value={c}>Class {c}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>School</label>
                            <select className="form-control" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
                                <option value="">Independent (no school)</option>
                                {schools.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                            Account is active (inactive accounts cannot sign in)
                        </label>
                    </div>
                    {error && <div className="form-error">{error}</div>}
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Saving…' : 'Save changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function DeleteUserModal({
    user,
    onClose,
    onDeleted,
}: {
    user: ManagedUser;
    onClose: () => void;
    onDeleted: () => void;
}) {
    const fullName = `${user.firstName} ${user.lastName}`.trim();
    const [confirm, setConfirm] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (confirm.trim() !== fullName) return;
        setBusy(true);
        setError(null);
        try {
            await api.delete(`/admin/manage/users/${user.id}`, { data: { reason: reason.trim() || undefined } });
            onDeleted();
        } catch {
            setError('Could not delete this user.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={() => !busy && onClose()}>
            <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                <h2>Permanently delete {fullName}?</h2>
                <p className="text-muted">
                    This removes the account and all its attempts, bookings, and payments from the database.
                    The person&apos;s details are archived (recoverable under Archive), but the operational
                    data cannot be restored.
                </p>
                <form className="exam-form" onSubmit={submit}>
                    <div className="form-group">
                        <label>Reason (recorded in the archive + audit log)</label>
                        <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate / test account" />
                    </div>
                    <div className="form-group">
                        <label>Type <strong>{fullName}</strong> to confirm</label>
                        <input className="form-control" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus />
                    </div>
                    {error && <div className="form-error">{error}</div>}
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-danger" disabled={busy || confirm.trim() !== fullName}>
                            {busy ? 'Deleting…' : 'Delete permanently'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
