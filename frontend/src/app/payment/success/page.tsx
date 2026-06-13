'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

interface BookingDetail {
    id: string;
    status: string;
    slot: {
        startsAt: string;
        endsAt: string;
        label?: string;
        examInstance: {
            examId: string;
            exam: { id: string; title: string; durationMinutes: number };
        };
    };
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
    });
}

function SuccessContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const bookingId = searchParams.get('bookingId');

    const [booking, setBooking] = useState<BookingDetail | null>(null);
    const [loading, setLoading] = useState(!!bookingId);

    useEffect(() => {
        if (!bookingId) { setLoading(false); return; }
        api.get(`/bookings/${bookingId}`)
            .then((res) => setBooking(res.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [bookingId]);

    return (
        <div style={{ maxWidth: '520px', margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
            {/* Success animation */}
            <div style={{
                width: '88px',
                height: '88px',
                background: 'linear-gradient(135deg, rgba(74,222,128,0.18), rgba(125,200,50,0.12))',
                border: '2px solid rgba(74,222,128,0.4)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.5rem',
                margin: '0 auto 1.5rem',
                animation: 'bounceIn 0.5s ease-out',
            }}>
                ✓
            </div>

            <h1 style={{ fontSize: '1.7rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Registration Confirmed!
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '2rem' }}>
                Your slot has been booked successfully.
            </p>

            {loading ? (
                <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="spinner" />
                </div>
            ) : booking ? (
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    marginBottom: '2rem',
                    textAlign: 'left',
                }}>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>
                        Your Booking
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                        {booking.slot.examInstance.exam.title}
                    </div>
                    {booking.slot.label && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', marginBottom: '0.4rem' }}>{booking.slot.label}</div>
                    )}
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                        📅 {formatDateTime(booking.slot.startsAt)}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                        ⏱ {booking.slot.examInstance.exam.durationMinutes} minutes
                    </div>

                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        background: 'rgba(74,222,128,0.12)',
                        border: '1px solid rgba(74,222,128,0.3)',
                        borderRadius: '20px',
                        padding: '0.3rem 0.85rem',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: 'var(--success-400)',
                    }}>
                        <span style={{ width: '6px', height: '6px', background: 'var(--success-400)', borderRadius: '50%', display: 'inline-block' }} />
                        CONFIRMED
                    </div>
                </div>
            ) : (
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    marginBottom: '2rem',
                    color: 'var(--text-secondary)',
                    fontSize: '0.9rem',
                }}>
                    Your slot booking has been confirmed. Check your dashboard for details.
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {booking && (
                    <button
                        className="btn btn-primary btn-lg"
                        style={{ width: '100%' }}
                        onClick={() => router.push(`/exams/${booking.slot.examInstance.exam.id}/instructions`)}
                    >
                        Go to Exam Instructions →
                    </button>
                )}
                <button
                    className="btn btn-secondary"
                    style={{ width: '100%' }}
                    onClick={() => router.push('/dashboard')}
                >
                    Back to Dashboard
                </button>
            </div>

            <style>{`
                @keyframes bounceIn {
                    0% { transform: scale(0.3); opacity: 0; }
                    60% { transform: scale(1.1); }
                    80% { transform: scale(0.95); }
                    100% { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
}

export default function PaymentSuccessPage() {
    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Suspense fallback={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                    <div className="spinner" />
                </div>
            }>
                <SuccessContent />
            </Suspense>
        </AuthGuard>
    );
}
