import api from '@/lib/api';
import { User } from '@/types/user';
import { create } from 'zustand';

interface AuthState {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;

    login: (email: string, password: string) => Promise<void>;
    register: (data: any) => Promise<void>;
    loginWithEmail: (email: string) => Promise<void>;
    logout: () => Promise<void>;
    loadUser: () => Promise<void>;
    updateProfile: (data: { firstName: string; lastName: string; classBand: number }) => Promise<void>;
    setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isLoading: true,
    isAuthenticated: false,

    /**
     * Admin-only login via hardcoded credentials.
     * Calls /auth/admin-login → returns our own JWT.
     */
    login: async (email: string, password: string) => {
        const { data } = await api.post<{ accessToken: string; user: User }>('/auth/admin-login', {
            email,
            password,
        });
        localStorage.setItem('accessToken', data.accessToken);
        set({ user: data.user, isAuthenticated: true, isLoading: false });
    },

    /**
     * Student registration — called after OTP verification.
     * POSTs to /auth/sync (public endpoint) with email + profile data in body.
     * Gets back our own signed JWT — no Neon session token needed.
     */
    register: async (formData: any) => {
        const { data } = await api.post<{ accessToken: string; user: User }>('/auth/sync', formData);
        localStorage.setItem('accessToken', data.accessToken);
        set({ user: data.user, isAuthenticated: true, isLoading: false });
    },

    /**
     * Student login — called after OTP sign-in succeeds.
     * POSTs to /auth/login-sync (public endpoint) with just the email.
     * Gets back our own signed JWT — no Neon session token needed.
     */
    loginWithEmail: async (email: string) => {
        const { data } = await api.post<{ accessToken: string; user: User }>('/auth/login-sync', { email });
        localStorage.setItem('accessToken', data.accessToken);
        set({ user: data.user, isAuthenticated: true, isLoading: false });
    },

    logout: async () => {
        try {
            const { authClient } = await import('@/lib/auth-client');
            await authClient.signOut();
        } catch {
            // ignore
        }
        localStorage.removeItem('accessToken');
        set({ user: null, isAuthenticated: false, isLoading: false });
    },

    /**
     * Called on app start — reads the JWT from localStorage and fetches the user profile.
     * Only works if a valid token is already stored (admin or previously logged-in student).
     */
    loadUser: async () => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
        if (!token) {
            set({ user: null, isAuthenticated: false, isLoading: false });
            return;
        }
        try {
            const { data: user } = await api.get<User>('/auth/me');
            set({ user, isAuthenticated: true, isLoading: false });
        } catch {
            localStorage.removeItem('accessToken');
            set({ user: null, isAuthenticated: false, isLoading: false });
        }
    },

    updateProfile: async (profileData) => {
        const { data } = await api.put<User>('/auth/me', profileData);
        set({ user: data });
    },

    setUser: (user) => set({ user, isAuthenticated: !!user }),
}));
