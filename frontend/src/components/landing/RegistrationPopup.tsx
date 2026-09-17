'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Rocket, X } from 'lucide-react';
import { COURSE_VALUE } from '@/lib/copy/landing';

const STORAGE_KEY = 'bio-reg-popup-last';
const SHOW_DELAY_MS = 7000;
const ONCE_PER_MS = 24 * 60 * 60 * 1000;

/**
 * The landing-page registration pop-up (#17): "Ready for India's first online
 * Innovation Olympiad?" with the course value and a Register Now button.
 *
 * Shown once per visitor per day, ~7s after arrival — often enough to be seen,
 * rarely enough to never feel like a trap. Dismissed via ×, ESC or backdrop.
 */
export default function RegistrationPopup() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let shown = false;
        try {
            const last = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
            shown = Date.now() - last < ONCE_PER_MS;
        } catch {
            // Private-mode storage errors: fall through to showing the popup.
        }
        if (shown) return;
        const timer = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
        return () => clearInterval(timer);
    }, []);

    const close = () => {
        setOpen(false);
        try {
            localStorage.setItem(STORAGE_KEY, String(Date.now()));
        } catch {
            // Storage unavailable — the popup simply may reappear next visit.
        }
    };

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    if (!open) return null;

    return (
        <div className="lp-popup-backdrop" onClick={close} role="presentation">
            <div
                className="lp-popup"
                role="dialog"
                aria-modal="true"
                aria-label="Registration invitation"
                onClick={(e) => e.stopPropagation()}
            >
                <button className="lp-popup__close" aria-label="Close" onClick={close}>
                    <X size={18} />
                </button>
                <div className="lp-popup__badge">Registrations open</div>
                <h3>Ready for India&apos;s first online Innovation Olympiad?</h3>
                <p>
                    Training, a proctored national exam and a detailed innovation report —
                    for Grades 6–12.
                </p>
                <div className="lp-popup__value">
                    Program value <s>{COURSE_VALUE.mrp}</s> · Offered price{' '}
                    <b>{COURSE_VALUE.price}</b> <span>({COURSE_VALUE.note})</span>
                </div>
                <Link href="/register" className="lp-btn-primary lp-popup__cta">
                    <Rocket size={16} /> Register Now
                </Link>
            </div>
        </div>
    );
}
