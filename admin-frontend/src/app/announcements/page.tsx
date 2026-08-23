'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type Audience = 'PARTNER' | 'SCHOOL' | 'ALL';
type Announcement = {
    id: string;
    title: string;
    body: string;
    audience: Audience;
    publishedAt: string;
    expiresAt: string | null;
    active: boolean;
    createdAt: string;
};

const AUDIENCE_LABEL: Record<Audience, string> = {
    PARTNER: 'Partners',
    SCHOOL: 'Schools',
    ALL: 'Everyone',
};

const AUDIENCE_CLASS: Record<Audience, string> = {
    PARTNER: 'kind-tag kind-tag--partner',
    SCHOOL: 'kind-tag kind-tag--school',
    ALL: 'kind-tag',
};

function toLocalInput(date: string) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
    return new Date(value).toISOString();
}

/**
 * Admin announcements console. Posts are visible to the selected audience in the
 * partner and school portals once their publish time arrives and until they expire.
 */
export default function AdminAnnouncementsPage() {
    const [items, setItems] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [editing, setEditing] = useState<Announcement | null>(null);

    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [audience, setAudience] = useState<Audience>('ALL');
    const [publishedAt, setPublishedAt] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async (background = false) => {
        if (!background) setLoading(true);
        try {
            const { data } = await api.get<Announcement[]>('/admin/announcements');
            setItems(data);
            setError(null);
        } catch {
            if (!background) setError('Could not load announcements.');
        } finally {
            if (!background) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (editing) {
            setTitle(editing.title);
            setBody(editing.body);
            setAudience(editing.audience);
            setPublishedAt(toLocalInput(editing.publishedAt));
            setExpiresAt(editing.expiresAt ? toLocalInput(editing.expiresAt) : '');
            setIsActive(editing.active);
        } else {
            setTitle('');
            setBody('');
            setAudience('ALL');
            setPublishedAt(toLocalInput(new Date().toISOString()));
            setExpiresAt('');
            setIsActive(true);
        }
    }, [editing]);

    function resetForm() {
        setEditing(null);
        setTitle('');
        setBody('');
        setAudience('ALL');
        setPublishedAt(toLocalInput(new Date().toISOString()));
        setExpiresAt('');
        setIsActive(true);
        setError(null);
    }

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!title.trim() || !body.trim() || !publishedAt) return;

        const payload = {
            title: title.trim(),
            body: body.trim(),
            audience,
            publishedAt: fromLocalInput(publishedAt),
            expiresAt: expiresAt ? fromLocalInput(expiresAt) : undefined,
            active: isActive,
        };

        setSaving(true);
        setError(null);
        try {
            if (editing) {
                await api.patch(`/admin/announcements/${editing.id}`, payload);
            } else {
                await api.post('/admin/announcements', payload);
            }
            resetForm();
            await load();
        } catch (e: any) {
            setError(e.response?.data?.message ?? 'Could not save the announcement.');
        } finally {
            setSaving(false);
        }
    }

    async function remove(id: string) {
        if (!window.confirm('Delete this announcement? It will no longer appear in any portal.')) return;
        try {
            await api.delete(`/admin/announcements/${id}`);
            await load();
        } catch {
            setError('Could not delete the announcement.');
        }
    }

    const now = new Date();

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <div className="page-content">
                <div className="page-header">
                    <h1>Announcements</h1>
                    <p className="text-muted">
                        Post notices to the <strong>partner</strong> and <strong>school</strong> portals.
                        Items only show after their publish time and only if active.
                    </p>
                </div>

                <div className="glass-card" style={{ marginBottom: 'var(--space-6)' }}>
                    <h2>{editing ? 'Edit announcement' : 'New announcement'}</h2>
                    <form onSubmit={submit}>
                        <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                            <div className="form-group">
                                <label>Title</label>
                                <input
                                    className="form-control"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Audience</label>
                                <select
                                    className="form-control"
                                    value={audience}
                                    onChange={(e) => setAudience(e.target.value as Audience)}
                                >
                                    <option value="ALL">Everyone</option>
                                    <option value="PARTNER">Partners only</option>
                                    <option value="SCHOOL">Schools only</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Publish at</label>
                                <input
                                    className="form-control"
                                    type="datetime-local"
                                    value={publishedAt}
                                    onChange={(e) => setPublishedAt(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Expires at (optional)</label>
                                <input
                                    className="form-control"
                                    type="datetime-local"
                                    value={expiresAt}
                                    onChange={(e) => setExpiresAt(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                            <label>Body</label>
                            <textarea
                                className="form-control"
                                rows={4}
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)}
                                />
                                Active
                            </label>
                        </div>
                        {error && <div className="form-error" style={{ marginBottom: 'var(--space-3)' }}>{error}</div>}
                        <div className="modal-actions" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
                            <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={saving}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? 'Saving…' : editing ? 'Update' : 'Post announcement'}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="glass-card table-responsive">
                    {loading ? (
                        <div className="loading-container"><div className="spinner" /></div>
                    ) : items.length === 0 ? (
                        <div className="empty-state">
                            <h3>No announcements</h3>
                            <p className="text-muted">Create one above to show it in the partner and school portals.</p>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>Audience</th>
                                    <th>Status</th>
                                    <th>Publish</th>
                                    <th>Expires</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((a) => {
                                    const visible = a.active && new Date(a.publishedAt) <= now && (!a.expiresAt || new Date(a.expiresAt) > now);
                                    return (
                                        <tr key={a.id}>
                                            <td>
                                                <strong>{a.title}</strong>
                                                <div className="text-muted" style={{ fontSize: '0.8rem', maxWidth: 360 }}>
                                                    {a.body.length > 90 ? `${a.body.slice(0, 90)}…` : a.body}
                                                </div>
                                            </td>
                                            <td><span className={AUDIENCE_CLASS[a.audience]}>{AUDIENCE_LABEL[a.audience]}</span></td>
                                            <td>
                                                {visible ? (
                                                    <span className="badge badge-success">Live</span>
                                                ) : a.active ? (
                                                    <span className="badge badge-info">Scheduled</span>
                                                ) : (
                                                    <span className="badge badge-neutral">Inactive</span>
                                                )}
                                            </td>
                                            <td className="text-muted">{new Date(a.publishedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                                            <td className="text-muted">{a.expiresAt ? new Date(a.expiresAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className="btn btn-sm btn-secondary" onClick={() => setEditing(a)} style={{ marginRight: 'var(--space-2)' }}>
                                                    Edit
                                                </button>
                                                <button className="btn btn-sm btn-danger" onClick={() => remove(a.id)}>
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </AuthGuard>
    );
}
