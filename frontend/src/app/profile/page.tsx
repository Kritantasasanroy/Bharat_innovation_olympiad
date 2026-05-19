'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import { useAuthStore } from '@/store/authStore';
import { FormEvent, useEffect, useState } from 'react';

export default function ProfilePage() {
    const { user, updateProfile } = useAuthStore();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [classBand, setClassBand] = useState<number>(6);
    
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        if (user) {
            setFirstName(user.firstName || '');
            setLastName(user.lastName || '');
            setClassBand(user.classBand || 6);
        }
    }, [user]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage(null);

        try {
            await updateProfile({ firstName, lastName, classBand });
            setMessage({ text: 'Profile updated successfully!', type: 'success' });
            
            // Clear message after 3 seconds
            setTimeout(() => {
                setMessage(null);
            }, 3000);
        } catch (error: any) {
            setMessage({ 
                text: error.response?.data?.message || 'Failed to update profile. Please try again.', 
                type: 'error' 
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (!user) return null;

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container page-content animate-fade-in">
                <div className="page-header">
                    <h1>My Profile</h1>
                    <p className="text-secondary">View and update your personal details.</p>
                </div>

                <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
                    {message && (
                        <div style={{ 
                            padding: '1rem', 
                            marginBottom: '1.5rem', 
                            borderRadius: '8px', 
                            backgroundColor: message.type === 'success' ? 'var(--success-500)' : 'var(--danger-500)',
                            color: 'white',
                            textAlign: 'center',
                            fontWeight: '500'
                        }}>
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        
                        <div className="input-group">
                            <label className="input-label">Email Address</label>
                            <input 
                                type="email" 
                                className="input-field" 
                                value={user.email} 
                                disabled 
                                style={{ opacity: 0.7, cursor: 'not-allowed' }}
                            />
                            <small className="text-muted" style={{ marginTop: '0.25rem', display: 'block' }}>Email address cannot be changed.</small>
                        </div>

                        <div className="input-group">
                            <label className="input-label">School</label>
                            <input 
                                type="text" 
                                className="input-field" 
                                value={user.school?.name || 'No school assigned'} 
                                disabled 
                                style={{ opacity: 0.7, cursor: 'not-allowed' }}
                            />
                            <small className="text-muted" style={{ marginTop: '0.25rem', display: 'block' }}>School assignment cannot be changed.</small>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="input-group">
                                <label className="input-label">First Name</label>
                                <input 
                                    type="text" 
                                    className="input-field" 
                                    value={firstName} 
                                    onChange={(e) => setFirstName(e.target.value)}
                                    required 
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Last Name</label>
                                <input 
                                    type="text" 
                                    className="input-field" 
                                    value={lastName} 
                                    onChange={(e) => setLastName(e.target.value)}
                                    required 
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label className="input-label">Class</label>
                            <select 
                                className="input-field" 
                                value={classBand} 
                                onChange={(e) => setClassBand(parseInt(e.target.value))}
                                required
                            >
                                <option value={6}>Class 6</option>
                                <option value={7}>Class 7</option>
                                <option value={8}>Class 8</option>
                                <option value={9}>Class 9</option>
                                <option value={10}>Class 10</option>
                                <option value={11}>Class 11</option>
                                <option value={12}>Class 12</option>
                            </select>
                        </div>

                        <button 
                            type="submit" 
                            className="btn btn-primary" 
                            style={{ marginTop: '1rem' }}
                            disabled={isLoading || (firstName === user.firstName && lastName === user.lastName && classBand === user.classBand)}
                        >
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </form>
                </div>
            </main>
        </AuthGuard>
    );
}
