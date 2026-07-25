"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
	ApiError,
	type PartnerSchool,
	type PartnerSchoolInput,
	partnerSchoolApi,
} from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { usePoll } from "../../../lib/use-poll";

const BOARDS = ["CBSE", "ICSE", "State Board", "IB / Cambridge"] as const;
const PINCODE_LENGTH = 6;

const STATUS_BADGE: Record<PartnerSchool["status"], string> = {
	PENDING: "badge badge--pending",
	APPROVED: "badge badge--positive",
	REJECTED: "badge badge--negative",
	REVOKED: "badge badge--negative",
};

/**
 * Onboard a school on its behalf. The request joins the same admin review queue
 * a self-applying school lands in, tagged with this partner. Approval issues the
 * access token to the school's own coordinator — the partner never gets it.
 */
export default function PartnerSchoolsPage() {
	const { token } = useAuth();
	const [schools, setSchools] = useState<PartnerSchool[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [success, setSuccess] = useState<string | null>(null);

	const [pincode, setPincode] = useState("");
	const [location, setLocation] = useState<{ city: string; state: string } | null>(null);
	const [locating, setLocating] = useState(false);

	const load = useCallback(async () => {
		if (!token) return;
		try {
			setSchools(await partnerSchoolApi.list(token));
		} catch (cause) {
			setError(cause instanceof ApiError ? cause.message : "Could not load your schools.");
		}
	}, [token]);

	// Auto-refresh so an admin's approval/rejection shows without a manual reload.
	usePoll(load);

	// City and state from the pincode, so they match what a student later sees.
	useEffect(() => {
		if (pincode.length !== PINCODE_LENGTH) {
			setLocation(null);
			return;
		}
		let cancelled = false;
		setLocating(true);
		partnerSchoolApi
			.lookupPincode(pincode)
			.then((found) => !cancelled && setLocation({ city: found.city, state: found.state }))
			.catch(() => !cancelled && setLocation(null))
			.finally(() => !cancelled && setLocating(false));
		return () => {
			cancelled = true;
		};
	}, [pincode]);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token || !location) {
			setError("Enter a valid pincode so we can confirm the school's city and state.");
			return;
		}
		setSubmitting(true);
		setError(null);
		setSuccess(null);

		// Capture the element before any await (React nulls currentTarget after).
		const formEl = event.currentTarget;
		const data = new FormData(formEl);
		const value = (name: string) => String(data.get(name) ?? "").trim();
		const input: PartnerSchoolInput = {
			schoolName: value("schoolName"),
			board: value("board"),
			...(value("udiseCode") ? { udiseCode: value("udiseCode") } : {}),
			pincode,
			city: location.city,
			state: location.state,
			coordinatorName: value("coordinatorName"),
			coordinatorEmail: value("coordinatorEmail"),
			coordinatorPhone: value("coordinatorPhone"),
		};

		try {
			const result = await partnerSchoolApi.onboard(token, input);
			setSuccess(`${result.schoolName} submitted for review — see it below.`);
			formEl.reset();
			setPincode("");
			setLocation(null);
		} catch (cause) {
			// A 409 means this coordinator's school is already in the system —
			// often because a cold-start retry created it. That's not an error:
			// tell the partner it's already submitted, and the reload below shows it.
			if (cause instanceof ApiError && cause.statusCode === 409) {
				setSuccess("This school has already been submitted — see it in the list below.");
				formEl.reset();
				setPincode("");
				setLocation(null);
			} else {
				setError(cause instanceof ApiError ? cause.message : "Could not submit this school.");
			}
		} finally {
			setSubmitting(false);
			// Always refresh: even if the request errored client-side, the row may
			// have been created server-side (cold-start), so show reality.
			void load();
		}
	}

	return (
		<main>
			<div className="page-header">
				<h1>Schools</h1>
				<p>
					Onboard a school on its behalf. It enters the BIO review queue tagged as yours; once
					approved, the school&apos;s coordinator receives their own access token.
				</p>
			</div>

			{error ? <div className="notice notice--error">{error}</div> : null}
			{success ? <div className="notice notice--success">{success}</div> : null}

			<div className="card">
				<h2>Onboard a school</h2>
				<form className="form-grid" onSubmit={submit} style={{ maxWidth: "none" }}>
					<div>
						<label htmlFor="schoolName">School name</label>
						<input id="schoolName" name="schoolName" required />
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
								placeholder="Filled from the pincode"
								value={
									locating ? "Looking up…" : location ? `${location.city}, ${location.state}` : ""
								}
							/>
						</div>
					</div>
					<div>
						<label htmlFor="coordinatorName">Coordinator name</label>
						<input id="coordinatorName" name="coordinatorName" required />
					</div>
					<div className="grid-2" style={{ gap: "1rem" }}>
						<div>
							<label htmlFor="coordinatorEmail">Coordinator email</label>
							<input id="coordinatorEmail" name="coordinatorEmail" type="email" required />
						</div>
						<div>
							<label htmlFor="coordinatorPhone">Coordinator phone</label>
							<input id="coordinatorPhone" name="coordinatorPhone" required />
						</div>
					</div>
					<button type="submit" className="button" disabled={submitting || !location}>
						{submitting ? "Submitting…" : "Submit for review"}
					</button>
				</form>
			</div>

			<div className="card">
				<h2>Schools you&apos;ve brought in</h2>
				{schools && schools.length > 0 ? (
					<div className="table-wrap">
						<table>
							<thead>
								<tr>
									<th>School</th>
									<th>Coordinator</th>
									<th>Location</th>
									<th>Code</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{schools.map((school) => (
									<tr key={school.id}>
										<td>
											<strong>{school.schoolName}</strong>
											<div className="muted" style={{ fontSize: "0.8rem" }}>
												{school.board}
											</div>
										</td>
										<td>
											{school.coordinatorName}
											<div className="muted" style={{ fontSize: "0.8rem" }}>
												{school.coordinatorEmail}
											</div>
										</td>
										<td className="muted">
											{school.city}, {school.state} · {school.pincode}
										</td>
										<td className="text-mono" style={{ fontSize: "0.8rem" }}>
											{school.schoolCode ?? "—"}
										</td>
										<td>
											<span className={STATUS_BADGE[school.status]}>{school.status}</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<div className="empty-state">
						<span className="empty-state__icon">🏫</span>
						No schools yet. Onboard your first one above.
					</div>
				)}
			</div>
		</main>
	);
}
