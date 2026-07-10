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
}

const SEARCH_DEBOUNCE_MS = 250;
const PINCODE_LENGTH = 6;

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
 * Choosing a school is optional — a student with no school registers anyway.
 */
export default function SchoolPicker({ value, onChange }: Props) {
    const [mode, setMode] = useState<Mode>('search');

    // Search
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<DirectorySchool[]>([]);
    const [searching, setSearching] = useState(false);
    const [open, setOpen] = useState(false);

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
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                setResults(await searchSchools(query, controller.signal));
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
                        }}
                    >
                        Change
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="input-group" ref={containerRef} style={{ position: 'relative' }}>
            <label className="input-label" htmlFor="schoolSearch">
                School <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span>
            </label>

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
            ) : adding ? (
                <div className="school-add">
                    <input
                        className="input-field"
                        placeholder="School name"
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                    />
                    <input
                        className="input-field"
                        placeholder="Pincode"
                        inputMode="numeric"
                        maxLength={PINCODE_LENGTH}
                        value={pincode}
                        onChange={(event) => setPincode(event.target.value.replace(/\D/g, '').slice(0, PINCODE_LENGTH))}
                    />
                    <p className="school-add__hint">
                        {locating
                            ? 'Looking up your pincode…'
                            : location
                              ? `${location.city}, ${location.state}`
                              : pincode.length === PINCODE_LENGTH
                                ? 'We could not find that pincode.'
                                : 'City and state are filled in from your pincode.'}
                    </p>
                    <div className="school-add__actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(false)}>
                            Cancel
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
                                + My school isn’t listed — add it
                            </button>
                        </div>
                    )}
                </>
            )}

            {error && <p className="school-error">{error}</p>}
        </div>
    );
}
