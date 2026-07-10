const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * The school directory, served by the backend. It replaces a hard-coded JSON
 * file whose codes (`SCH001`…) matched nothing in the database, so picking a
 * school always failed with "Invalid school code".
 *
 * These routes are public: a student is choosing their school mid-registration
 * and has no token yet, so the shared `api` client (which attaches one) is not
 * used here.
 */
export interface DirectorySchool {
    id: string;
    code: string;
    name: string;
    city: string;
    state: string;
    pincode: string;
    /** Onboarded schools have a coordinator and a portal; added ones do not yet. */
    onboarded: boolean;
}

export interface PincodeLocation {
    pincode: string;
    city: string;
    state: string;
}

async function readError(response: Response, fallback: string): Promise<string> {
    const body = await response.json().catch(() => null);
    const message = body?.message;
    if (Array.isArray(message)) return message[0] ?? fallback;
    return typeof message === 'string' ? message : fallback;
}

export async function searchSchools(query: string, signal?: AbortSignal): Promise<DirectorySchool[]> {
    const url = `${API_URL}/api/schools${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`;
    const response = await fetch(url, signal ? { signal } : {});
    if (!response.ok) throw new Error('Could not load schools.');
    return response.json();
}

/** Resolve the code from a school's handover card. Rejects with a readable message. */
export async function findSchoolByCode(code: string): Promise<DirectorySchool> {
    const response = await fetch(`${API_URL}/api/schools/by-code/${encodeURIComponent(code.trim())}`);
    if (!response.ok) {
        throw new Error(await readError(response, 'No school has that code.'));
    }
    return response.json();
}

/** "My school isn't listed." Idempotent server-side — adding it twice is safe. */
export async function addSchool(name: string, pincode: string): Promise<DirectorySchool> {
    const response = await fetch(`${API_URL}/api/schools/add`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, pincode }),
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Could not add your school.'));
    }
    return response.json();
}

/** City and state from a pincode, so nobody types them. */
export async function lookupPincode(pincode: string): Promise<PincodeLocation> {
    const response = await fetch(`${API_URL}/api/geo/pincode/${encodeURIComponent(pincode)}`);
    if (!response.ok) {
        throw new Error(await readError(response, 'Could not find that pincode.'));
    }
    return response.json();
}
