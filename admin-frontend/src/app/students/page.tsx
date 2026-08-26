'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type RoleFilter = 'STUDENT' | 'SCHOOL' | 'ALL';
type SourceFilter = 'ALL' | 'SELF' | 'SCHOOL' | 'PARTNER';
type SortField = 'name' | 'classBand' | 'attempts' | 'status' | 'createdAt' | 'onboardedBy';
type SortOrder = 'asc' | 'desc';

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
    onboardedBy?: 'SELF' | 'SCHOOL' | 'PARTNER';
    partnerName?: string | null;
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
    const [classFilter, setClassFilter] = useState<string>('ALL');
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');
    const [sortField, setSortField] = useState<SortField>('createdAt');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    const load = useCallback(async (background = false) => {
        if (!background) setLoading(true);
        try {
            const params = role === 'ALL' ? {} : { role };
            const { data } = await api.get<ManagedUser[]>('/admin/manage/users', { params });
            setUsers(data);
            setError(null);
        } catch {
            if (!background) setError('Could not load users.');
        } finally {
            if (!background) setLoading(false);
        }
    }, [role]);

    useEffect(() => {
        void load();
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') void load(true);
        }, 12_000);
        return () => clearInterval(id);
    }, [load]);

    useEffect(() => {
        api.get<SchoolOption[]>('/admin/schools').then(({ data }) => setSchools(data)).catch(() => {});
    }, []);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder(field === 'attempts' || field === 'createdAt' ? 'desc' : 'asc');
        }
    };

    const visible = users
        .filter((u) => {
            const q = query.toLowerCase();
            const matchesQuery =
                !q ||
                `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                (u.schoolName ?? '').toLowerCase().includes(q) ||
                (u.partnerName ?? '').toLowerCase().includes(q);

            const matchesClass =
                classFilter === 'ALL' ||
                (classFilter === 'NONE' && u.classBand === null) ||
                String(u.classBand) === classFilter;

            const matchesSource =
                sourceFilter === 'ALL' ||
                (u.onboardedBy ?? (u.schoolId ? 'SCHOOL' : 'SELF')) === sourceFilter;

            return matchesQuery && matchesClass && matchesSource;
        })
        .sort((a, b) => {
            let res = 0;
            if (sortField === 'name') {
                res = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
            } else if (sortField === 'classBand') {
                res = (a.classBand ?? 0) - (b.classBand ?? 0);
            } else if (sortField === 'attempts') {
                res = (a.attempts ?? 0) - (b.attempts ?? 0);
            } else if (sortField === 'status') {
                res = Number(b.isActive) - Number(a.isActive);
            } else if (sortField === 'onboardedBy') {
                res = (a.onboardedBy ?? '').localeCompare(b.onboardedBy ?? '');
            } else if (sortField === 'createdAt') {
                res = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            }
            return sortOrder === 'asc' ? res : -res;
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

                <div className="analytics-toolbar" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
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

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <select
                            className="search-input"
                            style={{ padding: '0.45rem 0.75rem', width: 'auto', minWidth: 120 }}
                            value={classFilter}
                            onChange={(e) => setClassFilter(e.target.value)}
                        >
                            <option value="ALL">All Grades/Classes</option>
                            {[6, 7, 8, 9, 10, 11, 12].map((cls) => (
                                <option key={cls} value={String(cls)}>Class {cls}</option>
                            ))}
                            <option value="NONE">No Class Assigned</option>
                        </select>

                        <select
                            className="search-input"
                            style={{ padding: '0.45rem 0.75rem', width: 'auto', minWidth: 140 }}
                            value={sourceFilter}
                            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
                        >
                            <option value="ALL">All Onboard Sources</option>
                            <option value="SELF">Onboarded: Self</option>
                            <option value="SCHOOL">Onboarded: School</option>
                            <option value="PARTNER">Onboarded: Partner</option>
                        </select>

                        <select
                            className="search-input"
                            style={{ padding: '0.45rem 0.75rem', width: 'auto', minWidth: 150 }}
                            value={`${sortField}-${sortOrder}`}
                            onChange={(e) => {
                                const [f, o] = e.target.value.split('-') as [SortField, SortOrder];
                                setSortField(f);
                                setSortOrder(o);
                            }}
                        >
                            <option value="createdAt-desc">Newest First</option>
                            <option value="createdAt-asc">Oldest First</option>
                            <option value="classBand-asc">Grade/Class (6 → 12)</option>
                            <option value="classBand-desc">Grade/Class (12 → 6)</option>
                            <option value="attempts-desc">Exams Submitted (High → Low)</option>
                            <option value="attempts-asc">Exams Submitted (Low → High)</option>
                            <option value="name-asc">Name (A → Z)</option>
                            <option value="name-desc">Name (Z → A)</option>
                            <option value="onboardedBy-asc">Onboarding Source</option>
                        </select>
                    </div>

                    <input
                        className="search-input"
                        placeholder="Search name, email, school, partner…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        style={{ flex: 1, minWidth: 200 }}
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
                                    <th onClick={() => handleSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        Name {sortField === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th>Email</th>
                                    <th onClick={() => handleSort('classBand')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        Class/Grade {sortField === 'classBand' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th>School</th>
                                    <th onClick={() => handleSort('onboardedBy')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        Onboarded By {sortField === 'onboardedBy' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th onClick={() => handleSort('status')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        Status {sortField === 'status' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th onClick={() => handleSort('attempts')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        Exams Submitted / Activity {sortField === 'attempts' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((u) => {
                                    const source = u.onboardedBy ?? (u.schoolId ? 'SCHOOL' : 'SELF');
                                    return (
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
                                            <td>
                                                {u.classBand ? (
                                                    <span className="badge" style={{ background: 'rgba(125,200,50,0.15)', color: '#7dc832', fontWeight: 600 }}>
                                                        Class {u.classBand}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted">—</span>
                                                )}
                                            </td>
                                            <td>
                                                {u.schoolName ? (
                                                    <span title={u.schoolCode ?? ''}>{u.schoolName}</span>
                                                ) : (
                                                    <span className="text-muted">Independent</span>
                                                )}
                                            </td>
                                            <td>
                                                {source === 'PARTNER' ? (
                                                    <span className="badge" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontWeight: 600 }}>
                                                        Partner{u.partnerName ? `: ${u.partnerName}` : ''}
                                                    </span>
                                                ) : source === 'SCHOOL' ? (
                                                    <span className="badge" style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', fontWeight: 600 }}>
                                                        School{u.schoolName ? `: ${u.schoolName}` : ''}
                                                    </span>
                                                ) : (
                                                    <span className="badge" style={{ background: 'rgba(156,163,175,0.15)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                                        Self Registered
                                                    </span>
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
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <strong style={{ fontSize: '0.85rem', color: u.attempts > 0 ? 'var(--success-400)' : 'var(--text-secondary)' }}>
                                                        {u.attempts} exam{u.attempts === 1 ? '' : 's'} submitted
                                                    </strong>
                                                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                                                        {u.payments} paid · {u.bookings} booking{u.bookings === 1 ? '' : 's'}
                                                    </span>
                                                </div>
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
                                    );
                                })}
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
