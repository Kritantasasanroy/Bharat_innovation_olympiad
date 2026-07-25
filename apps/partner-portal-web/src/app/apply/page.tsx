"use client";

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
	const [submitted, setSubmitted] = useState(false);
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
			await backendApi.apply(form);
			setSubmitted(true);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not submit the application.");
		} finally {
			setSubmitting(false);
		}
	}

	if (submitted) {
		return (
			<main className="page">
				<div className="card" style={{ maxWidth: 560 }}>
					<h2>Your request is under review</h2>
					<p className="muted">
						Thanks — we&apos;ve received your partner access request for{" "}
						<strong>{form.orgName}</strong>. Our team reviews applications manually. Once approved,
						sign in with <strong>{form.email}</strong> and the password you just set.
					</p>
					<div
						className="divider"
						style={{ height: 1, background: "var(--border-subtle)", margin: "1.25rem 0" }}
					/>
					<Link href="/login" className="button">
						Go to sign in
					</Link>
				</div>
			</main>
		);
	}

	return (
		<main className="page">
			<div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 50 }}>
				<ThemeToggle />
			</div>
			<div className="page-header">
				<h1>Request partner access</h1>
				<p>
					Tell us about your organisation and choose a password. Once our team approves your request
					you can sign in and start referring institutions and students.
				</p>
			</div>

			<div className="card" style={{ maxWidth: 620 }}>
				<form className="form-grid" onSubmit={handleSubmit} style={{ maxWidth: "none" }}>
					<div>
						<label htmlFor="orgName">Organisation name</label>
						<input
							id="orgName"
							required
							value={form.orgName}
							onChange={(event) => setForm({ ...form, orgName: event.target.value })}
						/>
					</div>
					<div>
						<label htmlFor="contactPerson">Contact person</label>
						<input
							id="contactPerson"
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
