"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ThemeToggle } from "../components/theme-toggle";
import { useAuth } from "../lib/auth-context";

const TRUST_CARDS = [
	{
		title: "Real-time attribution",
		body: "Every referral link is tracked from click through to registration — no manual reconciliation.",
		icon: (
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M3 17l6-6 4 4 8-8"
					stroke="var(--accent-500)"
					strokeWidth="1.8"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M15 7h6v6"
					stroke="var(--accent-500)"
					strokeWidth="1.8"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		),
	},
	{
		title: "One dashboard for everything",
		body: "Campaigns, funnel, schools, students and payouts — not a spreadsheet stitched together from emails.",
		icon: (
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<rect x="3" y="3" width="8" height="8" rx="2" stroke="var(--navy-400)" strokeWidth="1.8" />
				<rect x="13" y="3" width="8" height="8" rx="2" stroke="var(--navy-400)" strokeWidth="1.8" />
				<rect x="3" y="13" width="8" height="8" rx="2" stroke="var(--navy-400)" strokeWidth="1.8" />
				<rect
					x="13"
					y="13"
					width="8"
					height="8"
					rx="2"
					stroke="var(--navy-400)"
					strokeWidth="1.8"
				/>
			</svg>
		),
	},
	{
		title: "Manage many schools",
		body: "Onboard institutions under your campaigns and track each one's own funnel and results.",
		icon: (
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<circle cx="12" cy="8" r="3.4" stroke="var(--accent-500)" strokeWidth="1.8" />
				<path
					d="M4.5 20c0-4 3.4-7 7.5-7s7.5 3 7.5 7"
					stroke="var(--accent-500)"
					strokeWidth="1.8"
					strokeLinecap="round"
				/>
			</svg>
		),
	},
];

export default function HomePage() {
	const { token, claims } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (token === undefined) return; // still hydrating from localStorage
		if (token && claims?.role === "PARTNER") router.replace("/dashboard");
	}, [token, claims, router]);

	if (token === undefined) {
		return (
			<main className="page">
				<p className="muted">Loading…</p>
			</main>
		);
	}

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
						Partner Program
					</span>
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
					<Link href="/login" className="button button--secondary">
						Partner login
					</Link>
					<Link href="/apply" className="button">
						Apply now
					</Link>
				</div>
			</div>

			{token && claims && claims.role !== "PARTNER" ? (
				<div className="notice notice--error" style={{ margin: "1.5rem 2.5rem 0" }}>
					Signed in as role &ldquo;{claims.role ?? "unknown"}&rdquo;. This portal is for Innovation
					Olympiad channel partners only (role <code>PARTNER</code>).
				</div>
			) : null}

			{/* HERO */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "1.05fr 0.95fr",
					gap: "2.5rem",
					alignItems: "center",
					maxWidth: 1180,
					margin: "0 auto",
					padding: "4.5rem 2.5rem 3.5rem",
				}}
			>
				<div>
					<div className="pill pill--active" style={{ marginBottom: "1.25rem" }}>
						Built for growth partners across India
					</div>
					<h1 style={{ fontSize: "2.6rem", lineHeight: 1.12, marginBottom: "1.1rem" }}>
						Grow your network.
						<br />
						Track everything that <span className="brand-gradient">matters</span>.
					</h1>
					<p
						style={{
							fontSize: "1.02rem",
							color: "var(--text-secondary)",
							maxWidth: 480,
							marginBottom: "1.75rem",
						}}
					>
						Refer schools and students to the Bharat Innovation Olympiad. See campaigns, funnel, the
						schools you&apos;ve onboarded, and payouts — all in one dashboard, not scattered across
						emails and spreadsheets.
					</p>
					<div className="hero__actions" style={{ justifyContent: "flex-start" }}>
						<Link href="/apply" className="button">
							Apply as a partner
						</Link>
						<Link href="/login" className="button button--secondary">
							Sign in
						</Link>
					</div>
				</div>

				{/* Stat-forward hero visual: relative funnel shape, no invented figures */}
				<div className="card" style={{ margin: 0, boxShadow: "var(--shadow-lg)" }}>
					<div className="row-between" style={{ marginBottom: "1.25rem" }}>
						<div
							style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "0.95rem" }}
						>
							Your funnel, live
						</div>
						<span className="badge badge--positive">Trending up</span>
					</div>
					<div className="stack" style={{ gap: "0.6rem", marginBottom: "1.5rem" }}>
						<div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
							<div
								style={{
									width: 76,
									fontSize: "0.78rem",
									color: "var(--text-muted)",
									fontWeight: 600,
								}}
							>
								Signups
							</div>
							<div
								style={{
									flex: 1,
									height: 14,
									borderRadius: 7,
									background: "linear-gradient(90deg,#ffd60a,#f0b800)",
									width: "100%",
								}}
							/>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
							<div
								style={{
									width: 76,
									fontSize: "0.78rem",
									color: "var(--text-muted)",
									fontWeight: 600,
								}}
							>
								Registered
							</div>
							<div
								style={{
									flex: 1,
									height: 14,
									borderRadius: 7,
									background: "var(--bg-elevated)",
									position: "relative",
								}}
							>
								<div
									style={{
										position: "absolute",
										inset: 0,
										width: "64%",
										borderRadius: 7,
										background: "linear-gradient(90deg,#9bd862,#7dc832)",
									}}
								/>
							</div>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
							<div
								style={{
									width: 76,
									fontSize: "0.78rem",
									color: "var(--text-muted)",
									fontWeight: 600,
								}}
							>
								Completed
							</div>
							<div
								style={{
									flex: 1,
									height: 14,
									borderRadius: 7,
									background: "var(--bg-elevated)",
									position: "relative",
								}}
							>
								<div
									style={{
										position: "absolute",
										inset: 0,
										width: "31%",
										borderRadius: 7,
										background: "linear-gradient(90deg,#4f9a12,#2d7d32)",
									}}
								/>
							</div>
						</div>
					</div>
					<div
						className="grid-3"
						style={{
							gap: "0.75rem",
							borderTop: "1px solid var(--border-subtle)",
							paddingTop: "1.25rem",
						}}
					>
						<div>
							<div
								style={{
									fontSize: "0.7rem",
									color: "var(--text-muted)",
									fontWeight: 600,
									marginBottom: 2,
								}}
							>
								Campaigns
							</div>
							<div
								style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.1rem" }}
							>
								Active
							</div>
						</div>
						<div>
							<div
								style={{
									fontSize: "0.7rem",
									color: "var(--text-muted)",
									fontWeight: 600,
									marginBottom: 2,
								}}
							>
								Schools
							</div>
							<div
								style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.1rem" }}
							>
								Growing
							</div>
						</div>
						<div>
							<div
								style={{
									fontSize: "0.7rem",
									color: "var(--text-muted)",
									fontWeight: 600,
									marginBottom: 2,
								}}
							>
								Payouts
							</div>
							<div
								style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.1rem" }}
							>
								Tracked
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* TRUST ROW */}
			<div
				className="grid-3"
				style={{ maxWidth: 1180, margin: "0 auto", padding: "0 2.5rem 4.5rem" }}
			>
				{TRUST_CARDS.map((c) => (
					<div key={c.title} className="card" style={{ marginBottom: 0 }}>
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
							{c.icon}
						</div>
						<h3 style={{ marginBottom: "0.4rem" }}>{c.title}</h3>
						<p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
							{c.body}
						</p>
					</div>
				))}
			</div>
		</main>
	);
}
