"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const ICONS: Record<string, ReactNode> = {
	"/dashboard": (
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
			<rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
			<rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
			<rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
		</svg>
	),
	"/dashboard/campaigns": (
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M13 3l7 7-9 9-7 2 2-7Z"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinejoin="round"
			/>
		</svg>
	),
	"/dashboard/funnel": (
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M3 17l6-6 4 4 8-8"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M15 7h6v6"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	),
	"/dashboard/schools": (
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"
				stroke="currentColor"
				strokeWidth="1.8"
			/>
		</svg>
	),
	"/dashboard/students": (
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
			<path
				d="M3.5 20c0-3.5 2.7-6 5.5-6s5.5 2.5 5.5 6"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
			/>
			<circle cx="17.5" cy="8.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
			<path
				d="M15.5 14c2.2.3 4 2.2 4.5 5"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
			/>
		</svg>
	),
	"/dashboard/results": (
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"
				stroke="currentColor"
				strokeWidth="1.8"
			/>
			<path d="M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
		</svg>
	),
	"/dashboard/announcements": (
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M4 10v4a1 1 0 0 0 1 1h2l7 4V5L7 9H5a1 1 0 0 0-1 1Z"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinejoin="round"
			/>
			<path d="M18 9c1 1 1 5 0 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
		</svg>
	),
	"/dashboard/payouts": (
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
			<path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
		</svg>
	),
	"/dashboard/profile": (
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.8" />
			<path
				d="M4.5 20c0-4 3.4-7 7.5-7s7.5 3 7.5 7"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
			/>
		</svg>
	),
	"/dashboard/support": (
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
			<path
				d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1.8-1.1 1.6"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
			/>
			<circle cx="12" cy="16.3" r="0.9" fill="currentColor" />
		</svg>
	),
};

const GROUPS = [
	{ label: "Overview", links: [{ href: "/dashboard", label: "Dashboard" }] },
	{
		label: "Grow",
		links: [
			{ href: "/dashboard/campaigns", label: "Campaigns & links" },
			{ href: "/dashboard/funnel", label: "Funnel" },
		],
	},
	{
		label: "Manage",
		links: [
			{ href: "/dashboard/schools", label: "Schools" },
			{ href: "/dashboard/students", label: "Students" },
			{ href: "/dashboard/results", label: "Results" },
			{ href: "/dashboard/announcements", label: "Announcements" },
		],
	},
	{
		label: "Account",
		links: [
			{ href: "/dashboard/payouts", label: "Payouts & statements" },
			{ href: "/dashboard/profile", label: "Profile" },
			{ href: "/dashboard/support", label: "Support" },
		],
	},
] as const;

export function DashboardNav() {
	const pathname = usePathname();
	return (
		<nav className="dashboard-nav">
			<Link href="/dashboard" className="dashboard-nav__brand">
				<div
					style={{
						background: "#ffffff",
						borderRadius: "10px",
						padding: "0.5rem 0.75rem",
						display: "inline-flex",
						marginBottom: "0.75rem",
						width: "fit-content",
					}}
				>
					<Image
						src="/bio-logo.png"
						alt="Bharat Innovation Olympiad"
						width={140}
						height={34}
						style={{ height: "28px", width: "auto", objectFit: "contain", display: "block" }}
					/>
				</div>
				<span className="dashboard-nav__brand-text">Bharat Innovation Olympiad</span>
				<span className="dashboard-nav__brand-sub">Partner Portal</span>
			</Link>
			{GROUPS.map((group) => (
				<div key={group.label} style={{ marginBottom: "0.25rem" }}>
					<div
						style={{
							fontSize: "0.68rem",
							fontWeight: 700,
							color: "var(--navy-300)",
							textTransform: "uppercase",
							letterSpacing: "0.06em",
							padding: "0.75rem 1rem 0.35rem",
						}}
					>
						{group.label}
					</div>
					{group.links.map((link) => {
						const isActive =
							link.href === "/dashboard" ? pathname === link.href : pathname?.startsWith(link.href);
						return (
							<Link
								key={link.href}
								href={link.href}
								className={
									isActive
										? "dashboard-nav__link dashboard-nav__link--active"
										: "dashboard-nav__link"
								}
								style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}
							>
								{ICONS[link.href]}
								{link.label}
							</Link>
						);
					})}
				</div>
			))}
		</nav>
	);
}
