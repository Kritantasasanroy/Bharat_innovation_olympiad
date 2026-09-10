'use client';

import LimonAvatar, { type LimonMood } from '@/components/limon/LimonAvatar';
import api from '@/lib/api';
import { useMemo, useState } from 'react';

/** Below this, saying what went wrong is compulsory. Mirrors the backend rule. */
export const COMMENT_REQUIRED_BELOW = 3;
export const COMMENT_MIN_LENGTH = 20;

/**
 * Limon's reaction to each rating.
 *
 * The whole point of asking with a mascot rather than a bare form is that the
 * student gets an answer back the instant they tap. Five stars and he is
 * delighted; one or two and he apologises and asks what went wrong, which is
 * also the moment the comment box becomes required — the apology and the
 * request for detail are the same beat.
 */
const REACTIONS: Record<number, { mood: LimonMood; line: string }> = {
    5: { mood: 'celebrating', line: "Brilliant! That genuinely makes our day. Thank you!" },
    4: { mood: 'happy', line: "Great to hear! Anything that would have made it a five?" },
    3: { mood: 'talking', line: "Thanks for being honest. What would have made it better?" },
    2: { mood: 'concerned', line: "I'm sorry it fell short. Please tell us what went wrong — we do read these." },
    1: { mood: 'concerned', line: "I'm really sorry. Tell us what happened and we'll get it fixed." },
};

/**
 * "How much did you like the Innovation Olympiad?" — asked once, straight after
 * an exam is submitted and **before** any score is shown.
 *
 * Deliberately before the result: a rating collected after a mark measures the
 * mark, not the olympiad.
 */
export default function ExamRatingPrompt({
    attemptId,
    onDone,
}: {
    attemptId: string;
    onDone: () => void;
}) {
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const shown = hover || rating;
    const reaction = rating ? REACTIONS[rating] : null;
    const commentRequired = rating > 0 && rating < COMMENT_REQUIRED_BELOW;
    const commentShort = comment.trim().length < COMMENT_MIN_LENGTH;

    const canSubmit = useMemo(
        () => rating > 0 && !submitting && (!commentRequired || !commentShort),
        [rating, submitting, commentRequired, commentShort],
    );

    async function submit() {
        if (!canSubmit) return;
        setSubmitting(true);
        setError('');
        try {
            await api.post('/exam-feedback', {
                attemptId,
                rating,
                ...(comment.trim() ? { comment: comment.trim() } : {}),
            });
            onDone();
        } catch (e: any) {
            setError(
                e?.response?.data?.message ||
                    'We could not save your rating just now. You can continue — your exam is already submitted and safe.',
            );
            setSubmitting(false);
        }
    }

    return (
        <div className="rating-prompt glass-card">
            <LimonAvatar mood={reaction?.mood ?? 'talking'} size={92} />

            <h1 className="rating-prompt__title">How much did you like the Innovation Olympiad?</h1>
            <p className="rating-prompt__sub">
                Your exam is submitted and safe. One tap, before you see anything else.
            </p>

            <div className="rating-stars" role="radiogroup" aria-label="Rating out of 5">
                {[1, 2, 3, 4, 5].map((n) => (
                    <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={`${n} star${n === 1 ? '' : 's'}`}
                        className={`rating-star ${n <= shown ? 'is-on' : ''}`}
                        onMouseEnter={() => setHover(n)}
                        onMouseLeave={() => setHover(0)}
                        onFocus={() => setHover(n)}
                        onBlur={() => setHover(0)}
                        onClick={() => setRating(n)}
                    >
                        ★
                    </button>
                ))}
            </div>

            {reaction && <p className="rating-prompt__reaction">{reaction.line}</p>}

            {rating > 0 && (
                <div className="rating-comment">
                    <label className="input-label" htmlFor="rating-comment">
                        {commentRequired ? 'What went wrong?' : 'Anything you want to add?'}{' '}
                        <span className="rating-comment__opt">
                            {commentRequired ? '(required)' : '(optional)'}
                        </span>
                    </label>
                    <textarea
                        id="rating-comment"
                        className="input-field"
                        rows={4}
                        value={comment}
                        maxLength={1000}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder={
                            commentRequired
                                ? 'Tell us what happened — the more specific, the faster we can fix it.'
                                : 'Anything at all — a question that confused you, something that felt slow…'
                        }
                    />
                    {commentRequired && (
                        <div
                            className={`rating-comment__count ${commentShort ? 'is-short' : 'is-ok'}`}
                            aria-live="polite"
                        >
                            {commentShort
                                ? `${COMMENT_MIN_LENGTH - comment.trim().length} more character${
                                      COMMENT_MIN_LENGTH - comment.trim().length === 1 ? '' : 's'
                                  } needed`
                                : 'Thank you — that helps.'}
                        </div>
                    )}
                </div>
            )}

            {error && <div className="auth-error">{error}</div>}

            <div className="rating-prompt__actions">
                <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    disabled={!canSubmit}
                    onClick={submit}
                    title={
                        rating === 0
                            ? 'Pick a rating first'
                            : commentRequired && commentShort
                              ? `Please write at least ${COMMENT_MIN_LENGTH} characters`
                              : undefined
                    }
                >
                    {submitting ? 'Saving…' : 'Submit rating →'}
                </button>
            </div>
        </div>
    );
}
