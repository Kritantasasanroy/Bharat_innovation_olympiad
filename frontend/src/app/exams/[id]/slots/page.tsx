'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

interface ExamSlot {
    id: string;
    label?: string;
    startsAt: string;
    endsAt: string;
    capacity: number;
    booked: number;
    examInstance: {
        exam: {
            id: string;
            title: string;
            feeAmount?: number;
            durationMinutes: number;
        };
    };
}

interface Booking {
    id: string;
    status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
    slotId: string;
    slot: ExamSlot;
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
    });
}

function formatFee(paise?: number) {
    if (!paise || paise === 0) return 'Free';
    return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

function SlotCard({
    slot,
    onBook,
    loading,
    existingBooking,
}: {
    slot: ExamSlot;
    onBook: (slotId: string) => void;
    loading: string | null;
    existingBooking: Booking | null;
}) {
    const seatsLeft = slot.capacity - slot.booked;
    const isFull = seatsLeft <= 0;
    const isBooked = existingBooking?.slotId === slot.id;
    const feeAmount = slot.examInstance.exam.feeAmount ?? 0;
    const isFree = feeAmount === 0;

    let seatBadgeStyle = { color: 'var(--success-400)' };
    if (seatsLeft <= 5 && !isFull) seatBadgeStyle = { color: 'var(--warning-400)' };
    if (isFull) seatBadgeStyle = { color: 'var(--danger-400)' };

    return (
        <div
            style={{
                background: isBooked
                    ? 'linear-gradient(135deg, rgba(125,200,50,0.12), rgba(255,203,5,0.08))'
                    : 'var(--bg-card)',
                border: isBooked
                    ? '1px solid rgba(125,200,50,0.4)'
                    : isFull
                      ? '1px solid rgba(255,255,255,0.06)'
                      : '1px solid var(--border-default)',
                borderRadius: '16px',
                padding: '1.5rem',
                transition: 'all 0.2s',
                opacity: isFull && !isBooked ? 0.55 : 1,
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                    {slot.label && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {slot.label}
                        </div>
                    )}
                    <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {formatDateTime(slot.startsAt)}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        to {formatDateTime(slot.endsAt)}
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div
                        style={{
                            background: isFree ? 'rgba(74,222,128,0.15)' : 'rgba(255,203,5,0.12)',
                            border: isFree ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(255,203,5,0.3)',
                            borderRadius: '20px',
                            padding: '0.3rem 0.75rem',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            color: isFree ? 'var(--success-400)' : 'var(--primary-400)',
                        }}
                    >
                        {formatFee(feeAmount)}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.82rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                        ⏱ {slot.examInstance.exam.durationMinutes} min
                    </span>
                    <span style={seatBadgeStyle}>
                        {isFull ? '⛔ Full' : `🪑 ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left`}
                    </span>
                </div>

                {isBooked ? (
                    <div style={{
                        background: 'rgba(125,200,50,0.18)',
                        border: '1px solid rgba(125,200,50,0.4)',
                        borderRadius: '8px',
                        padding: '0.4rem 1rem',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: 'var(--accent-300)',
                    }}>
                        ✓ Booked
                    </div>
                ) : (
                    <button
                        className="btn btn-primary"
                        disabled={isFull || loading !== null}
                        onClick={() => onBook(slot.id)}
                        style={{ padding: '0.4rem 1.2rem', fontSize: '0.88rem' }}
                    >
                        {loading === slot.id ? 'Booking...' : isFull ? 'Full' : 'Book Slot'}
                    </button>
                )}
            </div>
        </div>
    );
}

export default function SlotsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: examId } = use(params);
    const router = useRouter();

    const [slots, setSlots] = useState<ExamSlot[]>([]);
    const [existingBooking, setExistingBooking] = useState<Booking | null>(null);
    const [loading, setLoading] = useState<string | null>(null);
    const [pageLoading, setPageLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const [slotsRes, bookingRes] = await Promise.all([
                    api.get(`/slots?examId=${examId}`),
                    api.get(`/bookings/me?examId=${examId}`).catch(() => ({ data: null })),
                ]);
                setSlots(slotsRes.data);
                setExistingBooking(bookingRes.data);
            } catch (e: any) {
                setError(e.response?.data?.message || 'Failed to load slots');
            } finally {
                setPageLoading(false);
            }
        };
        load();
    }, [examId]);

    const handleBook = async (slotId: string) => {
        setLoading(slotId);
        setError('');
        try {
            const res = await api.post(`/slots/${slotId}/book`, {});
            const { booking, requiresPayment, amount } = res.data;

            if (!requiresPayment || amount === 0) {
                // Free exam — go straight to instructions
                router.push(`/exams/${examId}/instructions`);
                return;
            }

            // Paid exam — go to payment page
            router.push(`/payment/${booking.id}`);
        } catch (e: any) {
            if (e.response?.status === 409 && e.response?.data?.existingBooking) {
                setExistingBooking(e.response.data.existingBooking);
            } else {
                setError(e.response?.data?.message || 'Booking failed. Please try again.');
            }
        } finally {
            setLoading(null);
        }
    };

    const handleContinue = () => {
        if (!existingBooking) return;
        if (existingBooking.status === 'CONFIRMED') {
            router.push(`/exams/${examId}/instructions`);
        } else {
            router.push(`/payment/${existingBooking.id}`);
        }
    };

    if (pageLoading) {
        return (
            <AuthGuard allowedRoles={['STUDENT']}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                    <div className="spinner" />
                </div>
            </AuthGuard>
        );
    }

    const examTitle = slots[0]?.examInstance?.exam?.title ?? 'Exam';

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <div style={{ maxWidth: '720px', margin: '0 auto', padding: '2rem 1.5rem' }}>
                {/* Header */}
                <div style={{ marginBottom: '2rem' }}>
                    <button
                        onClick={() => router.back()}
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                        ← Back
                    </button>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                        Choose Your Exam Slot
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{examTitle}</p>
                </div>

                {/* Existing booking banner */}
                {existingBooking && (
                    <div style={{
                        background: existingBooking.status === 'CONFIRMED'
                            ? 'rgba(74,222,128,0.1)'
                            : 'rgba(251,191,36,0.1)',
                        border: existingBooking.status === 'CONFIRMED'
                            ? '1px solid rgba(74,222,128,0.3)'
                            : '1px solid rgba(251,191,36,0.3)',
                        borderRadius: '12px',
                        padding: '1rem 1.25rem',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        flexWrap: 'wrap',
                    }}>
                        <div>
                            <div style={{ fontWeight: 600, color: existingBooking.status === 'CONFIRMED' ? 'var(--success-400)' : 'var(--warning-400)', marginBottom: '0.2rem' }}>
                                {existingBooking.status === 'CONFIRMED' ? '✓ Slot Confirmed' : '⏳ Payment Pending'}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {formatDateTime(existingBooking.slot.startsAt)}
                            </div>
                        </div>
                        <button className="btn btn-primary" style={{ padding: '0.45rem 1.1rem', fontSize: '0.88rem' }} onClick={handleContinue}>
                            {existingBooking.status === 'CONFIRMED' ? 'Go to Instructions →' : 'Complete Payment →'}
                        </button>
                    </div>
                )}

                {error && (
                    <div style={{
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: '10px',
                        padding: '0.75rem 1rem',
                        color: 'var(--danger-400)',
                        fontSize: '0.9rem',
                        marginBottom: '1.25rem',
                    }}>
                        {error}
                    </div>
                )}

                {slots.length === 0 ? (
                    <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '16px',
                        padding: '3rem',
                        textAlign: 'center',
                        color: 'var(--text-secondary)',
                    }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📅</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No slots available</div>
                        <div style={{ fontSize: '0.9rem' }}>Exam slots haven't been scheduled yet. Check back soon.</div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {slots.map((slot) => (
                            <SlotCard
                                key={slot.id}
                                slot={slot}
                                onBook={handleBook}
                                loading={loading}
                                existingBooking={existingBooking}
                            />
                        ))}
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
