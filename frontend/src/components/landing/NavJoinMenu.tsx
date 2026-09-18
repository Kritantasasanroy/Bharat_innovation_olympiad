'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Handshake, School } from 'lucide-react';

/**
 * The nav's "Join us" menu — a small clickable label that opens two ways in:
 * join as a partner, or bring the Olympiad to your school. Both open the
 * respective portal in a new tab; nothing here posts anywhere, so there is
 * no backend surface.
 */
export default function NavJoinMenu() {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                type="button"
                className="lp-join-btn"
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={() => setOpen((v) => !v)}
            >
                Join us{' '}
                <ChevronDown
                    size={13}
                    style={{ transition: 'transform 0.2s ease', transform: open ? 'rotate(180deg)' : undefined }}
                />
            </button>
            {open && (
                <div className="lp-join-menu" role="menu">
                    <a
                        href="https://partner.innovationolympiad.in"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="lp-join-item"
                        onClick={() => setOpen(false)}
                    >
                        <span className="lp-join-item__icon" style={{ background: 'rgba(125,200,50,0.12)' }}>
                            <Handshake size={18} color="#4f9a12" />
                        </span>
                        <span className="lp-join-item__text">
                            <strong>Join as a Partner</strong>
                            <span>Bring the Olympiad to your city and earn with every registration</span>
                        </span>
                    </a>
                    <a
                        href="https://school.innovationolympiad.in"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="lp-join-item"
                        onClick={() => setOpen(false)}
                    >
                        <span className="lp-join-item__icon" style={{ background: 'rgba(255,203,5,0.14)' }}>
                            <School size={18} color="#b98900" />
                        </span>
                        <span className="lp-join-item__text">
                            <strong>Join as a School</strong>
                            <span>Bring the Olympiad to your students — training, exam and reports</span>
                        </span>
                    </a>
                </div>
            )}
        </div>
    );
}
