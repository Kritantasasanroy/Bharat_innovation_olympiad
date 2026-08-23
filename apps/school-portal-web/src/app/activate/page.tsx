"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { ThemeToggle } from "../../components/theme-toggle";
import { ApiError, backendApi } from "../../lib/api-client";
import { clearReferralCode, getReferralCode } from "../../lib/referral";

const BOARDS = ["CBSE", "ICSE", "State Board", "IB / Cambridge"] as const;
const PINCODE_LENGTH = 6;

/**
 * School self-activation (features §2.1–2.2).
 *
 * Submits a real access request to the backend, which queues it for staff
 * review on the admin Access Requests page. Approval provisions the school and
 * issues a single access token, which staff hand over; the school then signs in
 * with it at `/login`. Nothing is granted here.
 *
 * City and state are filled from the pincode, so they always agree with what a
 * student sees when picking this school later.
 */
export default function ActivatePage() {
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState<{
		schoolName: string;
		coordinatorEmail: string;
		emailSent: boolean;
	} | null>(null);

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
				coordinatorEmail: value("coordinatorEmail"),
				coordinatorPhone: value("coordinatorPhone"),
				...(referralCode ? { referralCode } : {}),
			});
			clearReferralCode();
			setDone({
				schoolName: result.schoolName,
				coordinatorEmail: result.coordinatorEmail,
				emailSent: result.emailSent,
			});
		} catch (cause) {
			setError(
				cause instanceof ApiError ? cause.message : "Something went wrong. Please try again.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	if (done) {
		return (
			<main className="page">
				<div className="verification-brand">
					<Image src="/bio-logo.png" alt="Bharat Innovation Olympiad" width={211} height={64} />
				</div>
				<div className="card verification-card">
					<p className="eyebrow">Step 1 of 2 complete</p>
					<h1>Confirm your school email</h1>
					<p className="muted">
						We saved the application for <strong>{done.schoolName}</strong>. We sent a confirmation
						link to <strong>{done.coordinatorEmail}</strong>. Open it to prove you own this address.
					</p>
					<div className="verification-status verification-status--success" role="status">
						<strong>{done.emailSent ? "Check your inbox." : "Your application is saved."}</strong>
						<span>
							{done.emailSent
								? "After you confirm, BIO staff will review the school application."
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
				<h1>Activate your school</h1>
				<p>
					Two steps: confirm the coordinator email, then wait for BIO staff approval. The school
					access token is issued only after both checks are complete.
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
							<input
								id="coordinatorEmail"
								name="coordinatorEmail"
								type="email"
								maxLength={254}
								required
							/>
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
					{error ? <div className="notice notice--error">{error}</div> : null}
					<button type="submit" className="button" disabled={submitting || !location}>
						{submitting ? "Submitting…" : "Submit for activation"}
					</button>
				</form>
			</div>

			<p className="muted" style={{ marginTop: "1rem" }}>
				Already have an access token? <Link href="/login">Sign in</Link>.
			</p>
		</main>
	);
}
