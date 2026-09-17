'use client';

import { useState, type ReactNode } from 'react';

/**
 * A card whose detail is collapsed until its header is clicked (#6, #11).
 *
 * The Five Dimensions and the trust cards each carry a paragraph or two of
 * detail; showing every body at once buried the titles and made the page
 * endless. Title click → expand keeps the page scannable while the full
 * explanation stays one click away. `aria-expanded` + button semantics keep
 * it keyboard-operable.
 */
export default function ExpandableCard({
    title,
    teaser,
    detail,
    accent = 'var(--text-primary)',
    icon,
}: {
    title: string;
    /** One line, always visible under the title. */
    teaser?: string;
    detail: string;
    /** Accent for the title when open. */
    accent?: string;
    icon?: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`lp-xcard${open ? ' is-open' : ''}`}>
            <button
                type="button"
                className="lp-expandable__head"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
            >
                {icon}
                <span className="lp-expandable__titles">
                    <span className="lp-expandable__title">{title}</span>
                    <span className="lp-expandable__teaser">{teaser}</span>
                </span>
                <svg
                    className="lp-expandable__chevron"
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
            {open && <p className="lp-expandable__body">{detail}</p>}
        </div>
    );
}
