'use client';

import { useAuthStore } from '@/store/authStore';
import { useEffect, useRef } from 'react';

export function useAuth() {
    const store = useAuthStore();
    const initialized = useRef(false);

    useEffect(() => {
        // Only run loadUser once on mount — prevents infinite loop
        if (!initialized.current) {
            initialized.current = true;
            store.loadUser();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        user: store.user,
        isLoading: store.isLoading,
        isAuthenticated: store.isAuthenticated,
        login: store.login,
        register: store.register,
        logout: store.logout,
    };
}
