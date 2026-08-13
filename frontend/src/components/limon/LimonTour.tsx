'use client';

import LimonAvatar from '@/components/limon/LimonAvatar';
import { markTourSeen, TOURS, tourSeen, type TourId, type TourStep } from '@/lib/limon/tours';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Limon's guided tour: a spotlight, a speech bubble, and Limon himself.
 *
 * ## The three things this has to get right
 *
 * 1. **Skippable, always, in one click.** A tour that is hard to escape is a
 *    tour students resent. Skip is a permanent control, not hidden behind the
 *    last step, and Escape closes it too. Skipping counts as seen — being asked
 *    again next time is exactly what the student just declined.
 *
 * 2. **Never point at nothing.** Pages differ by whether the student has paid,
 *    has a school, has sat the trial. Steps whose target is not on the page are
 *    dropped when the tour starts, so a missing element costs a step rather than
 *    stranding someone in front of an empty highlight.
 *
 * 3. **Never trap the page underneath.** The backdrop covers the viewport so a
 *    stray click cannot fire the button being described, but the tour owns
 *    nothing else: no scroll lock left behind, no listener outliving the
 *    component. It unmounts clean.
 *
 * ## Positioning
 *
 * The spotlight is a `box-shadow` with an enormous spread rather than an SVG
 * mask or four separate overlay rectangles — one element, one paint, and it
 * follows the target's real rect through scrolling and resizing without any
 * geometry of its own to keep in sync.
 */

interface Rect { top: number; left: number; width: number; height: number }

const CARD_WIDTH = 340;
const CARD_GAP = 18;

function readRect(target: string | undefined): Rect | null {
    if (!target || typeof document === 'undefined') return null;
    const el = document.querySelector<HTMLElement>(`[data-limon="${target}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Limon's on-screen rect, read from the DOM rather than duplicated here.
 *
 * He is between 150px and 384px wide depending on the viewport (see
 * `--limon-size` in globals.css) and sits top-left on a phone, bottom-left on
 * tablet and desktop (also in the CSS). Measuring the real element, corner
 * and all, is what lets `dodgeAvatar` avoid him correctly at either position
 * without a second place that has to know which corner he is in this week.
 */
function avatarRect(): Rect | null {
    if (typeof document === 'undefined') return null;
    const el = document.querySelector<HTMLElement>('.limon-tour__avatar');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Where the card goes, given the target and the preferred side.
 *
 * Flips to the opposite side when the preferred one would put the card off
 * screen, then clamps into the viewport regardless — a card the student has to
 * scroll to read is worse than one slightly closer to its target than intended.
 *
 * Finally it steps around Limon, wherever he actually is — top-left on a
 * phone, bottom-left on tablet and desktop (see `.limon-tour__avatar` in
 * globals.css) — by measuring his real rect rather than assuming a corner.
 */
function placeCard(rect: Rect | null, placement: TourStep['placement']): React.CSSProperties {
    if (typeof window === 'undefined') return {};
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const estHeight = 190;

    const avatar = avatarRect();
    /**
     * Nudges the card clear of Limon if the two rects overlap: right of him
     * first, then below, then above — whichever the viewport has room for.
     */
    const dodgeAvatar = (pos: { top: number; left: number }) => {
        if (!avatar) return pos;
        const cardRight = pos.left + CARD_WIDTH;
        const cardBottom = pos.top + estHeight;
        const avatarRight = avatar.left + avatar.width;
        const avatarBottom = avatar.top + avatar.height;
        const overlaps =
            pos.left < avatarRight && cardRight > avatar.left &&
            pos.top < avatarBottom && cardBottom > avatar.top;
        if (!overlaps) return pos;

        const shiftedLeft = avatarRight + 16;
        if (shiftedLeft + CARD_WIDTH <= vw - 16) return { ...pos, left: shiftedLeft };
        const belowTop = avatarBottom + 16;
        if (belowTop + estHeight <= vh - 16) return { ...pos, top: belowTop };
        return { ...pos, top: Math.max(16, avatar.top - estHeight - 16) };
    };

    if (!rect) {
        return dodgeAvatar({
            top: vh / 2 - 120,
            left: Math.max(16, vw / 2 - CARD_WIDTH / 2),
        });
    }

    let top: number;
    let left: number;

    switch (placement) {
        case 'top':
            top = rect.top - estHeight - CARD_GAP;
            left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
            if (top < 16) top = rect.top + rect.height + CARD_GAP;
            break;
        case 'left':
            top = rect.top + rect.height / 2 - estHeight / 2;
            left = rect.left - CARD_WIDTH - CARD_GAP;
            if (left < 16) left = rect.left + rect.width + CARD_GAP;
            break;
        case 'right':
            top = rect.top + rect.height / 2 - estHeight / 2;
            left = rect.left + rect.width + CARD_GAP;
            if (left + CARD_WIDTH > vw - 16) left = rect.left - CARD_WIDTH - CARD_GAP;
            break;
        default:
            top = rect.top + rect.height + CARD_GAP;
            left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
            if (top + estHeight > vh - 16) top = rect.top - estHeight - CARD_GAP;
    }

    return dodgeAvatar({
        top: Math.min(Math.max(16, top), Math.max(16, vh - estHeight - 16)),
        left: Math.min(Math.max(16, left), Math.max(16, vw - CARD_WIDTH - 16)),
    });
}

export default function LimonTour({
    tourId,
    /** Gate the tour on the page's data being ready — targets must exist first. */
    ready = true,
    /**
     * Bump this to open the tour on demand, whatever `localStorage` remembers.
     *
     * The "Need help?" button is the caller: pressing it must always work. A
     * student who has already been shown a tour once and now has a question is
     * the *most* likely person to press it, so "you have seen this" is precisely
     * the wrong reason to refuse.
     */
    openSignal = 0,
    /** False for a manual open — the button is the only entry point. */
    auto = true,
    onFinish,
}: {
    tourId: TourId;
    ready?: boolean;
    openSignal?: number;
    auto?: boolean;
    onFinish?: () => void;
}) {
    const tour = TOURS[tourId];

    /** `-1` is the opening card; `steps.length` is the outro. */
    const [index, setIndex] = useState(-1);
    const [open, setOpen] = useState(false);
    const [steps, setSteps] = useState<TourStep[]>([]);
    const [rect, setRect] = useState<Rect | null>(null);
    /**
     * Flipped once after the tour paints.
     *
     * `placeCard` measures Limon's real on-screen size, and on the first render
     * he does not exist yet — so the intro card, whose target is null, would
     * compute its position against a zero-width avatar and never move out of his
     * way. Nothing else forces a second render for it: the measuring effect sets
     * `rect` to null, which it already is, so React bails out. This is the
     * re-render.
     */
    const [measured, setMeasured] = useState(false);
    const startedRef = useRef(false);

    /**
     * Open the tour: work out which steps have something to point at, and go.
     *
     * The filter is why this cannot be a plain `setOpen(true)`. Pages differ by
     * whether the student has paid, has a school, has sat the trial, so the
     * targets present are only knowable at the moment of opening — and a step
     * pointing at nothing would strand them in front of an empty highlight.
     */
    const start = useCallback(() => {
        setSteps(tour.steps.filter((s) => !s.target || readRect(s.target)));
        setIndex(-1);
        setOpen(true);
    }, [tour.steps]);

    // The automatic run: once per student, and only if they have not seen it.
    useEffect(() => {
        if (!auto || !ready || startedRef.current) return;
        if (tourSeen(tourId)) return;
        startedRef.current = true;
        // A frame's grace so a just-rendered page has laid out — a target
        // measured mid-paint reports a zero rect and would be dropped.
        const timer = setTimeout(start, 400);
        return () => clearTimeout(timer);
    }, [auto, ready, tourId, start]);

    // The manual run, from "Need help?". Ignores `tourSeen` entirely.
    useEffect(() => {
        if (openSignal <= 0) return;
        startedRef.current = true;
        start();
    }, [openSignal, start]);

    const finish = useCallback(() => {
        markTourSeen(tourId);
        setOpen(false);
        onFinish?.();
    }, [tourId, onFinish]);

    const step = index >= 0 && index < steps.length ? steps[index] : null;

    // Measure on every step, and keep measuring while the page moves under us.
    useLayoutEffect(() => {
        if (!open) return;
        const measure = () => setRect(readRect(step?.target));
        measure();
        if (!measured) setMeasured(true);
        // The target may be below the fold — bring it into view before the
        // spotlight lands on a rect the student cannot see.
        if (step?.target) {
            document
                .querySelector(`[data-limon="${step.target}"]`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Re-measure after the smooth scroll settles, or the spotlight
            // stays where the element used to be.
            const settle = setTimeout(measure, 420);
            window.addEventListener('resize', measure);
            window.addEventListener('scroll', measure, true);
            return () => {
                clearTimeout(settle);
                window.removeEventListener('resize', measure);
                window.removeEventListener('scroll', measure, true);
            };
        }
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [open, index, step?.target, measured]);

    // Escape skips. Arrow keys move, because a tour with a Next button that
    // cannot be reached from the keyboard is not usable by everyone.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); finish(); }
            if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, steps.length));
            if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, -1));
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, steps.length, finish]);

    if (!open) return null;

    const isIntro = index === -1;
    const isOutro = index >= steps.length;
    const mood = isIntro ? 'happy' : isOutro ? 'celebrating' : (step?.mood ?? 'talking');
    const cardStyle = isIntro || isOutro ? placeCard(null, undefined) : placeCard(rect, step?.placement);

    const title = isIntro ? 'Hi, I’m Limon' : isOutro ? 'All done' : step!.title;
    const body = isIntro ? tour.intro : isOutro ? (tour.outro ?? '') : step!.body;

    const next = () => (isOutro ? finish() : setIndex((i) => i + 1));

    return (
        <div className="limon-tour" role="dialog" aria-modal="true" aria-label={`${title}. ${body}`}>
            {/* Backdrop. Absorbs clicks so a stray one cannot press the very
                button being explained. */}
            <div className="limon-tour__backdrop" onClick={(e) => e.stopPropagation()} />

            {/* Spotlight — one element, a giant ring shadow, no geometry to sync. */}
            {rect && !isIntro && !isOutro && (
                <div
                    className="limon-tour__spotlight"
                    style={{
                        top: rect.top - 8,
                        left: rect.left - 8,
                        width: rect.width + 16,
                        height: rect.height + 16,
                    }}
                />
            )}

            <div className="limon-tour__card" style={cardStyle}>
                <div className="limon-tour__head">
                    <strong>{title}</strong>
                    {!isIntro && !isOutro && (
                        <span className="limon-tour__progress">
                            {index + 1} of {steps.length}
                        </span>
                    )}
                </div>
                <p className="limon-tour__body">{body}</p>
                <div className="limon-tour__actions">
                    <button type="button" className="limon-tour__skip" onClick={finish}>
                        {isOutro ? 'Close' : 'Skip'}
                    </button>
                    <div className="limon-tour__nav">
                        {index > -1 && !isOutro && (
                            <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => setIndex((i) => i - 1)}
                            >
                                Back
                            </button>
                        )}
                        {!isOutro && (
                            <button type="button" className="btn btn-sm btn-primary" onClick={next}>
                                {isIntro ? 'Show me' : index === steps.length - 1 ? 'Finish' : 'Next'}
                            </button>
                        )}
                        {isOutro && (
                            <button type="button" className="btn btn-sm btn-primary" onClick={finish}>
                                Got it
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Limon himself, bottom-left, popping up when the tour opens.
                The rendered size is CSS, not this prop: he is roughly four times
                larger on a desktop than on a phone, and a fixed pixel size in
                JSX cannot express that. The SVG scales cleanly to any of them,
                so the prop is only a sensible intrinsic size. */}
            <div className="limon-tour__avatar">
                <LimonAvatar mood={mood} size={128} />
            </div>
        </div>
    );
}
