"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
	{ href: "/dashboard", label: "Overview" },
	{ href: "/dashboard/announcements", label: "Announcements" },
	{ href: "/dashboard/profile", label: "Profile & roles" },
	{ href: "/dashboard/students", label: "Students" },
	{ href: "/dashboard/slots", label: "Slots & windows" },
	{ href: "/dashboard/monitoring", label: "Live monitoring" },
	{ href: "/dashboard/results", label: "Results & analytics" },
	{ href: "/dashboard/billing", label: "Sponsorship" },
	{ href: "/dashboard/support", label: "Support" },
] as const;

export function SchoolNav() {
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
				<span className="dashboard-nav__brand-sub">School Portal</span>
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
