"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { ThemeToggle } from "../../components/theme-toggle";
import { setActivationTicket } from "../../lib/activation-ticket";
import { ApiError, backendApi } from "../../lib/api-client";

type VerificationState = "checking" | "form" | "verified" | "continue" | "error";

export default function VerifyPartnerEmailPage() {
	const router = useRouter();
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
				if (result.status === "CONTINUE_APPLICATION" && result.submissionTicket) {
					// Verify-first: hand the ticket to /apply and jump straight there
					// instead of showing an intermediate "confirmed" screen.
					setActivationTicket(result.submissionTicket, result.email);
					setEmail(result.email);
					setState("continue");
					router.replace("/apply");
					return;
				}
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
	}, [router]);

	async function resend(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!email.trim()) {
			setError("Enter the email address used for your partner application.");
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

	if (state === "checking" || state === "continue") {
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
				<p className="eyebrow">Partner onboarding</p>
				<h1>{state === "verified" ? "Email confirmed" : "Confirm your email"}</h1>
				<p>
					{state === "verified"
						? "Your partner application is ready for BIO staff review."
						: "Use the link in your BIO email to confirm the contact address on your application."}
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
									? "Your application remains in the BIO staff review queue."
									: "Your application has now entered the BIO staff review queue."}
							</span>
						</div>
						<div className="verification-steps">
							<div>
								<span>1</span>
								<p>Our team reviews the organisation details.</p>
							</div>
							<div>
								<span>2</span>
								<p>We email you when partner access is approved or declined.</p>
							</div>
							<div>
								<span>3</span>
								<p>After approval, sign in with your email and password.</p>
							</div>
						</div>
						<Link href="/login" className="button">
							Go to partner sign in
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
								If an unconfirmed partner application exists for this address, a fresh link is on
								its way.
							</div>
						) : null}
						<form className="form-grid" onSubmit={resend}>
							<label className="field">
								<span>Application email</span>
								<input
									type="email"
									autoComplete="email"
									required
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									placeholder="you@organisation.org"
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
				<Link href="/apply">Start a new application</Link> ·{" "}
				<Link href="/login">Partner sign in</Link>
			</p>
		</main>
	);
}
