"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { ThemeToggle } from "../../components/theme-toggle";
import { ApiError, backendApi } from "../../lib/api-client";

/**
 * PUBLIC partner access request — no token required.
 *
 * This is the front door: a brand-new partner has no account and nothing to
 * paste, so this page must be reachable unauthenticated. It posts to the legacy
 * backend (`POST /api/partner/apply`), which creates the engine record in
 * admin-api and stores the credential. Staff then grant access from the admin
 * Partner Management page, after which the partner signs in at `/login`.
 *
 * Deliberately no KYC/Aadhaar/document-upload fields (PRD-011).
 */
export default function ApplyPage() {
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState<{
		orgName: string;
		email: string;
		emailSent: boolean;
	} | null>(null);
	const [form, setForm] = useState({
		orgName: "",
		contactPerson: "",
		email: "",
		phone: "",
		password: "",
	});

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const result = await backendApi.apply(form);
			setSubmitted({ orgName: result.orgName, email: result.email, emailSent: result.emailSent });
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not submit the application.");
		} finally {
			setSubmitting(false);
		}
	}

	if (submitted) {
		return (
			<main className="page">
				<div className="verification-brand">
					<Image src="/bio-logo.png" alt="Bharat Innovation Olympiad" width={211} height={64} />
				</div>
				<div className="card verification-card">
					<p className="eyebrow">Step 1 of 2 complete</p>
					<h1>Confirm your partner email</h1>
					<p className="muted">
						We saved the application for <strong>{submitted.orgName}</strong>. We sent a
						confirmation link to <strong>{submitted.email}</strong>. Open it to prove you own this
						address.
					</p>
					<div className="verification-status verification-status--success" role="status">
						<strong>
							{submitted.emailSent ? "Check your inbox." : "Your application is saved."}
						</strong>
						<span>
							{submitted.emailSent
								? "After you confirm, BIO staff will review the partner application."
								: "Email delivery is temporarily unavailable. Use the verification page to request another link or contact BIO support."}
						</span>
					</div>
					<div className="inline">
						<Link href="/verify" className="button">
							Open verification page
						</Link>
						<Link href="/login" className="button button--secondary">
							Already verified? Sign in
						</Link>
					</div>
				</div>
			</main>
		);
	}

	return (
		<main className="page">
			<div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 50 }}>
				<ThemeToggle />
			</div>
			<div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
				<Image
					src="/bio-logo.png"
					alt="Bharat Innovation Olympiad"
					width={160}
					height={48}
					style={{ height: "48px", width: "auto", objectFit: "contain" }}
				/>
			</div>
			<div className="page-header">
				<h1>Request partner access</h1>
				<p>
					Two steps: confirm your contact email, then wait for BIO staff approval. Once approved,
					sign in and start referring institutions and students.
				</p>
			</div>

			<div className="card" style={{ maxWidth: 620 }}>
				<form className="form-grid" onSubmit={handleSubmit} style={{ maxWidth: "none" }}>
					<div>
						<label htmlFor="orgName">Organisation name</label>
						<input
							id="orgName"
							maxLength={200}
							required
							value={form.orgName}
							onChange={(event) => setForm({ ...form, orgName: event.target.value })}
						/>
					</div>
					<div>
						<label htmlFor="contactPerson">Contact person</label>
						<input
							id="contactPerson"
							maxLength={200}
							required
							value={form.contactPerson}
							onChange={(event) => setForm({ ...form, contactPerson: event.target.value })}
						/>
					</div>
					<div>
						<label htmlFor="email">Email</label>
						<input
							id="email"
							type="email"
							maxLength={254}
							required
							autoComplete="email"
							value={form.email}
							onChange={(event) => setForm({ ...form, email: event.target.value })}
						/>
					</div>
					<div>
						<label htmlFor="phone">Phone</label>
						<input
							id="phone"
							required
							maxLength={20}
							pattern="^[+0-9][0-9()\\s-]{6,19}$"
							title="Enter a phone number with 7–20 digits"
							autoComplete="tel"
							value={form.phone}
							onChange={(event) => setForm({ ...form, phone: event.target.value })}
						/>
					</div>
					<div>
						<label htmlFor="password">Password</label>
						<input
							id="password"
							type="password"
							required
							minLength={8}
							maxLength={128}
							autoComplete="new-password"
							placeholder="At least 8 characters"
							value={form.password}
							onChange={(event) => setForm({ ...form, password: event.target.value })}
						/>
					</div>
					{error ? <div className="notice notice--error">{error}</div> : null}
					<button type="submit" className="button" disabled={submitting}>
						{submitting ? "Submitting…" : "Request access"}
					</button>
				</form>
			</div>

			<p className="muted" style={{ marginTop: "1rem" }}>
				Already approved? <Link href="/login">Sign in</Link>.
			</p>
		</main>
	);
}
