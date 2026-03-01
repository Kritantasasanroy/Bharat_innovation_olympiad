// ── User Types ──

export type Role = 'STUDENT' | 'PARENT' | 'ADMIN' | 'SUPER_ADMIN';

export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    classBand?: number;
    schoolId?: string;
    schoolName?: string;
    profileImageUrl?: string;
    isActive: boolean;
    createdAt: string;
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
