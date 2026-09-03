"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
	ApiError,
	type PartnerSchool,
	type PartnerSchoolInput,
	partnerSchoolApi,
} from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { downloadCsv } from "../../../lib/csv";
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
	const [query, setQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const [sortKey, setSortKey] = useState<"name" | "status" | "location">("name");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

	const handleSort = (key: "name" | "status" | "location") => {
		if (sortKey === key) {
			setSortDir(sortDir === "asc" ? "desc" : "asc");
		} else {
			setSortKey(key);
			setSortDir("asc");
		}
	};

	const visibleSchools = (schools ?? [])
		.filter((s) => {
			if (statusFilter && s.status !== statusFilter) return false;
			if (
				query &&
				!s.schoolName.toLowerCase().includes(query.toLowerCase()) &&
				!s.city.toLowerCase().includes(query.toLowerCase()) &&
				!s.coordinatorName.toLowerCase().includes(query.toLowerCase())
			) {
				return false;
			}
			return true;
		})
		.sort((a, b) => {
			let res = 0;
			if (sortKey === "name") {
				res = a.schoolName.localeCompare(b.schoolName);
			} else if (sortKey === "status") {
				res = a.status.localeCompare(b.status);
			} else if (sortKey === "location") {
				res = `${a.city}, ${a.state}`.localeCompare(`${b.city}, ${b.state}`);
			}
			return sortDir === "asc" ? res : -res;
		});

	function exportCsv() {
		downloadCsv(
			"bio-partner-schools.csv",
			[
				"School",
				"Board",
				"UDISE",
				"City",
				"State",
				"Pincode",
				"Coordinator",
				"Email",
				"Phone",
				"Code",
				"Status",
			],
			(schools ?? []).map((s) => [
				s.schoolName,
				s.board,
				s.udiseCode ?? "—",
				s.city,
				s.state,
				s.pincode,
				s.coordinatorName,
				s.coordinatorEmail,
				s.coordinatorPhone ?? "—",
				s.schoolCode ?? "—",
				s.status,
			]),
		);
	}

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
			// 409 can mean one of two things:
			// 1) This coordinator's school is already in the review queue (cold-start retry)
			//    — not an error, just show it in the list.
			// 2) The email already belongs to another Innovation Olympiad account.
			//    — a real error the partner can act on, so show it in red.
			if (cause instanceof ApiError && cause.statusCode === 409) {
				if (cause.message.toLowerCase().includes("bio account")) {
					setError(
						"This email already has an Innovation Olympiad account. Use a different coordinator email, or ask the coordinator to sign in with their existing account.",
					);
				} else {
					setSuccess(
						"This school is already in the Innovation Olympiad review queue — see it in the list below.",
					);
				}
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
					Onboard a school on its behalf. It enters the Innovation Olympiad review queue tagged as
					yours; once approved, the school&apos;s coordinator receives their own access token.
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
							<input
								id="coordinatorPhone"
								name="coordinatorPhone"
								type="tel"
								maxLength={20}
								pattern="^[+0-9][0-9()\\s-]{6,19}$"
								title="Enter a phone number with 7–20 digits"
								autoComplete="tel"
								required
							/>
						</div>
					</div>
					<button type="submit" className="button" disabled={submitting || !location}>
						{submitting ? "Submitting…" : "Submit for review"}
					</button>
				</form>
			</div>

			<div className="card">
				<div className="section-title" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
					<h2>Schools you&apos;ve brought in ({visibleSchools.length})</h2>
					<div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
						<input
							placeholder="Search school, city, coordinator…"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							style={{ maxWidth: 200, fontSize: "0.85rem" }}
						/>
						<select
							value={statusFilter}
							onChange={(e) => setStatusFilter(e.target.value)}
							style={{
								padding: "0.35rem 0.6rem",
								fontSize: "0.85rem",
								borderRadius: "var(--radius-sm)",
							}}
						>
							<option value="">All Statuses</option>
							<option value="APPROVED">Approved</option>
							<option value="PENDING">Pending Review</option>
							<option value="REJECTED">Rejected</option>
						</select>
						<select
							value={`${sortKey}-${sortDir}`}
							onChange={(e) => {
								const [k, d] = e.target.value.split("-") as [
									"name" | "status" | "location",
									"asc" | "desc",
								];
								setSortKey(k);
								setSortDir(d);
							}}
							style={{
								padding: "0.35rem 0.6rem",
								fontSize: "0.85rem",
								borderRadius: "var(--radius-sm)",
							}}
						>
							<option value="name-asc">Sort: School Name (A → Z)</option>
							<option value="name-desc">Sort: School Name (Z → A)</option>
							<option value="location-asc">Sort: Location (City/State)</option>
							<option value="status-asc">Sort: Status</option>
						</select>
						<button
							type="button"
							className="button button--secondary button--small"
							onClick={exportCsv}
							disabled={!schools || schools.length === 0}
						>
							Download CSV
						</button>
					</div>
				</div>
				{visibleSchools.length > 0 ? (
					<div className="table-wrap">
						<table>
							<thead>
								<tr>
									<th
										onClick={() => handleSort("name")}
										style={{ cursor: "pointer", userSelect: "none" }}
									>
										School {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
									</th>
									<th>Coordinator</th>
									<th
										onClick={() => handleSort("location")}
										style={{ cursor: "pointer", userSelect: "none" }}
									>
										Location {sortKey === "location" ? (sortDir === "asc" ? "↑" : "↓") : ""}
									</th>
									<th>Code</th>
									<th
										onClick={() => handleSort("status")}
										style={{ cursor: "pointer", userSelect: "none" }}
									>
										Status {sortKey === "status" ? (sortDir === "asc" ? "↑" : "↓") : ""}
									</th>
								</tr>
							</thead>
							<tbody>
								{visibleSchools.map((school) => (
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
						{schools && schools.length === 0
							? "No schools onboarded yet. Fill in the form above to onboard your first partner school."
							: "No schools match the filter."}
					</div>
				)}
			</div>
		</main>
	);
}
