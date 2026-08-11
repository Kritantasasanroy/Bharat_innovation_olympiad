'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * "Please mark the training modules you have attended for Bharat Innovation
 * Olympiad."
 *
 * Self-declared attendance. The sessions are run by schools and partners in
 * rooms the platform has no presence in, so the student is the only party who
 * can report attendance at the time it happens — there is no register to import
 * and no host to confirm it.
 *
 * That shapes the page: it is a form, not a record. It says plainly that this is
 * the student's own answer, it can be changed at any time, and it does not
 * affect their marks — because a checklist that looks like it might affect a
 * score is a checklist people tick optimistically.
 */

interface TrainingModule {
    key: string;
    label: string;
    attended: boolean;
    attendedAt: string | null;
}

export default function TrainingPage() {
    const [modules, setModules] = useState<TrainingModule[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    /** What was on the server when the page loaded, so Save can be disabled
     *  until something actually differs. */
    const [savedKeys, setSavedKeys] = useState<string>('');

    useEffect(() => {
        api.get('/training/me')
            .then(({ data }) => {
                const list: TrainingModule[] = data.modules ?? [];
                setModules(list);
                const ticked = list.filter((m) => m.attended).map((m) => m.key);
                setSelected(new Set(ticked));
                setSavedKeys([...ticked].sort().join(','));
            })
            .catch(() => setMessage({ text: 'Could not load your training list. Refresh to try again.', type: 'error' }))
            .finally(() => setLoading(false));
    }, []);

    const toggle = (key: string) => {
        setMessage(null);
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const currentKeys = [...selected].sort().join(',');
    const isDirty = currentKeys !== savedKeys;

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const { data } = await api.post('/training/me', { moduleKeys: [...selected] });
            const list: TrainingModule[] = data.modules ?? [];
            setModules(list);
            const ticked = list.filter((m) => m.attended).map((m) => m.key);
            setSelected(new Set(ticked));
            setSavedKeys([...ticked].sort().join(','));
            setMessage({ text: 'Saved. You can change this at any time.', type: 'success' });
        } catch {
            setMessage({ text: 'Could not save just now. Check your connection and try again.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const attendedCount = selected.size;

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container page-content animate-fade-in" style={{ maxWidth: '760px' }}>
                <header className="training-header">
                    <h1>Training</h1>
                    <p>
                        Please mark the training modules you have attended for the Bharat Innovation
                        Olympiad.
                    </p>
                </header>

                {loading ? (
                    <div className="loading-container" style={{ minHeight: '200px' }}>
                        <div className="spinner" />
                    </div>
                ) : (
                    <>
                        <section className="glass-card training-card">
                            <div className="training-card__head">
                                <h2>Modules attended</h2>
                                <span className="training-count">
                                    {attendedCount} of {modules.length}
                                </span>
                            </div>

                            <ul className="training-list">
                                {modules.map((m) => {
                                    const checked = selected.has(m.key);
                                    return (
                                        <li key={m.key}>
                                            <label className={`training-item ${checked ? 'is-checked' : ''}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggle(m.key)}
                                                />
                                                <span className="training-item__label">
                                                    {m.label}
                                                    {/* When they first said so. Shown because a
                                                        self-declared record is only auditable if
                                                        the student can see what was recorded. */}
                                                    {m.attended && m.attendedAt && (
                                                        <small>
                                                            Marked on{' '}
                                                            {new Date(m.attendedAt).toLocaleDateString('en-IN', {
                                                                day: 'numeric',
                                                                month: 'short',
                                                                year: 'numeric',
                                                            })}
                                                        </small>
                                                    )}
                                                </span>
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>

                            {message && (
                                <p className={`training-message training-message--${message.type}`}>
                                    {message.text}
                                </p>
                            )}

                            <button
                                type="button"
                                className="btn btn-primary btn-lg"
                                onClick={handleSave}
                                disabled={saving || !isDirty}
                                style={{ width: '100%', marginTop: '1rem' }}
                            >
                                {saving ? 'Saving…' : isDirty ? 'Save' : 'Saved'}
                            </button>
                        </section>

                        <section className="glass-card training-card training-card--note">
                            <h2>About this list</h2>
                            <ul className="submitted-list">
                                <li>
                                    This is your own answer. Nobody is marked present or absent for
                                    you, and you can change it whenever you like.
                                </li>
                                <li>
                                    It does <strong>not</strong> affect your exam score or your rank.
                                    It records which sessions you took part in across the season.
                                </li>
                                <li>
                                    Your training appears alongside your exams on your{' '}
                                    <Link href="/certificates">certificates page</Link>.
                                </li>
                            </ul>
                        </section>
                    </>
                )}
            </main>
        </AuthGuard>
    );
}
