'use client';

import { useAuth } from '@/hooks/useAuth';
import { APP_NAME, TAGLINE } from '@/lib/constants';
import { usePathname, useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';

/**
 * Display label for the badge next to a signed-in user's name.
 *
 * `user.role` is the `Role` enum value ('STUDENT', 'ADMIN', …) and must stay
 * that way — it is what every `allowedRoles` check compares against. This is
 * only the on-screen word for it, so the badge can read "Ward" without
 * renaming the role itself.
 */
const ROLE_LABEL: Partial<Record<string, string>> = {
  STUDENT: 'Ward',
};

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
        <div className="navbar-brand" style={{ cursor: 'default' }}>
          <img src="/bio-logo.png" alt={APP_NAME} className="brand-logo" />
          <div className="brand-text-group">
            <span className="brand-text">{APP_NAME}</span>
            <span className="brand-tagline-nav">{TAGLINE}</span>
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
              {/* Between Dashboard and Exams: the training sessions come
                  before the paper in a student's actual year, and the tab order
                  should read the way the season runs. */}
              <a
                data-limon="nav-training"
                className={`nav-link ${pathname?.startsWith('/training') ? 'active' : ''}`}
                onClick={() => router.push('/training')}
              >
                Training
              </a>
              <a
                data-limon="nav-exams"
                className={`nav-link ${pathname?.startsWith('/exams') ? 'active' : ''}`}
                onClick={() => router.push('/exams')}
              >
                Exams
              </a>
              <a
                data-limon="nav-results"
                className={`nav-link ${pathname === '/results' ? 'active' : ''}`}
                onClick={() => router.push('/results')}
              >
                Results
              </a>
              <a
                data-limon="nav-certificates"
                className={`nav-link ${pathname?.startsWith('/certificates') ? 'active' : ''}`}
                onClick={() => router.push('/certificates')}
              >
                Certificates
              </a>
              <a
                data-limon="nav-support"
                className={`nav-link ${pathname?.startsWith('/support') ? 'active' : ''}`}
                onClick={() => router.push('/support')}
              >
                Support
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
          <ThemeToggle />
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
                <span className="user-role">{ROLE_LABEL[user.role] ?? user.role}</span>
              </div>
              <button className="btn btn-sm btn-secondary" onClick={() => router.push('/profile')} style={{ marginRight: '0.5rem' }}>
                Profile
              </button>
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
