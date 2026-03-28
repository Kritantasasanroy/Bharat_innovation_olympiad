'use client';

import { APP_NAME, COMPANY_NAME } from '@/lib/constants';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AdminLoginPage() {
    const [email, setEmail] = useState('Admin@bio123.com');
    const [password, setPassword] = useState('Admin@bio123');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const router = useRouter();
    const login = useAuthStore((state) => state.login);
    const logout = useAuthStore((state) => state.logout);
    const user = useAuthStore((state) => state.user);
    const { theme, toggleTheme } = useThemeStore();
    const isDarkMode = theme === 'dark';

    useEffect(() => {
        if (user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
            router.push('/dashboard');
        } else if (user && user.role === 'STUDENT') {
            setError('Students cannot access the Admin Portal.');
            useAuthStore.getState().logout();
        }
    }, [user, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await login(email, password);
            const loggedInUser = useAuthStore.getState().user;
            if (!loggedInUser) {
                setError('Invalid admin credentials');
                return;
            }
            if (loggedInUser.role === 'STUDENT') {
                setError('Access Denied. Admins only.');
                logout();
                return;
            }
            router.push('/dashboard');
        } catch (err: unknown) {
            const responseData =
                typeof err === 'object' &&
                err !== null &&
                'response' in err &&
                typeof (err as { response?: unknown }).response === 'object'
                    ? (err as { response?: { data?: { message?: string | string[] } } }).response?.data
                    : undefined;
            const msg = responseData?.message;
            if (Array.isArray(msg)) {
                setError(msg.join(', '));
            } else {
                setError(msg || 'Invalid admin credentials');
            }
        } finally {
            setIsLoading(false);
        }
    };

    if (user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
        return null;
    }

    return (
        <main className="auth-layout animate-fade-in" style={{ 
            minHeight: '100vh', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            background: 'var(--bg-primary)'
        }}>
            <button
                onClick={toggleTheme}
                className="theme-toggle"
                aria-label="Toggle theme"
                style={{
                    position: 'absolute',
                    top: 'var(--space-6)',
                    right: 'var(--space-6)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    padding: 'var(--space-2)',
                    borderRadius: 'var(--radius-full)',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    boxShadow: 'var(--shadow-sm)'
                }}
            >
                {isDarkMode ? '☀️' : '🌙'}
            </button>

            <div className="auth-card glass-card" style={{ maxWidth: '420px', width: '100%', padding: 'var(--space-8)' }}>
                <div className="auth-header" style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
                        <img 
                            src="/Lemon-Ideas-Final-Logo.png" 
                            alt={COMPANY_NAME} 
                            style={{ height: '50px', objectFit: 'contain' }} 
                            onError={(e) => {
                                // Fallback icon if logo not found in admin-frontend public dir
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('hidden');
                            }}
                        />
                        <div className="logo-placeholder" hidden style={{
                            width: '48px', height: '48px', 
                            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600))',
                            borderRadius: 'var(--radius-md)', display: 'flex', 
                            alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontWeight: 700, fontSize: '1.5rem',
                            boxShadow: 'var(--shadow-md)'
                        }}>
                            AI
                        </div>
                    </div>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: 'var(--space-2)' }}>{APP_NAME}</h1>
                    <p style={{ color: 'var(--primary-400)', fontWeight: 600, letterSpacing: '1px' }}>ADMIN PORTAL</p>
                </div>

                {error && (
                    <div className="error-alert" style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: 'var(--error-500)',
                        padding: 'var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--space-6)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        fontSize: '0.9rem',
                        textAlign: 'center'
                    }}>
                        {error}
                    </div>
                )}

                <div style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3)',
                    marginBottom: 'var(--space-4)',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6
                }}>
                    <div><strong>Demo Admin ID:</strong> Admin@bio123.com</div>
                    <div><strong>Demo Admin Password:</strong> Admin@bio123</div>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div className="input-group">
                        <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Admin Email</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="input-field"
                            placeholder="admin@example.com"
                            style={{
                                width: '100%', padding: 'var(--space-3)',
                                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                                transition: 'border-color var(--transition-fast)'
                            }}
                        />
                    </div>

                    <div className="input-group" style={{ position: 'relative' }}>
                        <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Password</label>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="input-field"
                            placeholder="••••••••"
                            style={{
                                width: '100%', padding: 'var(--space-3)', paddingRight: 'var(--space-10)',
                                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                                transition: 'border-color var(--transition-fast)'
                            }}
                        />
                        <button
                            type="button"
                            className="password-toggle"
                            onClick={() => setShowPassword(!showPassword)}
                            style={{
                                position: 'absolute', right: '12px', top: '38px',
                                background: 'none', border: 'none', color: 'var(--text-muted)',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="btn btn-primary"
                        style={{
                            marginTop: 'var(--space-4)', width: '100%',
                            display: 'flex', justifyContent: 'center', alignItems: 'center'
                        }}
                    >
                        {isLoading ? <Loader2 className="spinner" size={18} /> : 'Login to Dashboard'}
                    </button>
                </form>
            </div>
        </main>
    );
}
