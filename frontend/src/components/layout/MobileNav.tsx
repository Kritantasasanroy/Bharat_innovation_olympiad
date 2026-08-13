'use client';

import { useAuth } from '@/hooks/useAuth';
import { APP_NAME } from '@/lib/constants';
import ThemeToggle from '@/components/ThemeToggle';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
    LayoutDashboard, GraduationCap, FileText, BarChart3, Award,
    MoreHorizontal, LifeBuoy, UserRound, LogOut, X,
} from 'lucide-react';

const ROLE_LABEL: Partial<Record<string, string>> = {
    STUDENT: 'Ward',
};

/** The five items that fit a thumb-width bottom bar without crowding it. */
const TAB_ITEMS = [
    { href: '/dashboard', label: 'Home', Icon: LayoutDashboard, limon: undefined as string | undefined },
    { href: '/training', label: 'Training', Icon: GraduationCap, limon: 'nav-training' },
    { href: '/exams', label: 'Exams', Icon: FileText, limon: 'nav-exams' },
    { href: '/results', label: 'Results', Icon: BarChart3, limon: 'nav-results' },
    { href: '/certificates', label: 'Certificates', Icon: Award, limon: 'nav-certificates' },
];

/**
 * Mobile navigation for the student portal: a slim top bar plus a fixed
 * bottom tab bar, replacing the desktop `Navbar`'s single row of six links
 * and a name/role/logout cluster (unusable below ~900px).
 *
 * Support, Profile, the theme toggle and Logout move into a "More" sheet off
 * the top bar rather than a sixth tab, keeping the bar to five thumb-sized
 * targets. `data-limon` is kept on every tab that has a Limon tour step so
 * the dashboard tour still finds its anchors; the Support step simply skips
 * itself when the sheet is closed, same as any other missing-target step
 * (see `lib/limon/tours.ts`).
 */
export default function MobileNav() {
    const { user, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [moreOpen, setMoreOpen] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!moreOpen) return;
        const onClick = (e: MouseEvent) => {
            if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
                setMoreOpen(false);
            }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [moreOpen]);

    // Close the sheet on navigation so it never lingers over the next page.
    useEffect(() => {
        setMoreOpen(false);
    }, [pathname]);

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
    const showTabbar = !isAdmin && !!user;

    // The tab bar is `position: fixed`, so it takes no space in the document
    // flow — without this, it sits on top of whatever the page renders last.
    useEffect(() => {
        document.body.classList.toggle('has-mobile-tabbar', showTabbar);
        return () => document.body.classList.remove('has-mobile-tabbar');
    }, [showTabbar]);

    return (
        <>
            <nav className="mob-topbar">
                <div className="mob-topbar__brand" onClick={() => router.push(isAdmin ? '/admin/dashboard' : '/dashboard')}>
                    <img src="/bio-logo.png" alt={APP_NAME} className="mob-topbar__logo" />
                    <span className="mob-topbar__name">Bharat Innovation Olympiad</span>
                </div>
                {user && (
                    <button
                        type="button"
                        className="mob-topbar__avatar"
                        aria-label="Account menu"
                        aria-expanded={moreOpen}
                        onClick={() => setMoreOpen((v) => !v)}
                    >
                        {user.firstName[0]}
                        {user.lastName[0]}
                    </button>
                )}
            </nav>

            {moreOpen && (
                <div className="mob-sheet-backdrop">
                    <div className="mob-sheet glass-card" ref={sheetRef}>
                        <div className="mob-sheet__header">
                            {user && (
                                <div className="mob-sheet__user">
                                    <div className="mob-topbar__avatar mob-sheet__avatar">
                                        {user.firstName[0]}
                                        {user.lastName[0]}
                                    </div>
                                    <div>
                                        <div className="mob-sheet__username">{user.firstName} {user.lastName}</div>
                                        <div className="mob-sheet__userrole">{ROLE_LABEL[user.role] ?? user.role}</div>
                                    </div>
                                </div>
                            )}
                            <button type="button" className="mob-sheet__close" aria-label="Close menu" onClick={() => setMoreOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="mob-sheet__links">
                            {!isAdmin && (
                                <a
                                    data-limon="nav-support"
                                    className="mob-sheet__link"
                                    onClick={() => router.push('/support')}
                                >
                                    <LifeBuoy size={18} /> Support
                                </a>
                            )}
                            <a className="mob-sheet__link" onClick={() => router.push(isAdmin ? '/admin/dashboard' : '/profile')}>
                                <UserRound size={18} /> Profile
                            </a>
                            <div className="mob-sheet__link mob-sheet__link--static">
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>Theme</span>
                                <ThemeToggle />
                            </div>
                            <a className="mob-sheet__link mob-sheet__link--danger" onClick={handleLogout}>
                                <LogOut size={18} /> Logout
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {!isAdmin && user && (
                <nav className="mob-tabbar" aria-label="Primary">
                    {TAB_ITEMS.map(({ href, label, Icon, limon }) => {
                        const active = href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(href);
                        return (
                            <a
                                key={href}
                                data-limon={limon}
                                className={`mob-tabbar__item ${active ? 'active' : ''}`}
                                onClick={() => router.push(href)}
                            >
                                <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                                <span>{label}</span>
                            </a>
                        );
                    })}
                    <a
                        className={`mob-tabbar__item ${moreOpen ? 'active' : ''}`}
                        onClick={() => setMoreOpen((v) => !v)}
                    >
                        <MoreHorizontal size={21} strokeWidth={moreOpen ? 2.4 : 2} />
                        <span>More</span>
                    </a>
                </nav>
            )}
        </>
    );
}
