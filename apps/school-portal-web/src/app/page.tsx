"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ThemeToggle } from "../components/theme-toggle";
import { useAuth } from "../lib/auth-context";

export default function HomePage() {
	const { token } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (token) router.replace("/dashboard");
	}, [token, router]);

	return (
		<main className="hero">
			<div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 50 }}>
				<ThemeToggle />
			</div>
			<Image
				src="/bio-logo.png"
				alt="Bharat Innovation Olympiad"
				width={211}
				height={64}
				style={{ height: "64px", width: "auto", objectFit: "contain", marginBottom: "0.75rem" }}
			/>
			<p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
				by Lemon Ideas · Become Future Ready
			</p>
			<div className="pill pill--active" style={{ marginBottom: "1.25rem" }}>
				Bharat Innovation Olympiad
			</div>
			<h1>
				The <span className="brand-gradient">School Portal</span> for the Innovation Olympiad
			</h1>
			<p>
				Onboard your school, bring your students in (including bulk upload), set your exam dates,
				monitor exam day, and review results, analytics and benchmarking — all in one place. An
				initiative by Lemon Ideas. Become Future Ready.
			</p>
			<div className="hero__actions">
				<Link href="/activate" className="button">
					Activate your school
				</Link>
				<Link href="/login" className="button button--secondary">
					Coordinator sign in
				</Link>
			</div>
		</main>
	);
}
