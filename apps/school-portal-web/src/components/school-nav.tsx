"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { type Payout, portalApi } from "../lib/api-client";
import { useAuth } from "../lib/auth-context";

const ICONS: Record<string, ReactNode> = {
	"/dashboard": (
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
			<rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
			<rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
			<rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
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
	"/dashboard/monitoring": (
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
			<circle cx="12" cy="12" r="2.6" fill="currentColor" />
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
	"/dashboard/payouts": (
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
			<path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
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

export function SchoolNav() {
	const pathname = usePathname();
	const { token } = useAuth();
	const [payouts, setPayouts] = useState<Payout[] | null>(null);

	useEffect(() => {
		if (!token) return;
		portalApi
			.payouts(token)
			.then(setPayouts)
			.catch(() => setPayouts(null));
	}, [token]);

	const hasPayouts = (payouts?.length ?? 0) > 0;

	const groups = [
		{
			label: "Overview",
			links: [{ href: "/dashboard", label: "Dashboard" }],
		},
		{
			label: "Manage",
			links: [
				{ href: "/dashboard/students", label: "Students" },
				{ href: "/dashboard/monitoring", label: "Live monitoring" },
				{ href: "/dashboard/results", label: "Results & analytics" },
				{ href: "/dashboard/announcements", label: "Announcements" },
			],
		},
		{
			label: "Account",
			links: [
				{ href: "/dashboard/profile", label: "Profile & roles" },
				...(hasPayouts ? [{ href: "/dashboard/payouts", label: "Payouts & rewards" }] : []),
				{ href: "/dashboard/support", label: "Support" },
			],
		},
	];

	return (
		<nav className="dashboard-nav">
			<Link href="/dashboard" className="dashboard-nav__brand">
				<Image
					src="/bio-logo.png"
					alt="Bharat Innovation Olympiad"
					width={160}
					height={40}
					style={{
						height: "40px",
						width: "auto",
						objectFit: "contain",
						display: "block",
						marginBottom: "0.75rem",
					}}
				/>
				<span className="dashboard-nav__brand-text">Bharat Innovation Olympiad</span>
				<span className="dashboard-nav__brand-sub">School Portal</span>
			</Link>
			{groups.map((group) => (
				<div key={group.label} style={{ marginBottom: "0.25rem" }}>
					<div
						style={{
							fontSize: "0.68rem",
							fontWeight: 700,
							color: "var(--text-muted)",
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
