'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useState } from 'react';

/**
 * Admin control over schools (item 20): edit a school's details, and — the part
 * that matters most — **reassign it to a different partner**.
 *
 * `School.partnerId` is what scopes a partner's view of students and results, and
 * what the school portal reads to show its own partner card. A school with no
 * partner falls back to the house partner rather than showing nothing, so
 * "unassigned" is a real, working state, not a broken one.
 */

interface School {
    id: string;
    name: string;
    code: string;
    city: string;
    state: string;
    pincode: string;
    board: string | null;
    udiseCode: string | null;
    partnerId: string | null;
    partnerName: string | null;
    onboardedAt: string | null;
    status: string;
    members: number;
    coordinator: {
        coordinatorName: string;
        coordinatorEmail: string;
        coordinatorPhone: string;
        status: string;
    } | null;
}

interface Partner {
    id: string;
    partnerId: string | null;
    orgName: string;
    status: string;
    schools: number;
}

const apiError = (err: unknown, fallback: string): string => {
    const message = (err as { response?: { data?: { message?: string | string[] } } })?.response
        ?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    return message || fallback;
};

export default function AdminSchoolsPage() {
    const [schools, setSchools] = useState<School[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [editing, setEditing] = useState<School | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async (search = '') => {
        try {
            setLoading(true);
            const [s, p] = await Promise.all([
                api.get<School[]>('/admin/manage/schools', { params: search ? { q: search } : {} }),
                api.get<Partner[]>('/admin/manage/partners'),
            ]);
            setSchools(s.data);
            // Only approved partners with a provisioned engine id can own a school.
            setPartners(p.data.filter((x) => x.partnerId && x.status === 'APPROVED'));
            setError('');
        } catch (err) {
            setError(apiError(err, 'Could not load schools.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!editing) return;
        const form = new FormData(event.currentTarget);

        try {
            setSaving(true);
            setError('');
            await api.patch(`/admin/manage/schools/${editing.id}`, {
                name: String(form.get('name')),
                city: String(form.get('city')),
                state: String(form.get('state')),
                pincode: String(form.get('pincode')),
                board: String(form.get('board') || ''),
                udiseCode: String(form.get('udiseCode') || ''),
                // "" means detach — the school falls back to the house partner.
                partnerId: String(form.get('partnerId') || '') || null,
            });
            setEditing(null);
            setNotice('School updated.');
            await load(query);
        } catch (err) {
            setError(apiError(err, 'Could not save that school.'));
        } finally {
            setSaving(false);
        }
    }

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main className="container page-content animate-fade-in">
                <div className="page-header">
                    <div>
                        <h1>Schools</h1>
                        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                            Edit a school’s details and assign it to a partner. A school with no
                            partner reports to Bharat Innovation Olympiad directly.
                        </p>
                    </div>
                </div>

                <form
                    className="glass-card"
                    style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-3)' }}
                    onSubmit={(e) => {
                        e.preventDefault();
                        void load(query);
                    }}
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
                {notice && (
                    <p className="hint" style={{ marginTop: 'var(--space-4)', color: 'var(--success-400)' }}>
                        ✓ {notice}
                    </p>
                )}

                <div className="glass-card" style={{ marginTop: 'var(--space-6)' }}>
                    {loading ? (
                        <div className="loading-container" style={{ minHeight: 200 }}>
                            <div className="spinner" />
                        </div>
                    ) : schools.length === 0 ? (
                        <p className="text-muted">No schools found.</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>School</th>
                                        <th>Location</th>
                                        <th>Partner</th>
                                        <th>Coordinator</th>
                                        <th>People</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {schools.map((school) => (
                                        <tr key={school.id}>
                                            <td>
                                                <div className="student-name">
                                                    <strong>{school.name}</strong>
                                                    <span className="join-date">
                                                        {school.code} ·{' '}
                                                        {school.status === 'ACTIVE'
                                                            ? 'Onboarded'
                                                            : 'Directory only'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                {school.city}, {school.state}
                                                <br />
                                                <span className="text-muted">{school.pincode}</span>
                                            </td>
                                            <td>
                                                {school.partnerId ? (
                                                    <span className="badge badge-primary">
                                                        {school.partnerName ?? school.partnerId.slice(0, 8)}
                                                    </span>
                                                ) : (
                                                    <span
                                                        className="badge badge-muted"
                                                        title="Falls back to Bharat Innovation Olympiad — Partner access"
                                                    >
                                                        House partner
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                {school.coordinator ? (
                                                    <>
                                                        {school.coordinator.coordinatorName}
                                                        <br />
                                                        <span className="text-muted">
                                                            {school.coordinator.coordinatorEmail}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-muted">—</span>
                                                )}
                                            </td>
                                            <td>{school.members}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => {
                                                        setEditing(school);
                                                        setNotice('');
                                                    }}
                                                >
                                                    ✎ Edit
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {editing && (
                    <div className="modal-overlay" onClick={() => setEditing(null)}>
                        <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                            <h2>Edit school</h2>
                            <p className="text-muted">{editing.code}</p>

                            <form className="exam-form" onSubmit={save}>
                                <div className="form-group">
                                    <label>Name</label>
                                    <input name="name" className="form-control" required defaultValue={editing.name} />
                                </div>

                                <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
                                    <div className="form-group">
                                        <label>City</label>
                                        <input name="city" className="form-control" required defaultValue={editing.city} />
                                    </div>
                                    <div className="form-group">
                                        <label>State</label>
                                        <input name="state" className="form-control" required defaultValue={editing.state} />
                                    </div>
                                </div>

                                <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
                                    <div className="form-group">
                                        <label>Pincode</label>
                                        <input
                                            name="pincode"
                                            className="form-control"
                                            required
                                            pattern="\d{6}"
                                            defaultValue={editing.pincode}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Board</label>
                                        <input name="board" className="form-control" defaultValue={editing.board ?? ''} />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>UDISE code</label>
                                    <input name="udiseCode" className="form-control" defaultValue={editing.udiseCode ?? ''} />
                                </div>

                                <div className="form-group">
                                    <label>Partner</label>
                                    <select
                                        name="partnerId"
                                        className="form-control"
                                        defaultValue={editing.partnerId ?? ''}
                                    >
                                        <option value="">
                                            No partner — reports to Bharat Innovation Olympiad
                                        </option>
                                        {partners.map((partner) => (
                                            <option key={partner.id} value={partner.partnerId ?? ''}>
                                                {partner.orgName} ({partner.schools} schools)
                                            </option>
                                        ))}
                                    </select>
                                    <p className="hint hint-muted" style={{ marginTop: 'var(--space-2)' }}>
                                        The partner sees this school’s students, and its results once
                                        you release them to partners.
                                    </p>
                                </div>

                                <p className="hint hint-muted">
                                    Renaming a school also rewrites its directory key. If another
                                    school already exists under that name at this pincode, the save is
                                    refused rather than creating a duplicate.
                                </p>

                                <div className="modal-actions">
                                    <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-primary" disabled={saving}>
                                        {saving ? 'Saving…' : 'Save changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </AuthGuard>
    );
}
