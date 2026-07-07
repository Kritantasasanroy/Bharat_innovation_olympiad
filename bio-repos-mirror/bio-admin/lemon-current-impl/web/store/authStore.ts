import api from '@/lib/api';
import { User } from '@/types/user';
import { create } from 'zustand';

interface AuthState {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;

    login: (email: string, password: string) => Promise<void>;
    register: (data: any) => Promise<void>;
    logout: () => void;
    loadUser: () => Promise<void>;
    setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isLoading: true,
    isAuthenticated: false,

    /**
     * Admin login using hardcoded credentials.
     * Calls /auth/admin-login which verifies credentials and returns a JWT.
     */
    login: async (email: string, password: string) => {
        const { data } = await api.post<{ accessToken: string; user: User }>('/auth/admin-login', {
            email,
            password,
        });
        localStorage.setItem('accessToken', data.accessToken);
        set({ user: data.user, isAuthenticated: true, isLoading: false });
    },

    register: async () => {
        // Not used in admin portal
        throw new Error('Registration not available in admin portal');
    },

    logout: () => {
        localStorage.removeItem('accessToken');
        set({ user: null, isAuthenticated: false, isLoading: false });
    },

    loadUser: async () => {
        try {
            const token = localStorage.getItem('accessToken');
            if (!token) {
                set({ isLoading: false });
                return;
            }
            const { data } = await api.get<User>('/auth/me');
            set({ user: data, isAuthenticated: true, isLoading: false });
        } catch {
            localStorage.removeItem('accessToken');
            set({ user: null, isAuthenticated: false, isLoading: false });
        }
    },

    setUser: (user) => set({ user, isAuthenticated: !!user }),
}));
