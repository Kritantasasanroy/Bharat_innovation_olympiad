'use client';

import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/useIsMobile';
import { APP_NAME } from '@/lib/constants';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import XpPill from '@/components/layout/XpPill';
import MobileNav from '@/components/layout/MobileNav';

/**
 * Display label for the badge next to a signed-in user's name.
 *
 * `user.role` is the `Role` enum value ('STUDENT', 'ADMIN', …) and must stay
 * that way — it is what every `allowedRoles` check compares against. This is
 * only the on-screen word for it, so the badge can read "Participant" without
 * renaming the role itself.
 */
const ROLE_LABEL: Partial<Record<string, string>> = {
  STUDENT: 'Participant',
};

const STUDENT_LINKS = [
  { href: '/dashboard', label: 'Dashboard', limon: undefined as string | undefined, exact: true },
  { href: '/training', label: 'Training', limon: 'nav-training' },
  { href: '/exams', label: 'Exams', limon: 'nav-exams' },
  { href: '/results', label: 'Results', limon: 'nav-results' },
  { href: '/certificates', label: 'Certificates', limon: 'nav-certificates' },
  { href: '/support', label: 'Support', limon: 'nav-support' },
];

const ADMIN_LINKS = [
  { href: '/admin/dashboard', label: 'Dashboard', exact: true },
  { href: '/admin/questions', label: 'Questions' },
  { href: '/admin/exams', label: 'Exams' },
  { href: '/admin/analytics', label: 'Analytics', exact: true },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  useEffect(() => setMenuOpen(false), [pathname]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  // Separate mobile screen: a top bar + bottom tab bar instead of this row of
  // six links, which has no room to exist below ~900px. Desktop render is
  // untouched below.
  if (isMobile) return <MobileNav />;

  const isStudent = user?.role === 'STUDENT';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const links = isStudent ? STUDENT_LINKS : isAdmin ? ADMIN_LINKS : [];
  const isActive = (l: { href: string; exact?: boolean }) =>
    l.exact ? pathname === l.href : pathname?.startsWith(l.href);

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="navbar-brand" style={{ cursor: 'default' }}>
          <img src="/bio-logo.png" alt={APP_NAME} className="brand-logo" />
          <span className="brand-text">{APP_NAME}</span>
        </div>

        <div className="navbar-links">
          {links.map((l) => (
            <a
              key={l.href}
              data-limon={'limon' in l ? l.limon : undefined}
              className={`nav-link ${isActive(l) ? 'active' : ''}`}
              onClick={() => router.push(l.href)}
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="navbar-user">
          {isStudent && <XpPill />}
          <ThemeToggle />
          {user && (
            <div className="navbar-account" ref={menuRef}>
              <button
                type="button"
                className="navbar-account__trigger"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="user-avatar">
                  {user.firstName[0]}
                  {user.lastName[0]}
                </span>
                <span className="navbar-account__name">
                  <span className="user-name">{user.firstName} {user.lastName}</span>
                  <span className="user-role">{ROLE_LABEL[user.role] ?? user.role}</span>
                </span>
                <span className="navbar-account__chev" aria-hidden="true">▾</span>
              </button>

              {menuOpen && (
                <div className="navbar-menu glass-card" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="navbar-menu__item"
                    onClick={() => router.push(isAdmin ? '/admin/dashboard' : '/profile')}
                  >
                    <UserRound size={16} /> Profile
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="navbar-menu__item navbar-menu__item--danger"
                    onClick={handleLogout}
                  >
                    <LogOut size={16} /> Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
