'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type Audience = 'ALL_STUDENTS' | 'CLASS' | 'CUSTOM';
type Channel = 'EMAIL' | 'SMS' | 'BOTH';

const CLASS_OPTIONS = [6, 7, 8, 9, 10, 11, 12];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^\+?\d[\d\s-]{8,}$/;

interface ChannelResult {
    total: number;
    sent: number;
    failed: number;
    note?: string;
}
interface SendResult {
    email?: ChannelResult;
    sms?: ChannelResult;
}

/**
 * Admin outbound messaging. Compose an announcement and send it by email, SMS,
 * or both — to every student, one class, or a typed list. Email goes through
 * Resend; SMS through 2Factor's transactional route.
 */
export default function AdminMailPage() {
    const [audience, setAudience] = useState<Audience>('ALL_STUDENTS');
    const [channel, setChannel] = useState<Channel>('EMAIL');
    const [classBand, setClassBand] = useState(6);
    const [customText, setCustomText] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');

    const [counts, setCounts] = useState<{ total: number; withPhone: number } | null>(null);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<SendResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const wantEmail = channel === 'EMAIL' || channel === 'BOTH';
    const wantSms = channel === 'SMS' || channel === 'BOTH';

    // Split the custom list into valid emails and phone numbers.
    const { customEmails, customPhones } = useMemo(() => {
        const entries = customText.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
        const emails = Array.from(new Set(entries.map((e) => e.toLowerCase()).filter((e) => EMAIL_RE.test(e))));
        const phones = Array.from(new Set(entries.filter((e) => PHONE_RE.test(e))));
        return { customEmails: emails, customPhones: phones };
    }, [customText]);

    const emailCount = audience === 'CUSTOM' ? customEmails.length : counts?.total ?? null;
    const smsCount = audience === 'CUSTOM' ? customPhones.length : counts?.withPhone ?? null;

    const loadCounts = useCallback(async () => {
        if (audience === 'CUSTOM') return;
        setCounts(null);
        try {
            const { data } = await api.get<{ total: number; withPhone: number }>('/admin/mail/audience-count', {
                params: { audience, ...(audience === 'CLASS' ? { classBand } : {}) },
            });
            setCounts(data);
        } catch {
            setCounts(null);
        }
    }, [audience, classBand]);

    useEffect(() => {
        void loadCounts();
    }, [loadCounts]);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setResult(null);

        if (!message.trim()) {
            setError('Write a message.');
            return;
        }
        if (wantEmail && !subject.trim()) {
            setError('Add a subject for the email.');
            return;
        }
        const totalTargets = (wantEmail ? emailCount ?? 0 : 0) + (wantSms ? smsCount ?? 0 : 0);
        if (totalTargets === 0) {
            setError('No recipients match this audience and channel.');
            return;
        }

        const parts: string[] = [];
        if (wantEmail) parts.push(`${emailCount ?? 0} by email`);
        if (wantSms) parts.push(`${smsCount ?? 0} by SMS`);
        if (!window.confirm(`Send this to ${parts.join(' and ')}?`)) return;

        setSending(true);
        try {
            const { data } = await api.post<SendResult>('/admin/mail/send', {
                audience,
                channel,
                ...(audience === 'CLASS' ? { classBand } : {}),
                ...(audience === 'CUSTOM' ? { emails: customEmails, phones: customPhones } : {}),
                ...(wantEmail ? { subject: subject.trim() } : {}),
                message,
            });
            setResult(data);
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Could not send. Please try again.');
        } finally {
            setSending(false);
        }
    }

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <div className="page-content">
                <div className="page-header">
                    <h1>Send message</h1>
                    <p className="text-muted">
                        Send an announcement to students by email, SMS, or both. Choose an audience,
                        write your message, and send.
                    </p>
                </div>

                <form onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
                    <div className="glass-card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
                        <div className="form-group">
                            <label>Channel</label>
                            <div className="class-pills">
                                {([
                                    ['EMAIL', 'Email'],
                                    ['SMS', 'SMS'],
                                    ['BOTH', 'Email + SMS'],
                                ] as const).map(([value, text]) => (
                                    <button
                                        type="button"
                                        key={value}
                                        className={`class-pill ${channel === value ? 'active' : ''}`}
                                        onClick={() => { setChannel(value); setResult(null); }}
                                    >
                                        {text}
                                    </button>
                                ))}
                            </div>
                            {wantSms && (
                                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                                    SMS uses 2Factor&apos;s transactional route — it needs a DLT sender ID and
                                    approved template configured on the server.
                                </span>
                            )}
                        </div>

                        <div className="form-group">
                            <label>Audience</label>
                            <div className="class-pills">
                                {([
                                    ['ALL_STUDENTS', 'All students'],
                                    ['CLASS', 'By class'],
                                    ['CUSTOM', 'Specific recipients'],
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
                                <label htmlFor="recipients">
                                    {channel === 'SMS' ? 'Mobile numbers' : channel === 'EMAIL' ? 'Email addresses' : 'Emails and mobile numbers'}
                                </label>
                                <textarea
                                    id="recipients"
                                    className="form-control"
                                    rows={4}
                                    placeholder="Separate with commas, spaces or new lines"
                                    value={customText}
                                    onChange={(e) => setCustomText(e.target.value)}
                                />
                                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                                    {wantEmail && `${customEmails.length} email${customEmails.length === 1 ? '' : 's'}`}
                                    {wantEmail && wantSms && ' · '}
                                    {wantSms && `${customPhones.length} number${customPhones.length === 1 ? '' : 's'}`}
                                </span>
                            </div>
                        )}

                        <div style={{ marginTop: 'var(--space-2)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {wantEmail && (
                                <span className="stats-pill">
                                    {emailCount === null ? 'Counting…' : `${emailCount} by email`}
                                </span>
                            )}
                            {wantSms && (
                                <span className="stats-pill">
                                    {smsCount === null ? 'Counting…' : `${smsCount} by SMS`}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="glass-card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
                        {wantEmail && (
                            <div className="form-group">
                                <label htmlFor="subject">Subject <span className="text-muted">(email)</span></label>
                                <input
                                    id="subject"
                                    className="form-control"
                                    maxLength={200}
                                    placeholder="e.g. Your Olympiad exam is this Saturday"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                />
                            </div>
                        )}
                        <div className="form-group">
                            <label htmlFor="message">Message</label>
                            <textarea
                                id="message"
                                className="form-control"
                                rows={9}
                                maxLength={10000}
                                placeholder="Write your announcement here."
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                            />
                            <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                                {wantSms
                                    ? 'Keep SMS short — long messages are billed as multiple parts.'
                                    : 'Blank lines become paragraphs in the branded email template.'}
                            </span>
                        </div>
                    </div>

                    {error && <div className="form-error" style={{ marginBottom: 'var(--space-3)' }}>{error}</div>}

                    {result && (
                        <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
                            <strong>Sent.</strong>{' '}
                            <span className="text-muted">
                                {result.email && `Email: ${result.email.sent}/${result.email.total} delivered${result.email.failed ? `, ${result.email.failed} failed` : ''}. `}
                                {result.sms && `SMS: ${result.sms.sent}/${result.sms.total} delivered${result.sms.failed ? `, ${result.sms.failed} failed` : ''}.`}
                            </span>
                            {(result.sms?.note || result.email?.note) && (
                                <div style={{ marginTop: 'var(--space-2)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                                    {result.sms?.note && (
                                        <div style={{ color: 'var(--color-warning, #b45309)' }}>⚠️ SMS: {result.sms.note}</div>
                                    )}
                                    {result.email?.note && (
                                        <div style={{ color: 'var(--color-warning, #b45309)' }}>⚠️ Email: {result.email.note}</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <button type="submit" className="btn btn-primary" disabled={sending}>
                        {sending ? 'Sending…' : 'Send message'}
                    </button>
                </form>
            </div>
        </AuthGuard>
    );
}
