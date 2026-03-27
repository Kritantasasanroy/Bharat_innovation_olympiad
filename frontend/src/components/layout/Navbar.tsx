'use client';

import { useAuth } from '@/hooks/useAuth';
import { APP_NAME, COMPANY_NAME } from '@/lib/constants';
import { useThemeStore } from '@/store/themeStore';
import { usePathname, useRouter } from 'next/navigation';

export default function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useThemeStore();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="navbar-brand" onClick={() => router.push('/')}>
          <img src="/lemon-ideas-logo.png" alt="Lemon Ideas" className="brand-logo" />
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
          <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
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

      
    </nav>
  );
}
