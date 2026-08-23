"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
	{ href: "/dashboard", label: "Overview" },
	{ href: "/dashboard/announcements", label: "Announcements" },
	{ href: "/dashboard/schools", label: "Schools" },
	// Every student across the partner's schools, and their released results.
	{ href: "/dashboard/students", label: "Students" },
	{ href: "/dashboard/results", label: "Results" },
	{ href: "/dashboard/campaigns", label: "Campaigns & links" },
	{ href: "/dashboard/funnel", label: "Funnel" },
	{ href: "/dashboard/payouts", label: "Payouts & statements" },
	{ href: "/dashboard/profile", label: "Profile" },
	{ href: "/dashboard/support", label: "Support" },
] as const;

export function DashboardNav() {
	const pathname = usePathname();
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
				<span className="dashboard-nav__brand-sub">Partner Portal</span>
			</Link>
			{LINKS.map((link) => {
				const isActive =
					link.href === "/dashboard" ? pathname === link.href : pathname?.startsWith(link.href);
				return (
					<Link
						key={link.href}
						href={link.href}
						className={
							isActive ? "dashboard-nav__link dashboard-nav__link--active" : "dashboard-nav__link"
						}
					>
						{link.label}
					</Link>
				);
			})}
		</nav>
	);
}
