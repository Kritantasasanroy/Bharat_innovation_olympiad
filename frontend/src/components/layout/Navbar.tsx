'use client';

import { useAuth } from '@/hooks/useAuth';
import { APP_NAME, COMPANY_NAME } from '@/lib/constants';
import { usePathname, useRouter } from 'next/navigation';

export default function Navbar() {
    const { user, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    return (
        <nav className="navbar">
            <div className="navbar-inner">
                <div className="navbar-brand" onClick={() => router.push('/')}>
                    <div className="brand-icon">🍋</div>
                    <div className="brand-text-group">
                        <span className="brand-text">{APP_NAME}</span>
                        <span className="brand-sub">by {COMPANY_NAME}</span>
                    </div>
                </div>

                <div className="navbar-links">
                    {user?.role === 'STUDENT' && (
                        <>
                            <a
                                className={`nav-link ${pathname === '/dashboard' ? 'active' : ''}`}
                                onClick={() => router.push('/dashboard')}
                            >
                                Dashboard
                            </a>
                            <a
                                className={`nav-link ${pathname?.startsWith('/exams') ? 'active' : ''}`}
                                onClick={() => router.push('/exams')}
                            >
                                Exams
                            </a>
                            <a
                                className={`nav-link ${pathname === '/results' ? 'active' : ''}`}
                                onClick={() => router.push('/results')}
                            >
                                Results
                            </a>
                        </>
                    )}
                    {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
                        <>
                            <a
                                className={`nav-link ${pathname === '/admin/dashboard' ? 'active' : ''}`}
                                onClick={() => router.push('/admin/dashboard')}
                            >
                                Dashboard
                            </a>
                            <a
                                className={`nav-link ${pathname?.startsWith('/admin/questions') ? 'active' : ''}`}
                                onClick={() => router.push('/admin/questions')}
                            >
                                Questions
                            </a>
                            <a
                                className={`nav-link ${pathname?.startsWith('/admin/exams') ? 'active' : ''}`}
                                onClick={() => router.push('/admin/exams')}
                            >
                                Exams
                            </a>
                            <a
                                className={`nav-link ${pathname === '/admin/analytics' ? 'active' : ''}`}
                                onClick={() => router.push('/admin/analytics')}
                            >
                                Analytics
                            </a>
                        </>
                    )}
                </div>

                <div className="navbar-user">
                    {user && (
                        <>
                            <div className="user-avatar">
                                {user.firstName[0]}
                                {user.lastName[0]}
                            </div>
                            <div className="user-info">
                                <span className="user-name">
                                    {user.firstName} {user.lastName}
                                </span>
                                <span className="user-role">{user.role}</span>
                            </div>
                            <button className="btn btn-sm btn-secondary" onClick={handleLogout}>
                                Logout
                            </button>
                        </>
                    )}
                </div>
            </div>

            <style jsx>{`
        .navbar {
          position: sticky;
          top: 0;
          z-index: 50;
          background: var(--glass-bg);
          backdrop-filter: blur(var(--glass-blur));
          -webkit-backdrop-filter: blur(var(--glass-blur));
          border-bottom: 1px solid var(--border-subtle);
        }
        .navbar-inner {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-6);
          gap: var(--space-6);
        }
        .navbar-brand {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          cursor: pointer;
        }
        .brand-icon {
          font-size: 1.5rem;
        }
        .brand-text-group {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
        }
        .brand-text {
          font-weight: 800;
          font-size: 1.05rem;
          background: var(--gradient-brand);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .brand-sub {
          font-size: 0.65rem;
          font-weight: 500;
          color: var(--text-muted);
          letter-spacing: 0.05em;
        }
        .navbar-links {
          display: flex;
          gap: var(--space-1);
        }
        .nav-link {
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md);
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .nav-link:hover {
          color: var(--text-primary);
          background: var(--bg-elevated);
        }
        .nav-link.active {
          color: var(--primary-400);
          background: rgba(251, 197, 11, 0.1);
        }
        .navbar-user {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .user-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--gradient-brand);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          font-weight: 700;
          color: white;
        }
        .user-info {
          display: flex;
          flex-direction: column;
        }
        .user-name {
          font-size: 0.85rem;
          font-weight: 600;
        }
        .user-role {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-transform: capitalize;
        }
      `}</style>
        </nav>
    );
}
