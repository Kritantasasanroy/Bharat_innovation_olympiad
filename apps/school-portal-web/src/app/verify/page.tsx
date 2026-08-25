"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { ThemeToggle } from "../../components/theme-toggle";
import { ApiError, backendApi } from "../../lib/api-client";

type VerificationState = "checking" | "form" | "verified" | "error";

/**
 * Legacy link-based confirmation — only for a school a partner submitted on
 * the coordinator's behalf (`apply(dto, submittedByPartnerId)`), which still
 * emails a confirmation link since the partner cannot prove control of
 * someone else's inbox up front. A self-applying coordinator never lands
 * here — they confirm inline with a 6-digit code on `/activate`.
 */
export default function VerifySchoolEmailPage() {
	const [state, setState] = useState<VerificationState>("checking");
	const [alreadyVerified, setAlreadyVerified] = useState(false);
	const [email, setEmail] = useState("");
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
				setAlreadyVerified(result.status === "ALREADY_VERIFIED");
				setState("verified");
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

	if (state === "checking") {
		return (
			<main className="page">
				<p className="muted">Checking your email confirmation…</p>
			</main>
		);
	}

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
				<h1>{state === "verified" ? "Email confirmed" : "Confirm your email"}</h1>
				<p>
					{state === "verified"
						? "Your school application is ready for BIO staff review."
						: "Use the link in your BIO email to confirm the coordinator address on your application."}
				</p>
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
								<p>After approval, the coordinator signs in with the issued access token.</p>
							</div>
						</div>
						<Link href="/login" className="button">
							Go to coordinator sign in
						</Link>
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
