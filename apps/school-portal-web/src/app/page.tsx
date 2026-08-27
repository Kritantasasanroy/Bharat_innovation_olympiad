"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ThemeToggle } from "../components/theme-toggle";
import { useAuth } from "../lib/auth-context";

const TRUST_POINTS = ["Nationwide reach", "Every state & UT", "One shared dashboard"];

const FEATURES = [
	{
		title: "Bulk roster upload",
		body: "Add your whole class list with one CSV — no one-by-one entry.",
		icon: (
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"
					stroke="var(--accent-500)"
					strokeWidth="1.8"
				/>
				<path
					d="M8 12h8M8 16h5"
					stroke="var(--accent-500)"
					strokeWidth="1.8"
					strokeLinecap="round"
				/>
			</svg>
		),
	},
	{
		title: "Results, class by class",
		body: "See how your school did against the national cohort, exportable to Excel.",
		icon: (
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M12 3v6m0 0-4-4m4 4 4-4"
					stroke="var(--terracotta-500)"
					strokeWidth="1.8"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M4 14h16v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"
					stroke="var(--terracotta-500)"
					strokeWidth="1.8"
				/>
			</svg>
		),
	},
	{
		title: "School support, when you need it",
		body: "Raise tickets for registration, payments, results, or technical help — all from your dashboard.",
		icon: (
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z"
					stroke="var(--success-400)"
					strokeWidth="1.8"
				/>
				<path
					d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"
					stroke="var(--success-400)"
					strokeWidth="1.8"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		),
	},
];

export default function HomePage() {
	const { token } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (token) router.replace("/dashboard");
	}, [token, router]);

	return (
		<main style={{ position: "relative", zIndex: 1 }}>
			<div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 50 }}>
				<ThemeToggle />
			</div>

			{/* NAV */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "1.5rem 2.5rem",
					borderBottom: "1px solid var(--border-subtle)",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
					<Image
						src="/bio-logo.png"
						alt="Bharat Innovation Olympiad"
						width={140}
						height={34}
						style={{ height: "34px", width: "auto", objectFit: "contain" }}
					/>
					<span
						style={{
							fontSize: "0.68rem",
							fontWeight: 700,
							color: "var(--text-muted)",
							textTransform: "uppercase",
							letterSpacing: "0.06em",
						}}
					>
						School Portal
					</span>
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
					<Link href="/login" className="button button--secondary">
						Log in
					</Link>
					<Link href="/activate" className="button">
						Activate your school
					</Link>
				</div>
			</div>

			{/* HERO */}
			<div
				className="hero-grid"
				style={{
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: "2.5rem",
					alignItems: "center",
					maxWidth: 1180,
					margin: "0 auto",
					padding: "4.5rem 2.5rem",
				}}
			>
				<div>
					<div className="pill pill--active" style={{ marginBottom: "1.25rem" }}>
						Built for schools across India
					</div>
					<h1 style={{ fontSize: "2.6rem", lineHeight: 1.14, marginBottom: "1.1rem" }}>
						Your school&apos;s Olympiad journey,{" "}
						<span className="brand-gradient">all in one place</span>
					</h1>
					<p
						style={{
							fontSize: "1.02rem",
							color: "var(--text-secondary)",
							maxWidth: 460,
							marginBottom: "1.75rem",
						}}
					>
						Register students, track exam participation, and view results — without chasing
						spreadsheets or email threads. Built for coordinators, not IT departments.
					</p>
					<div
						className="hero__actions"
						style={{ justifyContent: "flex-start", marginBottom: "2.5rem" }}
					>
						<Link href="/activate" className="button">
							Activate my school
						</Link>
						<Link href="/login" className="button button--secondary">
							Coordinator sign in
						</Link>
					</div>
					<div
						style={{
							display: "flex",
							gap: "1.75rem",
							flexWrap: "wrap",
							paddingTop: "1.5rem",
							borderTop: "1px solid var(--border-subtle)",
						}}
					>
						{TRUST_POINTS.map((point) => (
							<div key={point} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M20 6 9 17l-5-5"
										stroke="var(--accent-500)"
										strokeWidth="2.4"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
								<span
									style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}
								>
									{point}
								</span>
							</div>
						))}
					</div>
				</div>

				{/* Illustrated hero moment: an achievement medal on a stack of books */}
				<div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
					<svg
						width="380"
						height="360"
						viewBox="0 0 440 420"
						fill="none"
						aria-hidden="true"
						style={{ maxWidth: "100%", height: "auto" }}
					>
						<defs>
							<linearGradient id="schoolMedalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
								<stop offset="0%" stopColor="#ffd60a" />
								<stop offset="100%" stopColor="#7dc832" />
							</linearGradient>
						</defs>
						<circle cx="220" cy="195" r="185" fill="rgba(255,214,10,0.07)" />
						<ellipse cx="220" cy="378" rx="150" ry="16" fill="rgba(197,111,74,0.10)" />
						<rect x="118" y="298" width="204" height="28" rx="7" fill="#c9704a" />
						<rect x="132" y="274" width="176" height="28" rx="7" fill="#eab06a" />
						<rect
							x="146"
							y="250"
							width="148"
							height="28"
							rx="7"
							fill="#ffffff"
							stroke="#ecdfc7"
							strokeWidth="2"
						/>
						<path d="M196 258 L172 328 L206 310 Z" fill="#a8562f" />
						<path d="M244 258 L268 328 L234 310 Z" fill="#8a4520" />
						<circle
							cx="220"
							cy="176"
							r="74"
							fill="url(#schoolMedalGrad)"
							stroke="var(--bg-primary)"
							strokeWidth="7"
						/>
						<circle
							cx="220"
							cy="176"
							r="54"
							fill="none"
							stroke="rgba(255,255,255,0.55)"
							strokeWidth="2"
							strokeDasharray="3 7"
						/>
						<path
							d="M220 144l9 19 21 3-15 15 4 21-19-10-19 10 4-21-15-15 21-3Z"
							fill="#fff"
							opacity="0.92"
						/>
						<path d="M108 190 Q76 164 92 126 Q124 148 116 190Z" fill="#7dc832" opacity="0.6" />
						<path d="M332 190 Q364 164 348 126 Q316 148 324 190Z" fill="#ffd60a" opacity="0.55" />
						<circle cx="86" cy="92" r="5" fill="#7dc832" opacity="0.5" />
						<circle cx="362" cy="108" r="4" fill="#ffd60a" opacity="0.6" />
						<circle cx="352" cy="252" r="3.5" fill="#c9704a" opacity="0.5" />
					</svg>
				</div>
			</div>

			{/* FEATURES */}
			<div
				className="grid-3"
				style={{ maxWidth: 1180, margin: "0 auto", padding: "0 2.5rem 4.5rem" }}
			>
				{FEATURES.map((feature) => (
					<div key={feature.title} className="card" style={{ marginBottom: 0 }}>
						<div
							style={{
								width: 40,
								height: 40,
								borderRadius: 10,
								background: "var(--bg-elevated)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								marginBottom: "0.9rem",
							}}
						>
							{feature.icon}
						</div>
						<h3 style={{ marginBottom: "0.4rem" }}>{feature.title}</h3>
						<p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
							{feature.body}
						</p>
					</div>
				))}
			</div>
		</main>
	);
}
