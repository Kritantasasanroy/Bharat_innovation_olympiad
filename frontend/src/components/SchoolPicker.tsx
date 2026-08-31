'use client';

import {
    DirectorySchool,
    addSchool,
    findSchoolByCode,
    lookupPincode,
    searchSchools,
} from '@/lib/schools';
import { useCallback, useEffect, useRef, useState } from 'react';

type Mode = 'search' | 'code';

interface Props {
    value: DirectorySchool | null;
    onChange: (school: DirectorySchool | null) => void;
    /**
     * Class section, as the school writes it. Only collected once a school is
     * chosen — a student with no school has no section to record.
     */
    section?: string;
    onSectionChange?: (section: string) => void;
    /**
     * @deprecated The directory no longer pre-loads an unfiltered list. Kept for
     * type compatibility; ignored.
     */
    initialResults?: DirectorySchool[];
}

const NAME_SEARCH_DEBOUNCE_MS = 200;
const NAME_MIN_LENGTH = 3;
const PINCODE_LENGTH = 6;
/** Long enough for "Rose"/"B2"; short enough to print on a roster. */
const SECTION_MAX_LENGTH = 10;

/**
 * Choose a school during registration, three ways:
 *
 *  1. Search by name and/or pincode — both are optional, and either works on
 *     its own. Pincode is the fast path: it hits an indexed column and is
 *     instant. Name needs three or more characters.
 *  2. Enter the school code staff issued the school on approval, which assigns
 *     the student to it directly.
 *  3. Add the school, if it isn’t listed. City and state come from the pincode,
 *     so two students adding the same school agree about where it is; the
 *     backend refuses to create a duplicate.
 *
 * ## School is required
 *
 * It used to be optional, which left school-level tracking patchy — and
 * school-level tracking is only as good as its worst row. Every route above ends
 * in a real school, including "my school isn't listed", so there is no student for
 * whom this is impossible to answer.
 *
 * ## Student-added schools are not shown to other students
 *
 * A school that has not yet been onboarded by staff or a partner is attached to
 * the student who added it, but it does not appear in the public directory. Staff
 * can review these from the admin "Student-onboarded schools" page.
 *
 * ## Section
 *
 * Free text, not an A–H dropdown: Indian schools name sections inconsistently
 * ("A", "B2", "Rose", "Alpha") and a fixed list would leave real students unable
 * to register. It appears only after a school is picked, so the two are never out
 * of step.
 */
export default function SchoolPicker({ value, onChange, section, onSectionChange }: Props) {
    const [mode, setMode] = useState<Mode>('search');

    // Search
    const [name, setName] = useState('');
    const [pincode, setPincode] = useState('');
    const [results, setResults] = useState<DirectorySchool[]>([]);
    const [searching, setSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [open, setOpen] = useState(false);

    // Code
    const [code, setCode] = useState('');

    // Add-my-school
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [addPincode, setAddPincode] = useState('');
    const [location, setLocation] = useState<{ city: string; state: string } | null>(null);
    const [locating, setLocating] = useState(false);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const containerRef = useRef<HTMLDivElement>(null);
    const searchAbortRef = useRef<AbortController | null>(null);

    // Close the dropdown on an outside click.
    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, []);

    // Run a directory search whenever the inputs cross their thresholds.
    useEffect(() => {
        if (mode !== 'search' || value) return;

        const trimmedName = name.trim();
        const trimmedPincode = pincode.replace(/\D/g, '').trim();

        const nameReady = trimmedName.length >= NAME_MIN_LENGTH;
        const pincodeReady = trimmedPincode.length === PINCODE_LENGTH;

        if (!nameReady && !pincodeReady) {
            setResults([]);
            setHasSearched(false);
            setSearching(false);
            return;
        }

        // Abort the previous in-flight search.
        searchAbortRef.current?.abort();
        const controller = new AbortController();
        searchAbortRef.current = controller;

        const timer = setTimeout(async () => {
            setSearching(true);
            setHasSearched(true);
            try {
                const found = await searchSchools(
                    {
                        name: trimmedName || undefined,
                        pincode: trimmedPincode || undefined,
                    },
                    controller.signal,
                );
                if (!controller.signal.aborted) setResults(found);
            } catch {
                if (!controller.signal.aborted) setResults([]);
            } finally {
                if (!controller.signal.aborted) setSearching(false);
            }
        }, pincodeReady ? 0 : NAME_SEARCH_DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [name, pincode, mode, value]);

    // Fill city and state as soon as a complete pincode is typed (add form only).
    useEffect(() => {
        const clean = addPincode.replace(/\D/g, '').trim();
        if (clean.length !== PINCODE_LENGTH) {
            setLocation(null);
            return;
        }
        let cancelled = false;
        setLocating(true);
        lookupPincode(clean)
            .then((found) => !cancelled && setLocation({ city: found.city, state: found.state }))
            .catch(() => !cancelled && setLocation(null))
            .finally(() => !cancelled && setLocating(false));
        return () => {
            cancelled = true;
        };
    }, [addPincode]);

    const select = useCallback(
        (school: DirectorySchool) => {
            onChange(school);
            setOpen(false);
            setAdding(false);
            setError('');
        },
        [onChange],
    );

    async function applyCode() {
        setBusy(true);
        setError('');
        try {
            select(await findSchoolByCode(code));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'That code did not work.');
        } finally {
            setBusy(false);
        }
    }

    async function submitNewSchool() {
        setBusy(true);
        setError('');
        try {
            select(await addSchool(newName, addPincode.replace(/\D/g, '')));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not select your school.');
        } finally {
            setBusy(false);
        }
    }

    if (value) {
        return (
            <>
                <div className="input-group">
                    <label className="input-label">School</label>
                    <div className="school-chip">
                        <div className="school-chip__text">
                            <strong>{value.name}</strong>
                            <span>
                                {value.code ? `${value.code} · ` : ''}
                                {value.city}, {value.state}
                                {value.onboarded ? ' · Onboarded' : ' · Pending review'}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                                onChange(null);
                                setName('');
                                setPincode('');
                                setCode('');
                                setError('');
                                // A section belongs to a school — dropping the
                                // school must drop it too, or the student keeps
                                // "7-B" from a school they no longer attend.
                                onSectionChange?.('');
                            }}
                        >
                            Change
                        </button>
                    </div>
                </div>

                {onSectionChange && (
                    <div className="input-group">
                        <label className="input-label" htmlFor="section">
                            Your section <span className="input-required">required</span>
                        </label>
                        <input
                            id="section"
                            name="section"
                            type="text"
                            className="input-field"
                            placeholder="A"
                            maxLength={SECTION_MAX_LENGTH}
                            autoComplete="off"
                            required
                            value={section ?? ''}
                            onChange={(event) =>
                                onSectionChange(event.target.value.slice(0, SECTION_MAX_LENGTH))
                            }
                        />
                        <p className="input-hint">
                            Exactly as your school writes it: <strong>A</strong>,{' '}
                            <strong>B2</strong>, <strong>Rose</strong>. This is how your teachers
                            find your class in their results. If your school does not use
                            sections, write <strong>NA</strong>.
                        </p>
                    </div>
                )}
            </>
        );
    }

    return (
        <div className="input-group" ref={containerRef} style={{ position: 'relative' }}>
            <label className="input-label" htmlFor="schoolName">
                School
            </label>
            <p className="input-hint" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                Your results are grouped by school, so school level ranking & reports can be made.
                Every participant needs one. Most participants should just search by name: a school code is only for participants whose school handed them one.
            </p>

            <div className="school-tabs">
                <button
                    type="button"
                    className={`school-tab ${mode === 'search' ? 'active' : ''}`}
                    onClick={() => {
                        setMode('search');
                        setError('');
                    }}
                >
                    Search
                </button>
                <button
                    type="button"
                    className={`school-tab ${mode === 'code' ? 'active' : ''}`}
                    onClick={() => {
                        setMode('code');
                        setError('');
                        setAdding(false);
                    }}
                >
                    I have a school code
                </button>
            </div>

            {mode === 'code' ? (
                <>
                    <div className="school-code-row">
                        <input
                            id="schoolCode"
                            className="input-field"
                            placeholder="SCH-XXXXXX"
                            value={code}
                            spellCheck={false}
                            onChange={(event) => setCode(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    if (code.trim()) void applyCode();
                                }
                            }}
                        />
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busy || !code.trim()}
                            onClick={() => void applyCode()}
                        >
                            {busy ? 'Checking…' : 'Apply'}
                        </button>
                    </div>
                    {/* Students arrive with a code they were handed and no idea what
                        it is, or with none and no idea whether they should have one. */}
                    <p className="input-hint">
                        A school code looks like <strong>SCH-ABC123</strong>. Your school
                        coordinator or class teacher gives it out, it may be on a circular or a
                        message from the school. <strong>You do not need one:</strong> if you
                        haven&apos;t been given a code, just search for your school by name instead.
                    </p>
                </>
            ) : adding ? (
                /* Two fields and nothing else. Everything the directory needs
                   beyond the name comes from the pincode, so a student who
                   cannot find their school types what is on their uniform and
                   what is on their address, and is done. */
                <div className="school-add">
                    <p className="school-add__intro">
                        <strong>Select your school</strong>
                        <span>
                            Type the full name as your school writes it, and the pincode of the
                            area it is in. We fill in the city and state for you. Your school will
                            not appear in the public list until it is officially onboarded, but you
                            can continue registering.
                        </span>
                    </p>
                    <label className="input-label" htmlFor="newSchoolName">
                        School name
                    </label>
                    <input
                        id="newSchoolName"
                        className="input-field"
                        placeholder="e.g. Kendriya Vidyalaya No. 2"
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                    />
                    <label className="input-label" htmlFor="newSchoolPincode">
                        School pincode
                    </label>
                    <input
                        id="newSchoolPincode"
                        className="input-field"
                        placeholder="6 digits, e.g. 440001"
                        inputMode="numeric"
                        maxLength={PINCODE_LENGTH}
                        value={addPincode}
                        onChange={(event) =>
                            setAddPincode(event.target.value.replace(/\D/g, '').slice(0, PINCODE_LENGTH))
                        }
                    />
                    <p className="school-add__hint">
                        {locating
                            ? 'Looking up your pincode…'
                            : location
                              ? `📍 ${location.city}, ${location.state}`
                              : addPincode.replace(/\D/g, '').length === PINCODE_LENGTH
                                ? 'We could not find that pincode. Check the six digits and try again.'
                                : 'City and state are filled in from your pincode.'}
                    </p>
                    <div className="school-add__actions">
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                                setAdding(false);
                                setNewName('');
                                setAddPincode('');
                                setLocation(null);
                            }}
                        >
                            Back to search
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy || !newName.trim() || !location}
                            onClick={() => void submitNewSchool()}
                        >
                            {busy ? 'Saving…' : 'Select school'}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="school-search-row">
                        <div className="school-search-field">
                            <label className="input-label" htmlFor="schoolName">
                                School name
                            </label>
                            <input
                                id="schoolName"
                                className="input-field"
                                placeholder="Type your school name"
                                value={name}
                                autoComplete="off"
                                onChange={(event) => {
                                    setName(event.target.value);
                                    setOpen(true);
                                }}
                                onFocus={() => setOpen(true)}
                            />
                        </div>
                        <div className="school-search-field">
                            <label className="input-label" htmlFor="schoolPincode">
                                Pincode
                            </label>
                            <input
                                id="schoolPincode"
                                className="input-field"
                                placeholder="6 digits"
                                inputMode="numeric"
                                maxLength={PINCODE_LENGTH}
                                value={pincode}
                                onChange={(event) => {
                                    setPincode(event.target.value.replace(/\D/g, '').slice(0, PINCODE_LENGTH));
                                    setOpen(true);
                                }}
                                onFocus={() => setOpen(true)}
                            />
                        </div>
                    </div>
                    <p className="input-hint" style={{ marginTop: '0.25rem' }}>
                        You can fill in either field or both. Pincode is the fastest way to find
                        your school. Type at least 3 letters of the school name to see the list.
                    </p>

                    {open && (name.trim().length >= NAME_MIN_LENGTH || pincode.replace(/\D/g, '').length === PINCODE_LENGTH) && (
                        <div className="school-dropdown">
                            {searching && results.length === 0 ? (
                                <div className="school-dropdown__empty">Searching…</div>
                            ) : results.length > 0 ? (
                                results.map((school) => (
                                    <button
                                        type="button"
                                        key={school.id}
                                        className="school-option"
                                        onClick={() => select(school)}
                                    >
                                        <span className="school-option__name">
                                            {school.name}
                                            <span className="school-option__badge">Onboarded</span>
                                        </span>
                                        <span className="school-option__meta">
                                            {school.city}, {school.state} · {school.pincode}
                                        </span>
                                    </button>
                                ))
                            ) : (
                                <div className="school-dropdown__empty">
                                    {hasSearched ? 'No schools match your search.' : 'Keep typing to search…'}
                                </div>
                            )}
                            {hasSearched && !searching && (
                                <button
                                    type="button"
                                    className="school-option school-option--add"
                                    onClick={() => {
                                        setNewName(name);
                                        setAddPincode(pincode);
                                        setAdding(true);
                                        setOpen(false);
                                    }}
                                >
                                    + My school isn’t listed, select it
                                </button>
                            )}
                        </div>
                    )}
                    {/* The same escape hatch, outside the dropdown. */}
                    {!adding && (
                        <p className="school-add-prompt">
                            Can’t find it?{' '}
                            <button
                                type="button"
                                className="school-add-prompt__link"
                                onClick={() => {
                                    setNewName(name);
                                    setAddPincode(pincode);
                                    setAdding(true);
                                    setOpen(false);
                                }}
                            >
                                Select your school
                            </button>{' '}
                            (it takes the name and a pincode).
                        </p>
                    )}
                </>
            )}

            {error && <p className="school-error">{error}</p>}
        </div>
    );
}
