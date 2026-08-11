'use client';

import { useState } from 'react';

/**
 * A picture of the exam screen, before the student is inside it.
 *
 * "Develop a visual guide for the exam environment to explain numbering,
 * navigation, and submission controls", and "students are provided with a
 * tutorial screen to walk them through the exam interface, including how to use
 * the 'mark for later' feature and understand warning notifications."
 *
 * ## Why a drawing and not a paragraph
 *
 * Everything below was already true of the player and already written down in
 * the rules list — and none of it helped, because a rule about "the question
 * navigator" means nothing to someone who has never seen a question navigator.
 * The gap is not information, it is *recognition*: a student needs to have seen
 * the layout once so that the numbered grid on the right reads as a thing they
 * can click rather than decoration.
 *
 * ## Why it is a schematic and not a screenshot
 *
 * A screenshot goes stale the first time a button moves, and nothing forces
 * anyone to notice — it would quietly start teaching a screen that no longer
 * exists. This is drawn from the same layout regions the player actually uses,
 * it costs no asset, and it stays legible in both themes because every colour is
 * a CSS variable rather than a baked-in pixel.
 *
 * Collapsed by default. A student who has sat the practice paper does not need
 * it again, and the instructions page is already long; making it opt-in keeps
 * the page scannable for them without hiding it from a first-timer.
 */

interface Marker {
    n: number;
    title: string;
    body: string;
}

const MARKERS: Marker[] = [
    {
        n: 1,
        title: 'Which paper you are on',
        body: 'Your grade and the exam name, so you can check at any moment that you are sitting the right paper.',
    },
    {
        n: 2,
        title: 'Which question you are on',
        body: 'Question 7 of 50. This number counts across the whole paper, not just the part you are in, so question 7 always means the same question.',
    },
    {
        n: 3,
        title: 'Your warnings',
        body: 'Starts at 0 of 3 and goes up if you break a rule. Each time it rises, a message tells you exactly what happened. Hover the small "i" for the full list.',
    },
    {
        n: 4,
        title: 'Safe reload',
        body: 'The only safe way to refresh. Use this if an image will not load. Your answers and your time are kept. Never use F5 or your browser’s refresh button.',
    },
    {
        n: 5,
        title: 'Time left',
        body: 'Counts down from the start of the paper. It turns orange with five minutes left and red with one. It is kept on our servers, so a brief internet drop cannot cost you time.',
    },
    {
        n: 6,
        title: 'Your camera',
        body: 'A small preview so you can see what the camera sees. Green dot means it can see one face, yours. Red means it cannot see you.',
    },
    {
        n: 7,
        title: 'The question',
        body: 'The question, and a picture or video if it has one. Click an answer to choose it. It saves the moment you click, there is nothing to press.',
    },
    {
        n: 8,
        title: 'Moving around',
        body: 'Previous and Next step through the paper one question at a time. Clear removes your answer to this question and leaves it blank.',
    },
    {
        n: 9,
        title: 'Mark for later',
        body: 'For a question you want to come back to. It turns the question orange in the list on the right so you can find it again fast. It does not change your answer, and it is not reported to anyone.',
    },
    {
        n: 10,
        title: 'Jump to any question',
        body: 'Every question in the paper, grouped by part. Click any number to go straight there, in any order, as many times as you like.',
    },
    {
        n: 11,
        title: 'What the colours mean',
        body: 'Green means answered. Orange means you marked it for later. Grey means you have not been there yet. The outlined one is where you are now.',
    },
    {
        n: 12,
        title: 'How much you have done',
        body: 'Answered out of total. When every question is answered this turns green and says so.',
    },
    {
        n: 13,
        title: 'Submit',
        body: 'Ends the paper. You are asked to confirm first, and told how many questions are still blank, so one accidental click cannot end your exam.',
    },
];

/** Where each numbered marker sits on the schematic, in SVG user units. */
const MARKER_POSITIONS: Record<number, { x: number; y: number }> = {
    1: { x: 60, y: 22 },
    2: { x: 196, y: 22 },
    3: { x: 404, y: 22 },
    4: { x: 468, y: 22 },
    5: { x: 528, y: 22 },
    6: { x: 580, y: 22 },
    7: { x: 60, y: 92 },
    8: { x: 76, y: 214 },
    9: { x: 214, y: 214 },
    10: { x: 512, y: 108 },
    11: { x: 512, y: 214 },
    12: { x: 60, y: 254 },
    13: { x: 512, y: 254 },
};

function MarkerDot({ n }: { n: number }) {
    const pos = MARKER_POSITIONS[n];
    return (
        <g>
            <circle cx={pos.x} cy={pos.y} r="10" className="tutorial-marker__bg" />
            <text x={pos.x} y={pos.y + 3.5} textAnchor="middle" className="tutorial-marker__text">
                {n}
            </text>
        </g>
    );
}

export default function ExamTutorial() {
    const [open, setOpen] = useState(false);

    return (
        <div className="glass-card instructions-card exam-tutorial">
            <button
                type="button"
                className="exam-tutorial__toggle"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
            >
                <span>
                    <h2 style={{ margin: 0 }}>🗺️ What the exam screen looks like</h2>
                    <span className="exam-tutorial__sub">
                        A quick tour of where everything is, before you start. Worth two minutes if
                        this is your first paper.
                    </span>
                </span>
                <span className="exam-tutorial__chevron" aria-hidden="true">{open ? '▲' : '▼'}</span>
            </button>

            {open && (
                <div className="exam-tutorial__body">
                    <div className="exam-tutorial__figure">
                        <svg
                            viewBox="0 0 620 290"
                            role="img"
                            aria-label="Diagram of the exam screen: a header with the paper name, question number, warning count, reload button, timer and camera preview; a question area with answer options and navigation buttons; and a sidebar listing every question number."
                            className="exam-tutorial__svg"
                        >
                            {/* Screen outline */}
                            <rect x="8" y="8" width="604" height="274" rx="10" className="tut-screen" />

                            {/* Header bar */}
                            <rect x="8" y="8" width="604" height="30" rx="10" className="tut-header" />
                            <rect x="80" y="17" width="96" height="12" rx="3" className="tut-text" />
                            <rect x="212" y="17" width="52" height="12" rx="6" className="tut-chip" />
                            <rect x="388" y="17" width="44" height="12" rx="6" className="tut-chip-warn" />
                            <rect x="444" y="17" width="46" height="12" rx="4" className="tut-chip" />
                            <rect x="502" y="17" width="46" height="12" rx="4" className="tut-chip-time" />
                            <rect x="560" y="13" width="36" height="20" rx="4" className="tut-cam" />

                            {/* Question card */}
                            <rect x="20" y="52" width="440" height="150" rx="8" className="tut-card" />
                            <rect x="36" y="66" width="240" height="10" rx="3" className="tut-text" />
                            <rect x="36" y="82" width="330" height="10" rx="3" className="tut-text-dim" />
                            {[110, 132, 154, 176].map((y, i) => (
                                <g key={y}>
                                    <rect
                                        x="36"
                                        y={y}
                                        width="408"
                                        height="18"
                                        rx="5"
                                        className={i === 1 ? 'tut-option-selected' : 'tut-option'}
                                    />
                                    <circle cx="48" cy={y + 9} r="4.5" className={i === 1 ? 'tut-radio-on' : 'tut-radio'} />
                                </g>
                            ))}

                            {/* Question nav buttons */}
                            <rect x="20" y="212" width="62" height="20" rx="5" className="tut-btn" />
                            <rect x="90" y="212" width="46" height="20" rx="5" className="tut-btn" />
                            <rect x="144" y="212" width="94" height="20" rx="5" className="tut-btn-flag" />
                            <rect x="246" y="212" width="62" height="20" rx="5" className="tut-btn-primary" />

                            {/* Progress bar */}
                            <rect x="20" y="248" width="440" height="8" rx="4" className="tut-progress-track" />
                            <rect x="20" y="248" width="260" height="8" rx="4" className="tut-progress-fill" />

                            {/* Sidebar */}
                            <rect x="472" y="52" width="140" height="180" rx="8" className="tut-card" />
                            <rect x="484" y="62" width="60" height="9" rx="3" className="tut-text" />
                            {Array.from({ length: 20 }).map((_, i) => {
                                const col = i % 5;
                                const row = Math.floor(i / 5);
                                const cls =
                                    i === 6 ? 'tut-q-current'
                                    : i < 6 ? 'tut-q-answered'
                                    : i === 9 ? 'tut-q-flagged'
                                    : 'tut-q';
                                return (
                                    <rect
                                        key={i}
                                        x={484 + col * 24}
                                        y={80 + row * 22}
                                        width="19"
                                        height="18"
                                        rx="4"
                                        className={cls}
                                    />
                                );
                            })}
                            <rect x="484" y="200" width="116" height="20" rx="5" className="tut-btn-danger" />

                            {Object.keys(MARKER_POSITIONS).map((n) => (
                                <MarkerDot key={n} n={Number(n)} />
                            ))}
                        </svg>
                    </div>

                    <ol className="exam-tutorial__legend">
                        {MARKERS.map((m) => (
                            <li key={m.n}>
                                <span className="exam-tutorial__num" aria-hidden="true">{m.n}</span>
                                <div>
                                    <strong>{m.title}</strong>
                                    <p>{m.body}</p>
                                </div>
                            </li>
                        ))}
                    </ol>

                    <div className="exam-tutorial__note">
                        <strong>If a message appears mid-exam, read it, do not panic.</strong> Small
                        notices in the corner are telling you something (your camera cannot see you,
                        your identity was checked) and go away by themselves. A message across the
                        middle of the screen means the paper has paused and is waiting for you, and
                        it always says what to do to carry on. Neither one takes your answers away.
                    </div>

                    <div className="exam-tutorial__note exam-tutorial__note--practice">
                        <strong>The best version of this tour is the practice paper.</strong> It is
                        free, unlimited, and runs in exactly this screen with a real timer and a real
                        camera. Sit it once on the device you plan to use, and none of the above will
                        be new on exam day.
                    </div>
                </div>
            )}
        </div>
    );
}
