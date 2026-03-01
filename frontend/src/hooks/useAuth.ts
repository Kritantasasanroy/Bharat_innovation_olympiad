'use client';

import { useAuthStore } from '@/store/authStore';
import { useEffect } from 'react';

export function useAuth() {
    const store = useAuthStore();

    useEffect(() => {
        store.loadUser();
    }, []);

    return {
        user: store.user,
        isLoading: store.isLoading,
        isAuthenticated: store.isAuthenticated,
        login: store.login,
        register: store.register,
        logout: store.logout,
    };
}
