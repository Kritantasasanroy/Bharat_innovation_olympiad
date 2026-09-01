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
import { clearReferralCode, getReferralCode } from "../../lib/referral";

const BOARDS = ["CBSE", "ICSE", "State Board", "IB / Cambridge"] as const;
const PINCODE_LENGTH = 6;

/**
 * School self-activation (features §2.1–2.2), verify-first: the coordinator
 * confirms their email *before* any school details are collected, not after.
 *
 * Step 1 ({@link StartStep}) is the same OTP shape as student registration:
 * enter the coordinator email, get a 6-digit code by mail, enter it right
 * here — no separate page to visit. Confirming stores a short-lived
 * `verificationTicket`, which is what switches this page to step 2
 * ({@link DetailsStep}), the full application form. Nothing is granted at
 * either step; approval is a separate staff review.
 */
export default function ActivatePage() {
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

/** Step 1 — prove control of the coordinator email, by OTP, before anything else. */
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
			setError(
				cause instanceof ApiError
					? cause.message
					: "We couldn't send the code. Please check your internet and try again.",
			);
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
			setError(
				cause instanceof ApiError
					? cause.message
					: "That code didn't work. Double-check it and try again.",
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
			await backendApi.startVerification(email.trim());
			setResent(true);
		} catch (cause) {
			setError(
				cause instanceof ApiError
					? cause.message
					: "We couldn't resend the code. Please try again.",
			);
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
						fill in your school&apos;s details right after.
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
					Already have an access token? <Link href="/login">Sign in</Link>.
				</p>
			</Chrome>
		);
	}

	return (
		<Chrome>
			<div className="page-header">
				<h1>Activate your school</h1>
				<p>
					Two steps: confirm the coordinator email with a code, then fill in your school&apos;s
					details. The school access token is issued only after Innovation Olympiad staff review is
					complete.
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
						<label htmlFor="coordinatorEmail">Coordinator email</label>
						<input
							id="coordinatorEmail"
							type="email"
							maxLength={254}
							required
							autoComplete="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							placeholder="coordinator@school.edu.in"
						/>
					</div>
					{error ? <div className="notice notice--error">{error}</div> : null}
					<button type="submit" className="button" disabled={submitting || !email.trim()}>
						{submitting ? "Sending…" : "Send code"}
					</button>
				</form>
			</div>
			<p className="muted" style={{ marginTop: "1rem" }}>
				Already have an access token? <Link href="/login">Sign in</Link>.
			</p>
		</Chrome>
	);
}

/** Step 2 — the coordinator's email is confirmed; collect the rest and submit. */
function DetailsStep({
	ticket,
	onTicketExpired,
}: {
	ticket: StoredActivationTicket;
	onTicketExpired: () => void;
}) {
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState<{ schoolName: string } | null>(null);

	const [pincode, setPincode] = useState("");
	const [location, setLocation] = useState<{ city: string; state: string } | null>(null);
	const [locating, setLocating] = useState(false);
	const [locationError, setLocationError] = useState<string | null>(null);

	// Resolve city and state as soon as a complete pincode is entered.
	useEffect(() => {
		if (pincode.length !== PINCODE_LENGTH) {
			setLocation(null);
			setLocationError(null);
			return;
		}
		let cancelled = false;
		setLocating(true);
		setLocationError(null);
		backendApi
			.lookupPincode(pincode)
			.then((found) => !cancelled && setLocation({ city: found.city, state: found.state }))
			.catch(() => {
				if (!cancelled) {
					setLocation(null);
					setLocationError("We couldn't find that pincode. Check the six digits and try again.");
				}
			})
			.finally(() => !cancelled && setLocating(false));
		return () => {
			cancelled = true;
		};
	}, [pincode]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!location) {
			setError("Enter a valid pincode so we can confirm your city and state.");
			return;
		}
		setSubmitting(true);
		setError(null);

		const form = new FormData(event.currentTarget);
		const value = (name: string) => String(form.get(name) ?? "").trim();
		// Not trimmed: login sends the password exactly as typed, so trimming it
		// here would silently hash a different string than what the coordinator
		// re-types at sign-in whenever it has incidental leading/trailing
		// whitespace (common from mobile keyboards or a pasted password).
		const rawPassword = String(form.get("password") ?? "");

		try {
			// A partner's onboarding link leaves `?ref=CODE` in localStorage;
			// pass it so this school is attributed to that partner's campaign.
			const referralCode = getReferralCode();
			const result = await backendApi.apply({
				schoolName: value("schoolName"),
				board: value("board"),
				...(value("udiseCode") ? { udiseCode: value("udiseCode") } : {}),
				pincode,
				city: location.city,
				state: location.state,
				coordinatorName: value("coordinatorName"),
				coordinatorEmail: ticket.email,
				coordinatorPhone: value("coordinatorPhone"),
				password: rawPassword,
				verificationTicket: ticket.ticket,
				...(referralCode ? { referralCode } : {}),
			});
			clearReferralCode();
			clearActivationTicket();
			setDone({ schoolName: result.schoolName });
		} catch (cause) {
			if (cause instanceof ApiError && /verify your (coordinator )?email/i.test(cause.message)) {
				clearActivationTicket();
				onTicketExpired();
				return;
			}
			setError(
				cause instanceof ApiError
					? cause.message
					: "We couldn't submit the application. Please check your internet and try again.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	if (done) {
		return (
			<Chrome>
				<div className="card verification-card">
					<p className="eyebrow">Application submitted</p>
					<h1>You&apos;re in the review queue</h1>
					<p className="muted">
						We saved the application for <strong>{done.schoolName}</strong>. Innovation Olympiad
						staff review every application by hand — we&apos;ll email the access token once
						it&apos;s approved.
					</p>
					<Link href="/login" className="button">
						Go to coordinator sign in
					</Link>
				</div>
			</Chrome>
		);
	}

	return (
		<Chrome>
			<div className="page-header">
				<p className="eyebrow">Step 2 of 2 — email confirmed</p>
				<h1>Tell us about your school</h1>
				<p>
					Confirmed as {ticket.email}. Fill in the rest and submit for Innovation Olympiad staff
					review.
				</p>
			</div>

			<div className="card" style={{ maxWidth: 620 }}>
				<form className="form-grid" onSubmit={handleSubmit} style={{ maxWidth: "none" }}>
					<div>
						<label htmlFor="schoolName">School name</label>
						<input
							id="schoolName"
							name="schoolName"
							maxLength={200}
							placeholder="Delhi Public School, ..."
							required
						/>
					</div>
					<div className="grid-2" style={{ gap: "1rem" }}>
						<div>
							<label htmlFor="board">Board</label>
							<select id="board" name="board" defaultValue="CBSE">
								{BOARDS.map((board) => (
									<option key={board}>{board}</option>
								))}
							</select>
						</div>
						<div>
							<label htmlFor="udiseCode">UDISE / school code</label>
							<input id="udiseCode" name="udiseCode" placeholder="Optional" />
						</div>
					</div>
					<div className="grid-2" style={{ gap: "1rem" }}>
						<div>
							<label htmlFor="pincode">Pincode</label>
							<input
								id="pincode"
								name="pincode"
								inputMode="numeric"
								maxLength={PINCODE_LENGTH}
								placeholder="e.g. 110001"
								value={pincode}
								onChange={(event) =>
									setPincode(event.target.value.replace(/\D/g, "").slice(0, PINCODE_LENGTH))
								}
								required
							/>
						</div>
						<div>
							<label htmlFor="location">City &amp; state</label>
							<input
								id="location"
								readOnly
								value={
									locating ? "Looking up…" : location ? `${location.city}, ${location.state}` : ""
								}
								placeholder="Filled from your pincode"
							/>
						</div>
					</div>
					{locationError ? (
						<div className="notice notice--error" role="alert">
							{locationError}
						</div>
					) : null}
					<div>
						<label htmlFor="coordinatorName">Coordinator name</label>
						<input id="coordinatorName" name="coordinatorName" maxLength={200} required />
					</div>
					<div className="grid-2" style={{ gap: "1rem" }}>
						<div>
							<label htmlFor="coordinatorEmail">Coordinator email</label>
							<input id="coordinatorEmail" value={ticket.email} readOnly />
						</div>
						<div>
							<label htmlFor="coordinatorPhone">Coordinator phone</label>
							<input
								id="coordinatorPhone"
								name="coordinatorPhone"
								maxLength={20}
								pattern="^[+0-9][0-9()\\s-]{6,19}$"
								title="Enter a phone number with 7–20 digits"
								autoComplete="tel"
								required
							/>
						</div>
					</div>
					<div>
						<label htmlFor="password">Choose a password</label>
						<input
							id="password"
							name="password"
							type="password"
							required
							minLength={8}
							maxLength={128}
							autoComplete="new-password"
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
							placeholder="At least 8 characters"
						/>
					</div>
					{error ? <div className="notice notice--error">{error}</div> : null}
					<button type="submit" className="button" disabled={submitting || !location}>
						{submitting ? "Submitting…" : "Submit for review"}
					</button>
				</form>
			</div>

			<p className="muted" style={{ marginTop: "1rem" }}>
				Already have an access token? <Link href="/login">Sign in</Link>.
			</p>
		</Chrome>
	);
}
