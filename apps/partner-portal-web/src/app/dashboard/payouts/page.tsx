"use client";

import { type FormEvent, useCallback, useState } from "react";
import { StatusBadge } from "../../../components/status-badge";
import { ApiError, partnerPortalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import type { BankDetails, Payout } from "../../../lib/types";
import { usePoll } from "../../../lib/use-poll";

function rupeesFromPaise(paise: number): string {
	return `₹${(paise / 100).toLocaleString("en-IN", {
		maximumFractionDigits: 2,
		minimumFractionDigits: 2,
	})}`;
}

export default function PayoutsPage() {
	const { token } = useAuth();
	const [payouts, setPayouts] = useState<Payout[] | null>(null);
	const [bankDetails, setBankDetails] = useState<BankDetails | null | undefined>(undefined);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [editingBankDetails, setEditingBankDetails] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	const load = useCallback(async () => {
		if (!token) return;
		try {
			const [payoutList, details] = await Promise.all([
				partnerPortalApi.payouts(token),
				partnerPortalApi.bankDetails(token),
			]);
			setPayouts(payoutList);
			setBankDetails(details);
			setError(null);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not load your payouts.");
		}
	}, [token]);

	usePoll(load);

	async function handleSubmitBankDetails(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token) return;
		setSubmitting(true);
		setError(null);
		setNotice(null);

		const form = new FormData(event.currentTarget);
		try {
			const saved = await partnerPortalApi.submitBankDetails(token, {
				accountHolderName: String(form.get("accountHolderName") ?? "").trim(),
				bankName: String(form.get("bankName") ?? "").trim(),
				ifscCode: String(form.get("ifscCode") ?? "").trim(),
				accountNumber: String(form.get("accountNumber") ?? "").trim(),
				pan: String(form.get("pan") ?? "").trim(),
			});
			setBankDetails(saved);
			setEditingBankDetails(false);
			setNotice("Bank details saved. We've emailed you a confirmation.");
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not save your bank details.");
		} finally {
			setSubmitting(false);
		}
	}

	const bankDetailsRequired = (payouts?.length ?? 0) > 0 && bankDetails === null;

	return (
		<main>
			<div className="page-header">
				<h1>Payouts</h1>
				<p>
					No fixed commission — Innovation Olympiad staff decide each payout amount and trigger it
					directly. It shows up here the moment it's triggered.
				</p>
			</div>

			{error ? <div className="notice notice--error">{error}</div> : null}
			{notice ? <div className="notice notice--success">{notice}</div> : null}

			<div className="card">
				<h2>Payout history</h2>
				{payouts ? (
					payouts.length === 0 ? (
						<div className="empty-state">
							No payouts yet. Innovation Olympiad staff trigger one when it's time to pay you —
							it'll appear here.
						</div>
					) : (
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Amount</th>
										<th>Note</th>
										<th>Status</th>
										<th>Triggered</th>
									</tr>
								</thead>
								<tbody>
									{payouts.map((payout) => (
										<tr key={payout.id}>
											<td>{rupeesFromPaise(payout.amountPaise)}</td>
											<td>{payout.note ?? "—"}</td>
											<td>
												<StatusBadge status={payout.status} />
											</td>
											<td>{new Date(payout.triggeredAt).toLocaleDateString("en-IN")}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)
				) : !error ? (
					<p className="muted">Loading payouts…</p>
				) : null}
			</div>

			{bankDetailsRequired || editingBankDetails ? (
				<div className="card" style={{ borderColor: "var(--accent-500)" }}>
					<h2>{bankDetails ? "Update bank details" : "Add your bank details"}</h2>
					{!bankDetails ? (
						<div className="notice notice--warn" role="alert" style={{ marginBottom: "1rem" }}>
							A payout has been triggered for you — add where it should be sent. Double-check every
							field before saving: Innovation Olympiad cannot verify account ownership
							automatically, and a mistake here could send money to the wrong account.
						</div>
					) : null}
					<form
						className="form-grid"
						onSubmit={handleSubmitBankDetails}
						style={{ maxWidth: "none" }}
					>
						<div className="grid-2" style={{ gap: "1rem" }}>
							<div>
								<label htmlFor="accountHolderName">Account holder name</label>
								<input
									id="accountHolderName"
									name="accountHolderName"
									maxLength={200}
									required
									defaultValue={bankDetails?.accountHolderName}
								/>
							</div>
							<div>
								<label htmlFor="bankName">Bank name</label>
								<input
									id="bankName"
									name="bankName"
									maxLength={200}
									required
									defaultValue={bankDetails?.bankName}
								/>
							</div>
						</div>
						<div className="grid-2" style={{ gap: "1rem" }}>
							<div>
								<label htmlFor="ifscCode">IFSC code</label>
								<input
									id="ifscCode"
									name="ifscCode"
									maxLength={11}
									required
									spellCheck={false}
									style={{ textTransform: "uppercase" }}
									placeholder="HDFC0001234"
									defaultValue={bankDetails?.ifscCode}
								/>
							</div>
							<div>
								<label htmlFor="accountNumber">Account number</label>
								<input
									id="accountNumber"
									name="accountNumber"
									inputMode="numeric"
									maxLength={18}
									required
									autoComplete="off"
									placeholder={
										bankDetails
											? `Currently ending ${bankDetails.accountNumberLast4.slice(-4)}`
											: undefined
									}
								/>
							</div>
						</div>
						<div>
							<label htmlFor="pan">PAN</label>
							<input
								id="pan"
								name="pan"
								maxLength={10}
								required
								spellCheck={false}
								autoComplete="off"
								style={{ textTransform: "uppercase" }}
								placeholder="ABCDE1234F"
							/>
						</div>
						<p className="muted" style={{ fontSize: "0.85rem" }}>
							Your account number and PAN are encrypted before they're stored, and only Innovation
							Olympiad staff processing your payout can view them.
						</p>
						<div className="inline">
							<button type="submit" className="button" disabled={submitting}>
								{submitting ? "Saving…" : "Save bank details"}
							</button>
							{bankDetails ? (
								<button
									type="button"
									className="button button--secondary"
									onClick={() => setEditingBankDetails(false)}
									disabled={submitting}
								>
									Cancel
								</button>
							) : null}
						</div>
					</form>
				</div>
			) : bankDetails ? (
				<div className="card">
					<div className="row-between">
						<h2>Bank details on file</h2>
						<button
							type="button"
							className="button button--secondary"
							onClick={() => setEditingBankDetails(true)}
						>
							Update
						</button>
					</div>
					<div className="profile-grid">
						<div className="profile-field">
							<span className="profile-field__label">Account holder</span>
							<span>{bankDetails.accountHolderName}</span>
						</div>
						<div className="profile-field">
							<span className="profile-field__label">Bank</span>
							<span>{bankDetails.bankName}</span>
						</div>
						<div className="profile-field">
							<span className="profile-field__label">IFSC</span>
							<span>{bankDetails.ifscCode}</span>
						</div>
						<div className="profile-field">
							<span className="profile-field__label">Account number</span>
							<span>{bankDetails.accountNumberLast4}</span>
						</div>
						<div className="profile-field">
							<span className="profile-field__label">PAN</span>
							<span>{bankDetails.panMasked}</span>
						</div>
					</div>
				</div>
			) : null}
		</main>
	);
}
