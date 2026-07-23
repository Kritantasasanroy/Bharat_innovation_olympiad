'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type Audience = 'ALL_STUDENTS' | 'CLASS' | 'CUSTOM';

const CLASS_OPTIONS = [6, 7, 8, 9, 10, 11, 12];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface SendResult {
    total: number;
    sent: number;
    failed: number;
}

/**
 * Admin outbound email. Compose an announcement and send it to every student,
 * a single class, or a typed list of addresses. Delivery goes through the same
 * Resend provider the transactional mails use.
 */
export default function AdminMailPage() {
    const [audience, setAudience] = useState<Audience>('ALL_STUDENTS');
    const [classBand, setClassBand] = useState(6);
    const [customEmailsText, setCustomEmailsText] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');

    const [audienceCount, setAudienceCount] = useState<number | null>(null);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<SendResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Parse the typed list into valid, deduplicated addresses.
    const customEmails = useMemo(() => {
        const parts = customEmailsText.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
        return Array.from(new Set(parts.filter((e) => EMAIL_RE.test(e))));
    }, [customEmailsText]);

    const recipientCount = audience === 'CUSTOM' ? customEmails.length : audienceCount;

    // For ALL/CLASS, ask the server how many students the audience resolves to.
    const loadCount = useCallback(async () => {
        if (audience === 'CUSTOM') return;
        setAudienceCount(null);
        try {
            const { data } = await api.get<{ total: number }>('/admin/mail/audience-count', {
                params: { audience, ...(audience === 'CLASS' ? { classBand } : {}) },
            });
            setAudienceCount(data.total);
        } catch {
            setAudienceCount(null);
        }
    }, [audience, classBand]);

    useEffect(() => {
        void loadCount();
    }, [loadCount]);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setResult(null);

        if (!subject.trim() || !message.trim()) {
            setError('Add a subject and a message.');
            return;
        }
        if (audience === 'CUSTOM' && customEmails.length === 0) {
            setError('Add at least one valid email address.');
            return;
        }
        if (recipientCount === 0) {
            setError('No recipients match this audience.');
            return;
        }

        const label =
            audience === 'ALL_STUDENTS'
                ? `all ${recipientCount ?? ''} active students`
                : audience === 'CLASS'
                    ? `${recipientCount ?? ''} students in Class ${classBand}`
                    : `${customEmails.length} address${customEmails.length === 1 ? '' : 'es'}`;
        if (!window.confirm(`Send this email to ${label}?`)) return;

        setSending(true);
        try {
            const { data } = await api.post<SendResult>('/admin/mail/send', {
                audience,
                ...(audience === 'CLASS' ? { classBand } : {}),
                ...(audience === 'CUSTOM' ? { emails: customEmails } : {}),
                subject: subject.trim(),
                message,
            });
            setResult(data);
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Could not send the email. Please try again.');
        } finally {
            setSending(false);
        }
    }

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <div className="page-content">
                <div className="page-header">
                    <h1>Send email</h1>
                    <p className="text-muted">
                        Send an announcement to students. Choose an audience, write your message, and send —
                        delivery is handled by the platform&apos;s email provider.
                    </p>
                </div>

                <form onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
                    <div className="glass-card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
                        <div className="form-group">
                            <label>Audience</label>
                            <div className="class-pills">
                                {([
                                    ['ALL_STUDENTS', 'All students'],
                                    ['CLASS', 'By class'],
                                    ['CUSTOM', 'Specific emails'],
                                ] as const).map(([value, text]) => (
                                    <button
                                        type="button"
                                        key={value}
                                        className={`class-pill ${audience === value ? 'active' : ''}`}
                                        onClick={() => { setAudience(value); setResult(null); }}
                                    >
                                        {text}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {audience === 'CLASS' && (
                            <div className="form-group">
                                <label htmlFor="classBand">Class</label>
                                <select
                                    id="classBand"
                                    className="form-control"
                                    value={classBand}
                                    onChange={(e) => setClassBand(Number(e.target.value))}
                                >
                                    {CLASS_OPTIONS.map((c) => (
                                        <option key={c} value={c}>Class {c}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {audience === 'CUSTOM' && (
                            <div className="form-group">
                                <label htmlFor="emails">Email addresses</label>
                                <textarea
                                    id="emails"
                                    className="form-control"
                                    rows={4}
                                    placeholder="Separate with commas, spaces or new lines"
                                    value={customEmailsText}
                                    onChange={(e) => setCustomEmailsText(e.target.value)}
                                />
                                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                                    {customEmails.length} valid address{customEmails.length === 1 ? '' : 'es'}
                                </span>
                            </div>
                        )}

                        <div style={{ marginTop: 'var(--space-2)' }}>
                            <span className="stats-pill">
                                {recipientCount === null
                                    ? 'Counting recipients…'
                                    : `${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`}
                            </span>
                        </div>
                    </div>

                    <div className="glass-card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
                        <div className="form-group">
                            <label htmlFor="subject">Subject</label>
                            <input
                                id="subject"
                                className="form-control"
                                maxLength={200}
                                placeholder="e.g. Your Olympiad exam is this Saturday"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="message">Message</label>
                            <textarea
                                id="message"
                                className="form-control"
                                rows={10}
                                maxLength={10000}
                                placeholder="Write your announcement here. Blank lines become paragraphs."
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                            />
                            <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                                Plain text only — it is sent inside the branded email template.
                            </span>
                        </div>
                    </div>

                    {error && <div className="form-error" style={{ marginBottom: 'var(--space-3)' }}>{error}</div>}

                    {result && (
                        <div
                            className="glass-card"
                            style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}
                        >
                            <strong>Sent.</strong>{' '}
                            <span className="text-muted">
                                {result.sent} delivered
                                {result.failed > 0 ? `, ${result.failed} failed` : ''} of {result.total}.
                            </span>
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={sending || recipientCount === 0}
                    >
                        {sending ? 'Sending…' : 'Send email'}
                    </button>
                </form>
            </div>
        </AuthGuard>
    );
}
