"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { ThemeToggle } from "../../components/theme-toggle";
import { ApiError, backendApi } from "../../lib/api-client";

type VerificationState = "checking" | "form" | "verified" | "set-password" | "done" | "error";

/**
 * Legacy link-based confirmation — only for a school a partner submitted on
 * the coordinator's behalf. When a partner-submitted school confirms the email
 * and has not set a password yet, the page also asks the coordinator to create
 * one, so every school can sign in with both email + password and access token.
 */
export default function VerifySchoolEmailPage() {
	const [state, setState] = useState<VerificationState>("checking");
	const [alreadyVerified, setAlreadyVerified] = useState(false);
	const [email, setEmail] = useState("");
	const [setPasswordTicket, setSetPasswordTicket] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [resent, setResent] = useState(false);
	const [resending, setResending] = useState(false);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const token = params.get("token")?.trim() ?? "";
		const queryEmail = params.get("email")?.trim() ?? "";
		if (queryEmail) setEmail(queryEmail);

		if (!token) {
			setState("form");
			return;
		}

		window.history.replaceState(null, "", "/verify");
		let active = true;
		backendApi
			.verifyEmail(token)
			.then((result) => {
				if (!active) return;
				if (result.status === "SET_PASSWORD") {
					setEmail(result.email);
					setSetPasswordTicket(result.setPasswordTicket ?? "");
					setState("set-password");
				} else {
					setAlreadyVerified(result.status === "ALREADY_VERIFIED");
					setState("verified");
				}
			})
			.catch((cause: unknown) => {
				if (!active) return;
				setError(
					cause instanceof ApiError
						? cause.message
						: "This verification link could not be checked. Request a new link below.",
				);
				setState("error");
			});

		return () => {
			active = false;
		};
	}, []);

	async function resend(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!email.trim()) {
			setError("Enter the coordinator email used for your school application.");
			return;
		}
		setResending(true);
		setError(null);
		setResent(false);
		try {
			await backendApi.resendVerification(email.trim());
			setResent(true);
		} catch (cause: unknown) {
			setError(
				cause instanceof ApiError
					? cause.message
					: "We could not request another link. Check your connection and try again.",
			);
		} finally {
			setResending(false);
		}
	}

	async function submitPassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (password.length < 8 || !setPasswordTicket) return;
		setSubmitting(true);
		setError(null);
		try {
			await backendApi.setPassword(email.trim(), setPasswordTicket, password);
			setState("done");
		} catch (cause: unknown) {
			setError(
				cause instanceof ApiError
					? cause.message
					: "Could not save the password. Check your connection and try again.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	if (state === "checking") {
		return (
			<main className="page">
				<p className="muted">Checking your email confirmation…</p>
			</main>
		);
	}

	const title =
		state === "verified" || state === "done"
			? "Email confirmed"
			: state === "set-password"
				? "Create your password"
				: "Confirm your email";

	const subtitle =
		state === "done"
			? "Your school application is in the review queue. Once approved, you can sign in with your email + password or the access token."
			: state === "set-password"
				? "Choose a password so you can sign in with your coordinator email as well as the access token once your school is approved."
				: "Use the link in your BIO email to confirm the coordinator address on your application.";

	return (
		<main className="page">
			<div className="verification-theme-toggle">
				<ThemeToggle />
			</div>
			<div className="verification-brand">
				<Image src="/bio-logo.png" alt="Bharat Innovation Olympiad" width={211} height={64} />
			</div>
			<div className="page-header">
				<p className="eyebrow">School onboarding</p>
				<h1>{title}</h1>
				<p>{subtitle}</p>
			</div>

			<div className="card verification-card">
				{state === "verified" ? (
					<>
						<div className="verification-status verification-status--success" role="status">
							<strong>
								{alreadyVerified ? "This email was already confirmed." : "Email confirmed."}
							</strong>
							<span>
								{alreadyVerified
									? "Your school application remains in the BIO staff review queue."
									: "Your school application has now entered the BIO staff review queue."}
							</span>
						</div>
						<div className="verification-steps">
							<div>
								<span>1</span>
								<p>BIO staff review the school and coordinator details.</p>
							</div>
							<div>
								<span>2</span>
								<p>We email the coordinator when access is approved or declined.</p>
							</div>
							<div>
								<span>3</span>
								<p>
									After approval, sign in with your email + password or the issued access token.
								</p>
							</div>
						</div>
						<Link href="/login" className="button">
							Go to coordinator sign in
						</Link>
					</>
				) : state === "set-password" || state === "done" ? (
					<>
						{error ? (
							<div className="notice notice--error" role="alert">
								{error}
							</div>
						) : null}
						{state === "done" ? (
							<>
								<div className="verification-status verification-status--success" role="status">
									<strong>Password created.</strong>
									<span>
										Use this email and password, or the access token BIO emails you once the school
										is approved.
									</span>
								</div>
								<Link href="/login" className="button">
									Go to coordinator sign in
								</Link>
							</>
						) : (
							<form className="form-grid" onSubmit={submitPassword}>
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
										value={password}
										onChange={(event) => setPassword(event.target.value)}
									/>
								</div>
								<button
									type="submit"
									className="button"
									disabled={submitting || password.length < 8}
								>
									{submitting ? "Saving…" : "Create password"}
								</button>
							</form>
						)}
					</>
				) : (
					<>
						{error ? (
							<div className="notice notice--error" role="alert">
								{error}
							</div>
						) : null}
						{resent ? (
							<div className="notice notice--success" role="status">
								If an unconfirmed school application exists for this address, a fresh link is on its
								way.
							</div>
						) : null}
						<form className="form-grid" onSubmit={resend}>
							<label className="field">
								<span>Coordinator email</span>
								<input
									type="email"
									autoComplete="email"
									required
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									placeholder="coordinator@school.edu.in"
								/>
							</label>
							<p className="muted verification-help">
								Links expire after 24 hours. Check spam or junk mail before requesting another link;
								new requests are limited to protect your inbox.
							</p>
							<button type="submit" className="button" disabled={resending}>
								{resending ? "Requesting…" : "Send another verification link"}
							</button>
						</form>
					</>
				)}
			</div>

			<p className="muted verification-footer">
				<Link href="/activate">Activate a school</Link> ·{" "}
				<Link href="/login">Coordinator sign in</Link>
			</p>
		</main>
	);
}
