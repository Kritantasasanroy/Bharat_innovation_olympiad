'use client';

import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The alumni stories, as one auto-rotating carousel.
 *
 * They were three stacked cards, which meant the second and third were below the
 * fold on every laptop — a visitor saw one story and a lot of whitespace, and the
 * section's whole job is to show that this has happened to more than one child.
 * Rotating them puts all three in the same piece of screen real estate.
 *
 * ## What "auto-rotating" has to not do
 *
 * An auto-advancing carousel is one of the easiest things on the web to get
 * wrong, in ways that are actively hostile rather than merely annoying:
 *
 *  - **It must stop when someone is reading it.** Hover pauses, and so does
 *    keyboard focus landing anywhere inside — otherwise a card slides away
 *    mid-sentence, and the reader has no idea which dot to press to get it back.
 *  - **It must stop when the tab is hidden.** Otherwise a visitor returns to a
 *    carousel that has cycled forty times and is showing something arbitrary.
 *  - **It must not move at all for anyone who has asked for reduced motion.**
 *    Vestibular triggers aside, `prefers-reduced-motion` is a request not to
 *    have things move under you, and a slideshow is the archetype of that.
 *  - **It must be operable without the mouse**, which is why the dots are real
 *    buttons with labels rather than decorative spans, the arrows are focusable,
 *    and the panel carries `aria-roledescription`/`aria-live` so a screen reader
 *    is told what changed rather than silently re-reading the region.
 *
 * All four are implemented below. Removing any of them turns this from a nice
 * component into an accessibility complaint.
 *
 * ## Why the cards are data
 *
 * They were three near-identical JSX blocks differing only in an accent colour
 * and some strings, which is how the third one ended up without the box-shadow
 * the other two have. One template plus a list makes a divergence impossible.
 */

const ROTATE_MS = 7000;

interface Alumnus {
    name: string;
    tagline: string;
    badge: string;
    /** Badge background and the card's accent, in one place per story. */
    badgeBg: string;
    accent: string;
    pillBg: string;
    pillBorder: string;
    image: string;
    /** The two labelled facts under the name. */
    facts: { label: string; value: string }[];
    body: string;
    pills: string[];
    journey: string;
}

const ALUMNI: Alumnus[] = [
    {
        name: 'Guransh Singh',
        tagline: 'From Young Innovator to National Champion',
        badge: "National Champion '26",
        badgeBg: '#7dc832',
        accent: '#7dc832',
        pillBg: 'rgba(125,200,50,0.1)',
        pillBorder: 'rgba(125,200,50,0.2)',
        image: '/assets/alumni-guransh.jpg',
        facts: [
            { label: 'Innovation', value: 'Golden Years' },
            { label: 'School', value: 'DAV Public School, Amritsar' },
        ],
        body: "He didn't stop after the contest. In 2026 he secured the 1st position nationally in Innopreneurs Junior Season 12, competing against thousands of young innovators.",
        pills: ['Innovation Mindset', 'Problem Solving'],
        journey: 'Winner → Continued Innovator → National Champion Again',
    },
    {
        name: 'Falak Arora',
        tagline: 'Turning Sustainability into Entrepreneurship',
        badge: 'Founder',
        badgeBg: '#d4a017',
        accent: '#ffcb05',
        pillBg: 'rgba(255,203,5,0.08)',
        pillBorder: 'rgba(255,203,5,0.2)',
        image: '/assets/alumni-falak.jpg',
        facts: [
            { label: 'Innovation', value: 'Zedberrie' },
            { label: 'Field', value: 'Sustainable fashion' },
        ],
        body: 'She built fashion accessories from textile waste, turning an environmental challenge into a real business, now pursuing global opportunities.',
        pills: ['Sustainability', 'Circular Economy'],
        journey: 'Student Innovator → Founder → Global Opportunities',
    },
    {
        name: 'Anay & Abeer Ramakrishnan',
        tagline: 'From Child Innovators to AI Pioneers',
        badge: 'AI Pioneers',
        badgeBg: '#3b6fe0',
        accent: '#7baff5',
        pillBg: 'rgba(59,111,224,0.12)',
        pillBorder: 'rgba(59,111,224,0.25)',
        image: '/assets/alumni-anay-abeer.jpg',
        facts: [
            { label: 'Innovation', value: 'Immvers' },
            { label: 'Field', value: 'Immersive & AI tech' },
        ],
        body: 'As kids the twins were already building technology. Immvers grew into a broader ecosystem at the intersection of AI, education and emerging technologies.',
        pills: ['Artificial Intelligence', 'Deep Tech'],
        journey: 'Young Innovators → Technology Builders → AI Innovators',
    },
];

export default function AlumniCarousel() {
    const [index, setIndex] = useState(0);
    /** Any reason to hold still: hover, focus, hidden tab, reduced motion. */
    const [paused, setPaused] = useState(false);
    const [reducedMotion, setReducedMotion] = useState(false);
    const touchStartX = useRef<number | null>(null);

    const go = useCallback((next: number) => {
        setIndex(((next % ALUMNI.length) + ALUMNI.length) % ALUMNI.length);
    }, []);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const apply = () => setReducedMotion(mq.matches);
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, []);

    // A backgrounded tab must not keep cycling — otherwise coming back to the
    // page lands on whichever card the timer happened to stop on.
    useEffect(() => {
        const onVisibility = () => setPaused(document.hidden);
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    useEffect(() => {
        if (paused || reducedMotion) return;
        const timer = setTimeout(() => go(index + 1), ROTATE_MS);
        return () => clearTimeout(timer);
    }, [index, paused, reducedMotion, go]);

    return (
        <div
            className="lp-carousel"
            role="region"
            aria-roledescription="carousel"
            aria-label="Innovation alumni stories"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            // Focus anywhere inside stops the rotation: a keyboard user tabbing
            // through the links in a card must not have it slide away.
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
            onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
                if (touchStartX.current === null) return;
                const dx = e.changedTouches[0].clientX - touchStartX.current;
                // 45px, so a vertical scroll that wanders sideways is not a swipe.
                if (Math.abs(dx) > 45) go(index + (dx < 0 ? 1 : -1));
                touchStartX.current = null;
            }}
        >
            <div className="lp-carousel__viewport">
                <div
                    className="lp-carousel__track"
                    style={{ transform: `translateX(-${index * 100}%)` }}
                >
                    {ALUMNI.map((a, i) => (
                        <div
                            className="lp-carousel__slide"
                            key={a.name}
                            role="group"
                            aria-roledescription="slide"
                            aria-label={`${i + 1} of ${ALUMNI.length}: ${a.name}`}
                            // Off-screen slides are hidden from assistive tech and
                            // from the tab order — otherwise Tab walks into cards
                            // nobody can see, and focus lands somewhere invisible.
                            //
                            // `inert` is set on the element rather than passed as a
                            // prop: React 18 drops an empty-string attribute and
                            // React 19 wants a boolean, so the JSX form that works
                            // depends on the React version. Touching the DOM node
                            // works on both, and on this app's React 18.
                            aria-hidden={i !== index}
                            ref={(el) => { el?.toggleAttribute('inert', i !== index); }}
                        >
                            <article className="lp-alumni-card">
                                <div className="lp-alumni-card__media">
                                    <Image
                                        src={a.image}
                                        alt={a.name}
                                        fill
                                        sizes="(max-width: 768px) 100vw, 300px"
                                        style={{ objectFit: 'cover' }}
                                        priority={i === 0}
                                    />
                                    <span
                                        className="lp-alumni-card__badge"
                                        style={{ background: a.badgeBg }}
                                    >
                                        {a.badge}
                                    </span>
                                </div>

                                <div className="lp-alumni-card__body">
                                    <h3>{a.name}</h3>
                                    <div className="lp-alumni-card__tagline" style={{ color: a.accent }}>
                                        {a.tagline}
                                    </div>

                                    <div className="lp-alumni-card__facts">
                                        {a.facts.map((f) => (
                                            <div key={f.label}>
                                                <div className="lp-alumni-card__fact-label">{f.label}</div>
                                                <b>{f.value}</b>
                                            </div>
                                        ))}
                                    </div>

                                    <p className="lp-alumni-card__text">{a.body}</p>

                                    <div className="lp-alumni-card__pills">
                                        {a.pills.map((t) => (
                                            <span
                                                key={t}
                                                className="lp-pill"
                                                style={{
                                                    background: a.pillBg,
                                                    border: `1px solid ${a.pillBorder}`,
                                                    color: a.accent,
                                                }}
                                            >
                                                {t}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="lp-alumni-card__journey">
                                        <TrendingUp size={13} color="var(--text-tertiary)" />
                                        <b style={{ color: a.accent }}>{a.journey}</b>
                                    </div>
                                </div>
                            </article>
                        </div>
                    ))}
                </div>
            </div>

            <div className="lp-carousel__controls">
                <button
                    type="button"
                    className="lp-carousel__arrow"
                    onClick={() => go(index - 1)}
                    aria-label="Previous story"
                >
                    <ChevronLeft size={18} />
                </button>

                <div className="lp-carousel__dots">
                    {ALUMNI.map((a, i) => (
                        <button
                            key={a.name}
                            type="button"
                            className={`lp-carousel__dot ${i === index ? 'is-active' : ''}`}
                            onClick={() => go(i)}
                            aria-label={`Show ${a.name}`}
                            aria-current={i === index}
                        />
                    ))}
                </div>

                <button
                    type="button"
                    className="lp-carousel__arrow"
                    onClick={() => go(index + 1)}
                    aria-label="Next story"
                >
                    <ChevronRight size={18} />
                </button>
            </div>

            {/* Announced politely on change, so a screen-reader user is told the
                slide moved instead of the whole region being re-read. */}
            <p className="sr-only" aria-live="polite">
                {ALUMNI[index].name}, {ALUMNI[index].tagline}. Story {index + 1} of {ALUMNI.length}.
            </p>
        </div>
    );
}
