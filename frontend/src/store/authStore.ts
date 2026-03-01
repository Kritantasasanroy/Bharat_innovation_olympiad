import api from '@/lib/api';
import { AuthTokens, User } from '@/types/user';
import { create } from 'zustand';

interface AuthState {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;

    // Actions
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

    login: async (email: string, password: string) => {
        const { data } = await api.post<{ user: User; tokens: AuthTokens }>('/auth/login', {
            email,
            password,
        });
        localStorage.setItem('accessToken', data.tokens.accessToken);
        localStorage.setItem('refreshToken', data.tokens.refreshToken);
        set({ user: data.user, isAuthenticated: true, isLoading: false });
    },

    register: async (formData: any) => {
        const { data } = await api.post<{ user: User; tokens: AuthTokens }>('/auth/register', formData);
        localStorage.setItem('accessToken', data.tokens.accessToken);
        localStorage.setItem('refreshToken', data.tokens.refreshToken);
        set({ user: data.user, isAuthenticated: true, isLoading: false });
    },

    logout: () => {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
            api.post('/auth/logout', { refreshToken }).catch(() => { });
        }
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
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
            set({ user: null, isAuthenticated: false, isLoading: false });
        }
    },

    setUser: (user) => set({ user, isAuthenticated: !!user }),
}));
