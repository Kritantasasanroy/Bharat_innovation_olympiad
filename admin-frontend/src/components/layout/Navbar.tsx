'use client';

import { useAuth } from '@/hooks/useAuth';
import { APP_NAME, COMPANY_NAME } from '@/lib/constants';
import { useThemeStore } from '@/store/themeStore';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

interface NavLeaf {
    label: string;
    href: string;
}

interface NavGroup {
    label: string;
    items: NavLeaf[];
}

/**
 * The admin surface has outgrown a flat nav bar (11 destinations), so related
 * destinations are grouped behind five top-level menus. Adding a new admin page
 * means adding one entry here, not squeezing another link onto the row.
 */
const NAV: (NavLeaf | NavGroup)[] = [
    { label: 'Dashboard', href: '/dashboard' },
    {
        label: 'Exams',
        items: [
            { label: 'Exams', href: '/exams' },
            { label: 'Question bank', href: '/questions' },
            { label: 'Media gallery', href: '/media' },
            { label: 'Slots & windows', href: '/slots' },
        ],
    },
    {
        label: 'Results',
        items: [
            { label: 'Results & certificates', href: '/results' },
            { label: 'Analytics', href: '/analytics' },
        ],
    },
    {
        label: 'People',
        items: [
            { label: 'Manage people', href: '/students' },
            // Editing a school, and assigning it to a partner.
            { label: 'Schools', href: '/schools' },
            { label: 'Send email', href: '/mail' },
            { label: 'Deletion archive', href: '/archive' },
        ],
    },
    {
        label: 'Operations',
        items: [
            { label: 'Live proctor', href: '/proctor' },
            { label: 'Student grievances', href: '/grievances' },
            { label: 'Support tickets', href: '/support' },
            { label: 'Refunds', href: '/refunds' },
        ],
    },
    {
        label: 'Commerce',
        items: [
            { label: 'Payments', href: '/payments' },
            // Partners and schools share one review queue.
            { label: 'Access requests', href: '/access' },
        ],
    },
];

const isGroup = (entry: NavLeaf | NavGroup): entry is NavGroup => 'items' in entry;

/** A route is active when it matches exactly, or is an ancestor of the current path. */
function matches(pathname: string | null, href: string): boolean {
    if (!pathname) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Navbar() {
    const { user, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const { theme, toggleTheme } = useThemeStore();

    const [openGroup, setOpenGroup] = useState<string | null>(null);
    const navRef = useRef<HTMLDivElement>(null);

    const close = useCallback(() => setOpenGroup(null), []);

    // Close on outside click and on Escape.
    useEffect(() => {
        if (!openGroup) return;
        const onPointerDown = (event: MouseEvent) => {
            if (navRef.current && !navRef.current.contains(event.target as Node)) close();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [openGroup, close]);

    // Any navigation closes the menu.
    useEffect(() => {
        close();
    }, [pathname, close]);

    const go = (href: string) => {
        close();
        router.push(href);
    };

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

    return (
        <nav className="navbar">
            <div className="navbar-inner">
                <div className="navbar-brand" onClick={() => router.push('/')}>
                    <img src="/bio-logo.png" alt={APP_NAME} className="brand-logo" />
                    <div className="brand-text-group">
                        <span className="brand-text">{APP_NAME}</span>
                        <span className="brand-byline">
                            <span className="brand-byline-by">by</span>
                            <img src="/lemon-ideas-logo.png" alt={COMPANY_NAME} className="brand-byline-logo" />
                        </span>
                    </div>
                </div>

                {isAdmin && (
                    <div className="navbar-links" ref={navRef}>
                        {NAV.map((entry) => {
                            if (!isGroup(entry)) {
                                return (
                                    <button
                                        key={entry.href}
                                        type="button"
                                        className={`nav-link ${matches(pathname, entry.href) ? 'active' : ''}`}
                                        onClick={() => go(entry.href)}
                                    >
                                        {entry.label}
                                    </button>
                                );
                            }

                            const groupActive = entry.items.some((item) => matches(pathname, item.href));
                            const open = openGroup === entry.label;

                            return (
                                <div className="nav-group" key={entry.label}>
                                    <button
                                        type="button"
                                        className={`nav-link nav-link--group ${groupActive ? 'active' : ''}`}
                                        aria-haspopup="true"
                                        aria-expanded={open}
                                        onClick={() => setOpenGroup(open ? null : entry.label)}
                                    >
                                        {entry.label}
                                        <svg
                                            className={`nav-caret ${open ? 'nav-caret--open' : ''}`}
                                            width="10"
                                            height="10"
                                            viewBox="0 0 10 10"
                                            aria-hidden="true"
                                        >
                                            <path
                                                d="M1 3.5L5 7.5L9 3.5"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="1.6"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                    </button>

                                    {open && (
                                        <div className="nav-menu" role="menu">
                                            {entry.items.map((item) => (
                                                <button
                                                    key={item.href}
                                                    type="button"
                                                    role="menuitem"
                                                    className={`nav-menu__item ${matches(pathname, item.href) ? 'active' : ''}`}
                                                    onClick={() => go(item.href)}
                                                >
                                                    {item.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="navbar-user">
                    <button
                        className="theme-toggle"
                        onClick={toggleTheme}
                        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                    >
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
