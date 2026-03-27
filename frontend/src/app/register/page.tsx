'use client';

import { APP_NAME, CLASS_BANDS, COMPANY_NAME } from '@/lib/constants';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export default function RegisterPage() {
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'STUDENT' as const,
        classBand: 6,
        schoolCode: '',
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const register = useAuthStore((s) => s.register);
    const router = useRouter();
    const { theme, toggleTheme } = useThemeStore();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData((prev) => ({
            ...prev,
            [e.target.name]: e.target.name === 'classBand' ? parseInt(e.target.value) : e.target.value,
        }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (formData.password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        setIsLoading(true);
        try {
            const { confirmPassword, schoolCode, ...data } = formData;
            await register({ ...data, ...(schoolCode ? { schoolCode } : {}) });
            router.push('/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Registration failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div style={{ position: 'fixed', top: 'var(--space-4)', right: 'var(--space-4)', zIndex: 100 }}>
                <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
                    {theme === 'dark' ? '☀️' : '🌙'}
                </button>
            </div>
            <div className="auth-container animate-fade-in">
                <div className="auth-header">
                    <div className="auth-logo"><img src="/lemon-ideas-logo.png" alt="Lemon Ideas" style={{ height: '48px', width: 'auto' }} /></div>
                    <h1 className="auth-title">{APP_NAME}</h1>
                    <p className="auth-company">by {COMPANY_NAME}</p>
                    <p className="auth-subtitle">Create your student account</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && <div className="auth-error">{error}</div>}

                    <div className="form-row">
                        <div className="input-group">
                            <label className="input-label" htmlFor="firstName">First Name</label>
                            <input
                                id="firstName" name="firstName" type="text" className="input-field"
                                placeholder="Aarav" value={formData.firstName}
                                onChange={handleChange} required
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label" htmlFor="lastName">Last Name</label>
                            <input
                                id="lastName" name="lastName" type="text" className="input-field"
                                placeholder="Sharma" value={formData.lastName}
                                onChange={handleChange} required
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="email">Email Address</label>
                        <input
                            id="email" name="email" type="email" className="input-field"
                            placeholder="you@school.edu.in" value={formData.email}
                            onChange={handleChange} required
                        />
                    </div>

                    <div className="form-row">
                        <div className="input-group">
                            <label className="input-label" htmlFor="classBand">Class</label>
                            <select
                                id="classBand" name="classBand" className="input-field"
                                value={formData.classBand} onChange={handleChange}
                            >
                                {CLASS_BANDS.map((c) => (
                                    <option key={c} value={c}>Class {c}</option>
                                ))}
                            </select>
                        </div>
                        <div className="input-group">
                            <label className="input-label" htmlFor="schoolCode">School Code <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                            <input
                                id="schoolCode" name="schoolCode" type="text" className="input-field"
                                placeholder="e.g. DPS001" value={formData.schoolCode}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="password">Password</label>
                        <input
                            id="password" name="password" type="password" className="input-field"
                            placeholder="Min 8 characters" value={formData.password}
                            onChange={handleChange} required minLength={8}
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="confirmPassword">Confirm Password</label>
                        <input
                            id="confirmPassword" name="confirmPassword" type="password" className="input-field"
                            placeholder="Repeat password" value={formData.confirmPassword}
                            onChange={handleChange} required
                        />
                    </div>

                    <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={isLoading}>
                        {isLoading ? 'Creating Account...' : 'Create Account'}
                    </button>
                </form>

                <div className="auth-footer">
                    Already have an account? <Link href="/login">Sign in</Link>
                </div>
            </div>

            
        </div>
    );
}
