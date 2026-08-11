'use client';

/**
 * LIMON — the Lemon Ideas guide, drawn as inline SVG.
 *
 * The artwork is the approved Lemon Ideas kids avatar: a chibi lemon with a leaf
 * sprout, leaf hands and green feet. It is inline rather than an `<img>` for
 * three reasons that all matter here:
 *
 *  1. **He has to move.** The hands wave, the eyes blink, and the mouth changes
 *     with the mood. That means addressing individual paths, which a flat image
 *     file cannot offer.
 *  2. **He appears on the exam player**, which runs under a lockdown that blocks
 *     a good deal of ordinary page behaviour, and during registration before any
 *     asset pipeline is warm. No network request is one less thing to fail.
 *  3. **Expressions are the point.** Limon says "I can't see you" when the
 *     camera loses a face, and a fixed smiling picture saying that reads as
 *     sarcasm to a thirteen-year-old who is already worried.
 *
 * ## Moods
 *
 * Only the mouth, brows and hand animation change between moods — the body is
 * one path in every case, so he is recognisably the same character whether he is
 * congratulating someone or telling them their face is out of frame.
 */

export type LimonMood =
    /** Default. Cat smile, one hand waving. */
    | 'happy'
    /** Explaining something. Small open mouth, hand gesturing at the content. */
    | 'talking'
    /** Something is wrong but recoverable. Flat mouth, brows up, hands still. */
    | 'concerned'
    /** Camera can't see them. Eyes squinting, hands shading the eyes. */
    | 'searching'
    /** Well done. Wide smile, both hands up. */
    | 'celebrating';

const MOUTHS: Record<LimonMood, string> = {
    // The signature cat smile from the approved artwork.
    happy: 'M 106,145 Q 113,153 120,145 Q 127,153 134,145',
    talking: 'M 110,144 Q 120,158 130,144 Q 120,150 110,144',
    concerned: 'M 108,148 Q 120,142 132,148',
    searching: 'M 110,147 Q 120,152 130,147',
    celebrating: 'M 104,142 Q 120,164 136,142 Q 120,152 104,142',
};

export default function LimonAvatar({
    mood = 'happy',
    size = 120,
    className = '',
}: {
    mood?: LimonMood;
    /** Rendered width in px; the aspect ratio is fixed by the viewBox. */
    size?: number;
    className?: string;
}) {
    const squinting = mood === 'searching';

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 240 280"
            width={size}
            height={size * (280 / 240)}
            className={`limon limon--${mood} ${className}`}
            role="img"
            aria-label="Limon, your guide"
        >
            <defs>
                <linearGradient id="limonBody" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFF176" />
                    <stop offset="100%" stopColor="#FBC02D" />
                </linearGradient>
                <linearGradient id="limonLeaf" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#AED581" />
                    <stop offset="100%" stopColor="#558B2F" />
                </linearGradient>
            </defs>

            <ellipse cx="120" cy="265" rx="55" ry="8" fill="#E0E0E0" opacity="0.5" />

            {/* Stubby legs and feet */}
            <rect x="75" y="195" width="20" height="15" fill="#FDD835" stroke="#263238" strokeWidth="3.5" strokeLinejoin="round" />
            <rect x="145" y="195" width="20" height="15" fill="#FDD835" stroke="#263238" strokeWidth="3.5" strokeLinejoin="round" />
            <ellipse cx="85" cy="215" rx="28" ry="16" fill="url(#limonLeaf)" stroke="#263238" strokeWidth="3.5" />
            <ellipse cx="155" cy="215" rx="28" ry="16" fill="url(#limonLeaf)" stroke="#263238" strokeWidth="3.5" />

            {/* Body */}
            <path
                d="M 120,45 C 180,45 210,110 195,160 C 180,210 60,210 45,160 C 30,110 60,45 120,45 Z"
                fill="url(#limonBody)"
                stroke="#263238"
                strokeWidth="3.5"
                strokeLinejoin="round"
            />

            {/* Leaf sprout */}
            <g transform="translate(120, 48)">
                <path d="M 0,0 C -15,-20 -50,-20 -40,0 C -25,0 -10,0 0,0 Z" fill="url(#limonLeaf)" stroke="#263238" strokeWidth="3.5" strokeLinejoin="round" />
                <path d="M 0,0 C 15,-25 55,-22 45,-5 C 30,-5 12,0 0,0 Z" fill="url(#limonLeaf)" stroke="#263238" strokeWidth="3.5" strokeLinejoin="round" />
                <circle cx="0" cy="0" r="6" fill="#7CB342" stroke="#263238" strokeWidth="3.5" />
            </g>

            {/* Brows — only drawn for the moods that need them, so the default
                face stays exactly the approved artwork. */}
            {(mood === 'concerned' || mood === 'searching') && (
                <>
                    <path d="M 78,92 Q 91,86 104,92" stroke="#263238" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                    <path d="M 136,92 Q 149,86 162,92" stroke="#263238" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                </>
            )}

            {/* Eyes. Squinting is a shorter, lower rect rather than a different
                shape, so the blink animation lands on the same geometry. */}
            <g className="limon__eyes">
                <rect
                    x="80" y={squinting ? 112 : 100} width="22" height={squinting ? 14 : 34}
                    rx="11" fill="#263238" stroke="#263238" strokeWidth="3.5"
                />
                <rect
                    x="138" y={squinting ? 112 : 100} width="22" height={squinting ? 14 : 34}
                    rx="11" fill="#263238" stroke="#263238" strokeWidth="3.5"
                />
                {!squinting && (
                    <>
                        <circle cx="87" cy="110" r="6" fill="#FFFFFF" />
                        <circle cx="145" cy="110" r="6" fill="#FFFFFF" />
                        <circle cx="95" cy="125" r="3" fill="#FFFFFF" />
                        <circle cx="153" cy="125" r="3" fill="#FFFFFF" />
                    </>
                )}
            </g>

            <path d={MOUTHS[mood]} stroke="#263238" strokeWidth="4" strokeLinecap="round" fill="none" />

            <ellipse cx="65" cy="148" rx="16" ry="10" fill="#FF8A80" opacity="0.7" />
            <ellipse cx="175" cy="148" rx="16" ry="10" fill="#FF8A80" opacity="0.7" />

            {/* Leaf hands. Each rotates about the point where it meets the body,
                so a wave pivots from the shoulder rather than sliding sideways. */}
            <path
                className="limon__hand limon__hand--left"
                d="M 50,135 C 10,125 10,165 50,155"
                fill="url(#limonLeaf)"
                stroke="#263238"
                strokeWidth="3"
                strokeLinejoin="round"
            />
            <path
                className="limon__hand limon__hand--right"
                d="M 190,135 C 230,125 230,165 190,155"
                fill="url(#limonLeaf)"
                stroke="#263238"
                strokeWidth="3"
                strokeLinejoin="round"
            />
        </svg>
    );
}
