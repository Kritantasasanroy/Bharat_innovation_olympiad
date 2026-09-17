// ── User Types ──

export type Role = 'STUDENT' | 'PARENT' | 'ADMIN' | 'SUPER_ADMIN';

export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    /** Contact number, editable by the student from their profile page. */
    phone?: string | null;
    role: Role;
    classBand?: number;
    /** Olympiad roll number, e.g. `BIO26-G8-00123`. Issued at registration. */
    rollNumber?: string | null;
    /** Class section as the school writes it — "A", "B2", "Rose". */
    section?: string | null;
    schoolId?: string;
    school?: { name: string };
    profileImageUrl?: string;
    isActive: boolean;
    createdAt: string;
}

/** Student identification — what `GET /identification/me` returns. */
export interface IdentificationStatus {
    version: string;
    complete: boolean;
    profile: {
        studentDob?: string | null;
        gender?: string | null;
        city?: string | null;
        state?: string | null;
        idDocumentType?: string | null;
        parentalConsentAt: string;
        dataConsentAt: string;
        consentVersion: string;
    } | null;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: Role;
    classBand?: number;
    schoolCode?: string;
}
