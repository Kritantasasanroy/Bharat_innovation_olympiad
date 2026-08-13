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
     * Pre-fetched list from the parent. Seeds the dropdown instantly so the
     * student doesn't see a loading state the first time they focus the field.
     */
    initialResults?: DirectorySchool[];
}

const SEARCH_DEBOUNCE_MS = 250;
const PINCODE_LENGTH = 6;
/** Long enough for "Rose"/"B2"; short enough to print on a roster. */
const SECTION_MAX_LENGTH = 10;

/**
 * Choose a school during registration, three ways:
 *
 *  1. Search by name, city or pincode — nothing is case-sensitive.
 *  2. Enter the school code staff issued the school on approval, which assigns
 *     the student to it directly.
 *  3. Add the school, if it isn't listed. City and state come from the pincode,
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
 * ## Section
 *
 * Free text, not an A–H dropdown: Indian schools name sections inconsistently
 * ("A", "B2", "Rose", "Alpha") and a fixed list would leave real students unable
 * to register. It appears only after a school is picked, so the two are never out
 * of step.
 */
export default function SchoolPicker({ value, onChange, section, onSectionChange, initialResults }: Props) {
    const [mode, setMode] = useState<Mode>('search');

    // Search
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<DirectorySchool[]>(initialResults ?? []);
    const [searching, setSearching] = useState(false);
    const [open, setOpen] = useState(false);
    // Track whether the pre-warmed list has been loaded so we skip the
    // first empty-query fetch when the parent already supplied results.
    const seededRef = useRef(!!initialResults?.length);

    // Code
    const [code, setCode] = useState('');

    // Add-my-school
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [pincode, setPincode] = useState('');
    const [location, setLocation] = useState<{ city: string; state: string } | null>(null);
    const [locating, setLocating] = useState(false);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const containerRef = useRef<HTMLDivElement>(null);

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

    // Debounced search. The abort controller means a slow early response can
    // never overwrite the results of a later, more specific query.
    useEffect(() => {
        if (mode !== 'search' || value) return;
        // Skip the initial empty-query fetch when the parent pre-warmed us.
        if (!query && seededRef.current) return;
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const found = await searchSchools(query, controller.signal);
                setResults(found);
                // Mark as seeded once we have results for the empty query.
                if (!query) seededRef.current = true;
            } catch {
                if (!controller.signal.aborted) setResults([]);
            } finally {
                if (!controller.signal.aborted) setSearching(false);
            }
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query, mode, value]);

    // Fill city and state as soon as a complete pincode is typed.
    useEffect(() => {
        if (pincode.length !== PINCODE_LENGTH) {
            setLocation(null);
            return;
        }
        let cancelled = false;
        setLocating(true);
        lookupPincode(pincode)
            .then((found) => !cancelled && setLocation({ city: found.city, state: found.state }))
            .catch(() => !cancelled && setLocation(null))
            .finally(() => !cancelled && setLocating(false));
        return () => {
            cancelled = true;
        };
    }, [pincode]);

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
            select(await addSchool(newName, pincode));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not add your school.');
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
                                {value.code} · {value.city}, {value.state}
                                {value.onboarded ? ' · Onboarded' : ''}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                                onChange(null);
                                setQuery('');
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
            <label className="input-label" htmlFor="schoolSearch">
                School
            </label>
            <p className="input-hint" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                Your results are grouped by school, so your teachers can see how your class did.
                Every participant needs one. <strong>Most participants should just search by name</strong>:
                a school code is only for participants whose school handed them one.
            </p>

            <div className="school-tabs">
                <button
                    type="button"
                    className={`school-tab ${mode === 'search' ? 'active' : ''}`}
                    onClick={() => { setMode('search'); setError(''); }}
                >
                    Search
                </button>
                <button
                    type="button"
                    className={`school-tab ${mode === 'code' ? 'active' : ''}`}
                    onClick={() => { setMode('code'); setError(''); setAdding(false); }}
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
                        <strong>Adding your school</strong>
                        <span>
                            Type the full name as your school writes it, and the pincode of the
                            area it is in. We fill in the city and state for you. If another
                            student has already added it, we will use theirs rather than making a
                            duplicate.
                        </span>
                    </p>
                    <label className="input-label" htmlFor="newSchoolName">School name</label>
                    <input
                        id="newSchoolName"
                        className="input-field"
                        placeholder="e.g. Kendriya Vidyalaya No. 2"
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                    />
                    <label className="input-label" htmlFor="newSchoolPincode">School pincode</label>
                    <input
                        id="newSchoolPincode"
                        className="input-field"
                        placeholder="6 digits, e.g. 440001"
                        inputMode="numeric"
                        maxLength={PINCODE_LENGTH}
                        value={pincode}
                        onChange={(event) => setPincode(event.target.value.replace(/\D/g, '').slice(0, PINCODE_LENGTH))}
                    />
                    <p className="school-add__hint">
                        {locating
                            ? 'Looking up your pincode…'
                            : location
                              ? `📍 ${location.city}, ${location.state}`
                              : pincode.length === PINCODE_LENGTH
                                ? 'We could not find that pincode. Check the six digits and try again.'
                                : 'City and state are filled in from your pincode.'}
                    </p>
                    <div className="school-add__actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(false)}>
                            Back to search
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy || !newName.trim() || !location}
                            onClick={() => void submitNewSchool()}
                        >
                            {busy ? 'Adding…' : 'Add school'}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <input
                        id="schoolSearch"
                        className="input-field"
                        placeholder="Search by name, city or pincode"
                        value={query}
                        autoComplete="off"
                        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                    />
                    {open && (
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
                                            {school.onboarded && <span className="school-option__badge">Onboarded</span>}
                                        </span>
                                        <span className="school-option__meta">
                                            {school.city}, {school.state} · {school.pincode}
                                        </span>
                                    </button>
                                ))
                            ) : (
                                <div className="school-dropdown__empty">
                                    No schools match “{query}”.
                                </div>
                            )}
                            <button
                                type="button"
                                className="school-option school-option--add"
                                onClick={() => {
                                    setNewName(query);
                                    setAdding(true);
                                    setOpen(false);
                                }}
                            >
                                + My school isn’t listed, add it
                            </button>
                        </div>
                    )}
                    {/* The same escape hatch, outside the dropdown.
                        It used to exist only as the last row of a list that
                        opens on focus and closes on an outside click — so a
                        student who searched, saw nothing, and clicked away to
                        think had no visible way forward and no reason to believe
                        one existed. This one is always on screen. */}
                    <p className="school-add-prompt">
                        Can’t find it?{' '}
                        <button
                            type="button"
                            className="school-add-prompt__link"
                            onClick={() => {
                                setNewName(query);
                                setAdding(true);
                                setOpen(false);
                            }}
                        >
                            Add your school
                        </button>{' '}
                        (it takes the name and a pincode).
                    </p>
                </>
            )}

            {error && <p className="school-error">{error}</p>}
        </div>
    );
}
