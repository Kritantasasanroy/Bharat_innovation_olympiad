"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { ThemeToggle } from "../../components/theme-toggle";
import {
	clearActivationTicket,
	getActivationTicket,
	type StoredActivationTicket,
	setActivationTicket,
} from "../../lib/activation-ticket";
import { ApiError, backendApi } from "../../lib/api-client";

/**
 * PUBLIC partner access request, verify-first: the applicant confirms their
 * contact email *before* any organisation details are collected, not after.
 *
 * Step 1 ({@link StartStep}) is the same OTP shape as student registration:
 * enter the contact email, get a 6-digit code by mail, enter it right here —
 * no separate page to visit. Confirming stores a short-lived
 * `verificationTicket`, which is what switches this page to step 2
 * ({@link DetailsStep}), the full application form. Staff then grant access
 * from the admin Partner Management page; nothing is granted here.
 *
 * Deliberately no KYC/Aadhaar/document-upload fields (PRD-011).
 */
export default function ApplyPage() {
	const [ticket, setTicket] = useState<StoredActivationTicket | null | undefined>(undefined);
	const [expired, setExpired] = useState(false);

	useEffect(() => {
		setTicket(getActivationTicket());
	}, []);

	if (ticket === undefined) {
		return (
			<main className="page">
				<p className="muted">Loading…</p>
			</main>
		);
	}

	return ticket ? (
		<DetailsStep
			ticket={ticket}
			onTicketExpired={() => {
				setTicket(null);
				setExpired(true);
			}}
		/>
	) : (
		<StartStep
			expired={expired}
			onVerified={(confirmed) => {
				setExpired(false);
				setTicket(confirmed);
			}}
		/>
	);
}

function Chrome({ children }: { children: ReactNode }) {
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
			{children}
		</main>
	);
}

/** Step 1 — prove control of the contact email, by OTP, before anything else. */
function StartStep({
	expired,
	onVerified,
}: {
	expired: boolean;
	onVerified: (ticket: StoredActivationTicket) => void;
}) {
	const [phase, setPhase] = useState<"email" | "code">("email");
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [resending, setResending] = useState(false);
	const [resent, setResent] = useState(false);

	async function sendCode(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			await backendApi.startVerification(email.trim());
			setPhase("code");
		} catch (cause) {
			setError(cause instanceof ApiError ? cause.message : "Could not submit the request.");
		} finally {
			setSubmitting(false);
		}
	}

	async function confirmCode(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const result = await backendApi.confirmVerification(email.trim(), code.trim());
			const confirmed: StoredActivationTicket = {
				ticket: result.submissionTicket,
				email: result.email,
			};
			setActivationTicket(confirmed.ticket, confirmed.email);
			onVerified(confirmed);
		} catch (cause) {
			setError(cause instanceof ApiError ? cause.message : "That code didn't work. Try again.");
		} finally {
			setSubmitting(false);
		}
	}

	async function resendCode() {
		setResending(true);
		setError(null);
		setResent(false);
		try {
			await backendApi.startVerification(email.trim());
			setResent(true);
		} catch (cause) {
			setError(cause instanceof ApiError ? cause.message : "Could not resend the code. Try again.");
		} finally {
			setResending(false);
		}
	}

	if (phase === "code") {
		return (
			<Chrome>
				<div className="page-header">
					<p className="eyebrow">Step 1 of 2</p>
					<h1>Enter your code</h1>
					<p>
						We sent a 6-digit code to <strong>{email.trim()}</strong>. Enter it below — you&apos;ll
						fill in your organisation&apos;s details right after.
					</p>
				</div>
				<div className="card" style={{ maxWidth: 480 }}>
					<form className="form-grid" onSubmit={confirmCode} style={{ maxWidth: "none" }}>
						<div>
							<label htmlFor="code">6-digit code</label>
							<input
								id="code"
								inputMode="numeric"
								maxLength={6}
								autoComplete="one-time-code"
								required
								value={code}
								onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
								placeholder="123456"
							/>
						</div>
						{error ? <div className="notice notice--error">{error}</div> : null}
						{resent ? (
							<div className="notice notice--success" role="status">
								A fresh code is on its way.
							</div>
						) : null}
						<button type="submit" className="button" disabled={submitting || code.length !== 6}>
							{submitting ? "Checking…" : "Continue"}
						</button>
					</form>
					<div className="inline" style={{ marginTop: "1rem" }}>
						<button
							type="button"
							className="button button--secondary"
							onClick={resendCode}
							disabled={resending}
						>
							{resending ? "Sending…" : "Resend code"}
						</button>
						<button
							type="button"
							className="button button--secondary"
							onClick={() => {
								setPhase("email");
								setCode("");
								setError(null);
								setResent(false);
							}}
						>
							Use a different email
						</button>
					</div>
				</div>
				<p className="muted" style={{ marginTop: "1rem" }}>
					Already approved? <Link href="/login">Sign in</Link>.
				</p>
			</Chrome>
		);
	}

	return (
		<Chrome>
			<div className="page-header">
				<h1>Request partner access</h1>
				<p>
					Two steps: confirm your contact email with a code, then fill in your organisation&apos;s
					details. Once approved, sign in and start referring institutions and students.
				</p>
			</div>
			{expired ? (
				<div className="notice notice--error" style={{ maxWidth: 480, marginBottom: "1rem" }}>
					Your email confirmation expired before you finished the form. Send a new code and try
					again.
				</div>
			) : null}
			<div className="card" style={{ maxWidth: 480 }}>
				<form className="form-grid" onSubmit={sendCode} style={{ maxWidth: "none" }}>
					<div>
						<label htmlFor="email">Email</label>
						<input
							id="email"
							type="email"
							maxLength={254}
							required
							autoComplete="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
						/>
					</div>
					{error ? <div className="notice notice--error">{error}</div> : null}
					<button type="submit" className="button" disabled={submitting || !email.trim()}>
						{submitting ? "Sending…" : "Send code"}
					</button>
				</form>
			</div>
			<p className="muted" style={{ marginTop: "1rem" }}>
				Already approved? <Link href="/login">Sign in</Link>.
			</p>
		</Chrome>
	);
}

/** Step 2 — the contact email is confirmed; collect the rest and submit. */
function DetailsStep({
	ticket,
	onTicketExpired,
}: {
	ticket: StoredActivationTicket;
	onTicketExpired: () => void;
}) {
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState<{ orgName: string } | null>(null);
	const [form, setForm] = useState({ orgName: "", contactPerson: "", phone: "", password: "" });

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const result = await backendApi.apply({
				...form,
				email: ticket.email,
				verificationTicket: ticket.ticket,
			});
			clearActivationTicket();
			setSubmitted({ orgName: result.orgName });
		} catch (cause) {
			if (cause instanceof ApiError && /verify your email/i.test(cause.message)) {
				clearActivationTicket();
				onTicketExpired();
				return;
			}
			setError(cause instanceof ApiError ? cause.message : "Could not submit the application.");
		} finally {
			setSubmitting(false);
		}
	}

	if (submitted) {
		return (
			<Chrome>
				<div className="card verification-card">
					<p className="eyebrow">Application submitted</p>
					<h1>You&apos;re in the review queue</h1>
					<p className="muted">
						We saved the application for <strong>{submitted.orgName}</strong>. Our team reviews
						every application by hand — we&apos;ll email you as soon as a decision is made.
					</p>
					<Link href="/login" className="button">
						Go to partner sign in
					</Link>
				</div>
			</Chrome>
		);
	}

	return (
		<Chrome>
			<div className="page-header">
				<p className="eyebrow">Step 2 of 2 — email confirmed</p>
				<h1>Tell us about your organisation</h1>
				<p>Confirmed as {ticket.email}. Fill in the rest and submit for review.</p>
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
						<input id="email" value={ticket.email} readOnly />
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
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
							placeholder="At least 8 characters"
							value={form.password}
							onChange={(event) => setForm({ ...form, password: event.target.value })}
						/>
					</div>
					{error ? <div className="notice notice--error">{error}</div> : null}
					<button type="submit" className="button" disabled={submitting}>
						{submitting ? "Submitting…" : "Submit for review"}
					</button>
				</form>
			</div>

			<p className="muted" style={{ marginTop: "1rem" }}>
				Already approved? <Link href="/login">Sign in</Link>.
			</p>
		</Chrome>
	);
}
