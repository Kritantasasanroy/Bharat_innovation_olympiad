"use client";

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
			<div className="pill pill--active" style={{ marginBottom: "1.25rem" }}>
				Bharat Innovation Olympiad
			</div>
			<h1>
				The <span className="brand-gradient">School Portal</span> for the Innovation Olympiad
			</h1>
			<p>
				Onboard your school, bring your students in (including bulk upload), set your exam dates,
				monitor exam day, and review results, analytics and benchmarking — all in one place.
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
