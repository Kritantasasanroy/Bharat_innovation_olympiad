'use client';

import { useCallback } from 'react';

interface SebKeys {
    browserExamKey: string | null;
    configKey: string | null;
}

declare global {
    interface Window {
        SafeExamBrowser?: {
            security: {
                browserExamKey: Promise<string>;
                configKey: Promise<string>;
            };
        };
    }
}

export function useSebHeaders() {
    /**
     * Get SEB keys via the SEB JavaScript API.
     * Used for modern SEB versions (macOS 3.0+, Windows 3.3.2+)
     * where HTTP headers may not work with WKWebView.
     */
    const getSebKeys = useCallback(async (): Promise<SebKeys> => {
        if (typeof window !== 'undefined' && window.SafeExamBrowser) {
            try {
                const [browserExamKey, configKey] = await Promise.all([
                    window.SafeExamBrowser.security.browserExamKey,
                    window.SafeExamBrowser.security.configKey,
                ]);
                return { browserExamKey, configKey };
            } catch (err) {
                console.error('[SEB] Error getting keys:', err);
            }
        }
        return { browserExamKey: null, configKey: null };
    }, []);

    /**
     * Check if the current browser is SEB by examining user agent.
     * Note: This is a soft check — the real validation happens server-side
     * via Browser Exam Key hash validation.
     */
    const isSebBrowser = useCallback((): boolean => {
        if (typeof window === 'undefined') return false;
        return navigator.userAgent.includes('SEB/');
    }, []);

    return { getSebKeys, isSebBrowser };
}
