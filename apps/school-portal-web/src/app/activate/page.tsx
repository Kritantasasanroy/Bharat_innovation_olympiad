"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

/**
 * School Invitation / Self-Activation (features §2.1–2.2).
 *
 * Two entry paths: activate an invited school with an invite code, or
 * self-activate by submitting the school's details. Demo flow — a real
 * activation writes a School row + a SCHOOL_ADMIN user and emails an invite.
 */
export default function ActivatePage() {
	const router = useRouter();
	const [mode, setMode] = useState<"invite" | "self">("invite");
	const [done, setDone] = useState(false);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setDone(true);
	}

	if (done) {
		return (
			<main className="page">
				<div className="card" style={{ maxWidth: 560, textAlign: "center" }}>
					<div className="empty-state__icon">🎉</div>
					<h2>Your school is activated</h2>
					<p className="muted mb-0">
						A coordinator account has been created. Sign in with the access token from your
						welcome email to complete your institution profile.
					</p>
					<div className="divider" />
					<Link href="/login" className="button">
						Continue to sign in
					</Link>
				</div>
			</main>
		);
	}

	return (
		<main className="page">
			<div className="page-header">
				<h1>Activate your school</h1>
				<p>Join by invitation, or self-activate by submitting your school&apos;s details.</p>
			</div>

			<div className="inline" style={{ marginBottom: "1.5rem" }}>
				<button
					type="button"
					className={mode === "invite" ? "pill pill--active" : "pill"}
					onClick={() => setMode("invite")}
				>
					I have an invite code
				</button>
				<button
					type="button"
					className={mode === "self" ? "pill pill--active" : "pill"}
					onClick={() => setMode("self")}
				>
					Self-activate
				</button>
			</div>

			<div className="card" style={{ maxWidth: 620 }}>
				<form className="form-grid" onSubmit={handleSubmit} style={{ maxWidth: "none" }}>
					{mode === "invite" ? (
						<div>
							<label htmlFor="code">Invite code</label>
							<input id="code" placeholder="BIO-SCHOOL-XXXX" required />
						</div>
					) : null}
					<div>
						<label htmlFor="name">School name</label>
						<input id="name" placeholder="Delhi Public School, ..." required />
					</div>
					<div className="grid-2" style={{ gap: "1rem" }}>
						<div>
							<label htmlFor="board">Board</label>
							<select id="board" defaultValue="CBSE">
								<option>CBSE</option>
								<option>ICSE</option>
								<option>State Board</option>
								<option>IB / Cambridge</option>
							</select>
						</div>
						<div>
							<label htmlFor="udise">UDISE / school code</label>
							<input id="udise" placeholder="Optional" />
						</div>
					</div>
					<div className="grid-2" style={{ gap: "1rem" }}>
						<div>
							<label htmlFor="city">City</label>
							<input id="city" required />
						</div>
						<div>
							<label htmlFor="state">State</label>
							<input id="state" required />
						</div>
					</div>
					<div>
						<label htmlFor="contact">Coordinator name</label>
						<input id="contact" required />
					</div>
					<div className="grid-2" style={{ gap: "1rem" }}>
						<div>
							<label htmlFor="email">Coordinator email</label>
							<input id="email" type="email" required />
						</div>
						<div>
							<label htmlFor="phone">Coordinator phone</label>
							<input id="phone" required />
						</div>
					</div>
					<button type="submit" className="button">
						{mode === "invite" ? "Activate account" : "Submit for activation"}
					</button>
				</form>
			</div>

			<p className="muted" style={{ marginTop: "1rem" }}>
				Already activated? <Link href="/login">Sign in</Link>.
			</p>
		</main>
	);
}
