import { describe, expect, it } from 'vitest';
import { TOURS, tourForPath, type TourId } from './tours';

const ALL_IDS = Object.keys(TOURS) as TourId[];

describe('tourForPath', () => {
    it('maps each student screen to its own tour', () => {
        expect(tourForPath('/')).toBe('home');
        expect(tourForPath('/register')).toBe('register');
        expect(tourForPath('/dashboard')).toBe('dashboard');
        expect(tourForPath('/training')).toBe('training');
        expect(tourForPath('/exams')).toBe('exams');
        expect(tourForPath('/results')).toBe('results');
        expect(tourForPath('/certificates')).toBe('certificates');
        expect(tourForPath('/support')).toBe('support');
        expect(tourForPath('/profile')).toBe('profile');
    });

    /**
     * The exam player is the one screen that must never offer this.
     *
     * A student mid-paper must not be handed an overlay that covers their
     * questions while the clock runs. The trial run mounts its own tour, which
     * is where learning the interface belongs.
     */
    it('never offers help inside the exam player', () => {
        expect(tourForPath('/exams/abc-123/play')).toBeNull();
        expect(tourForPath('/exams/abc-123/play?next=xyz')).toBeNull();
    });

    // The instructions and slot pages are not the player, and are exactly where
    // a confused student wants a guide.
    it('still offers help on the pages around the player', () => {
        expect(tourForPath('/exams/abc-123/instructions')).toBe('exams');
        expect(tourForPath('/exams/abc-123/slots')).toBe('exams');
    });

    it('returns null where there is nothing to explain', () => {
        expect(tourForPath('/login')).toBeNull();
        expect(tourForPath('/terms')).toBeNull();
        expect(tourForPath(null)).toBeNull();
    });

    // `/trainingsomething` must not match `/training` — prefix matching that
    // ignores the boundary is how a tour ends up on the wrong page.
    it('matches whole path segments, not bare prefixes', () => {
        expect(tourForPath('/trainingcamp')).toBeNull();
        expect(tourForPath('/results-archive')).toBeNull();
    });
});

describe('tour scripts', () => {
    it('every tour has an intro and at least one step', () => {
        for (const id of ALL_IDS) {
            expect(TOURS[id].intro, id).toBeTruthy();
            expect(TOURS[id].steps.length, id).toBeGreaterThan(0);
        }
    });

    it('every step says something, in Limon’s voice', () => {
        for (const id of ALL_IDS) {
            for (const step of TOURS[id].steps) {
                expect(step.title, `${id}: ${step.title}`).toBeTruthy();
                expect(step.body, `${id}: ${step.title}`).toBeTruthy();
            }
        }
    });

    // The id on the object and the key it is filed under must agree, or
    // `tourForPath` returns a key that looks up a different script.
    it('files every tour under its own id', () => {
        for (const id of ALL_IDS) {
            expect(TOURS[id].id, id).toBe(id);
        }
    });
});
