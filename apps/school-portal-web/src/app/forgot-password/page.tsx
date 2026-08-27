"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { ThemeToggle } from "../../components/theme-toggle";
import { ApiError, backendApi } from "../../lib/api-client";

/**
 * Coordinator password set / reset — three steps, same OTP shape as activation:
 * email a code, confirm it for a short-lived `resetTicket`, then set the
 * password. This is also the path for partner-submitted schools that have never
 * created a password: the same flow creates one.
 */
export default function ForgotPasswordPage() {
	const [phase, setPhase] = useState<"email" | "code" | "password" | "done">("email");
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [resetTicket, setResetTicket] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [resending, setResending] = useState(false);
	const [resent, setResent] = useState(false);

	async function sendCode(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			await backendApi.forgotPassword(email.trim());
			setPhase("code");
		} catch (cause) {
			setError(
				cause instanceof ApiError ? cause.message : "Something went wrong. Please try again.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	async function resendCode() {
		setResending(true);
		setError(null);
		setResent(false);
		try {
			await backendApi.forgotPassword(email.trim());
			setResent(true);
		} catch (cause) {
			setError(cause instanceof ApiError ? cause.message : "Could not resend the code. Try again.");
		} finally {
			setResending(false);
		}
	}

	async function confirmCode(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const result = await backendApi.confirmPasswordReset(email.trim(), code.trim());
			setResetTicket(result.resetTicket);
			setPhase("password");
		} catch (cause) {
			setError(cause instanceof ApiError ? cause.message : "That code didn't work. Try again.");
		} finally {
			setSubmitting(false);
		}
	}

	async function submitNewPassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			await backendApi.resetPassword(email.trim(), resetTicket, newPassword);
			setPhase("done");
		} catch (cause) {
			setError(
				cause instanceof ApiError ? cause.message : "Could not reset your password. Try again.",
			);
		} finally {
			setSubmitting(false);
		}
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

			{phase === "email" ? (
				<>
					<div className="page-header">
						<h1>Create or reset your password</h1>
						<p>
							Enter your coordinator email and we&apos;ll send you a 6-digit code. If you don&apos;t
							have a password yet, this creates one.
						</p>
					</div>
					<div className="card" style={{ maxWidth: 480 }}>
						<form className="form-grid" onSubmit={sendCode} style={{ maxWidth: "none" }}>
							<div>
								<label htmlFor="email">Coordinator email</label>
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
				</>
			) : null}

			{phase === "code" ? (
				<>
					<div className="page-header">
						<p className="eyebrow">Step 2 of 3</p>
						<h1>Enter your code</h1>
						<p>
							We sent a 6-digit code to <strong>{email.trim()}</strong>.
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
				</>
			) : null}

			{phase === "password" ? (
				<>
					<div className="page-header">
						<p className="eyebrow">Step 3 of 3</p>
						<h1>Choose a password</h1>
						<p>This is the password you will use with your coordinator email.</p>
					</div>
					<div className="card" style={{ maxWidth: 480 }}>
						<form className="form-grid" onSubmit={submitNewPassword} style={{ maxWidth: "none" }}>
							<div>
								<label htmlFor="newPassword">New password</label>
								<input
									id="newPassword"
									type="password"
									required
									minLength={8}
									maxLength={128}
									autoComplete="new-password"
									autoCapitalize="none"
									autoCorrect="off"
									spellCheck={false}
									placeholder="At least 8 characters"
									value={newPassword}
									onChange={(event) => setNewPassword(event.target.value)}
								/>
							</div>
							{error ? <div className="notice notice--error">{error}</div> : null}
							<button
								type="submit"
								className="button"
								disabled={submitting || newPassword.length < 8}
							>
								{submitting ? "Saving…" : "Reset password"}
							</button>
						</form>
					</div>
				</>
			) : null}

			{phase === "done" ? (
				<>
					<div className="page-header">
						<h1>Password saved</h1>
						<p>
							Your password has been set. Sign in with your coordinator email and password, or with
							your access token.
						</p>
					</div>
					<div className="card" style={{ maxWidth: 480 }}>
						<Link href="/login" className="button">
							Go to sign in
						</Link>
					</div>
				</>
			) : null}

			{phase !== "done" ? (
				<p className="muted" style={{ marginTop: "1rem" }}>
					<Link href="/login">Back to sign in</Link>.
				</p>
			) : null}
		</main>
	);
}
