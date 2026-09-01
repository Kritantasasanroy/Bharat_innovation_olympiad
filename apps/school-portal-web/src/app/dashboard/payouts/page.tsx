"use client";

import { type FormEvent, useCallback, useState } from "react";
import { ApiError, type BankDetails, type Payout, portalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { useResource } from "../../../lib/use-resource";

function rupeesFromPaise(paise: number): string {
	return `₹${(paise / 100).toLocaleString("en-IN", {
		maximumFractionDigits: 2,
		minimumFractionDigits: 2,
	})}`;
}

export default function SchoolPayoutsPage() {
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
				portalApi.payouts(token),
				portalApi.bankDetails(token),
			]);
			setPayouts(payoutList);
			setBankDetails(details);
			setError(null);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not load payouts.");
		}
	}, [token]);

	useResource(load);

	async function handleSubmitBankDetails(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token) return;
		setSubmitting(true);
		setError(null);
		setNotice(null);

		const form = new FormData(event.currentTarget);
		try {
			const saved = await portalApi.submitBankDetails(token, {
				accountHolderName: String(form.get("accountHolderName") ?? "").trim(),
				bankName: String(form.get("bankName") ?? "").trim(),
				ifscCode: String(form.get("ifscCode") ?? "").trim(),
				accountNumber: String(form.get("accountNumber") ?? "").trim(),
				pan: String(form.get("pan") ?? "").trim(),
			});
			setBankDetails(saved);
			setEditingBankDetails(false);
			setNotice("Bank details saved successfully. Payouts will be credited to this account.");
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
				<h1>Payouts &amp; Rewards</h1>
				<p className="muted">
					Institutional rewards and payouts triggered for your school by the Innovation Olympiad
					admin team.
				</p>
			</div>

			{error && <div className="notice notice--error">{error}</div>}
			{notice && <div className="notice notice--positive">{notice}</div>}

			<div className="card">
				<h2>Payout History</h2>
				{payouts ? (
					payouts.length === 0 ? (
						<div className="empty-state">
							<span className="empty-state__icon">💳</span>
							No payouts triggered yet. Innovation Olympiad staff trigger institutional payouts
							based on cohort size and participation.
						</div>
					) : (
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Amount</th>
										<th>Note / Reason</th>
										<th>Status</th>
										<th>Triggered Date</th>
										<th>Paid Date</th>
									</tr>
								</thead>
								<tbody>
									{payouts.map((p) => (
										<tr key={p.id}>
											<td style={{ fontWeight: 700, fontSize: "1.05rem" }}>
												{rupeesFromPaise(p.amountPaise)}
											</td>
											<td>{p.note || "Institutional reward / payout"}</td>
											<td>
												<span
													className={
														p.status === "PAID" ? "badge badge--positive" : "badge badge--pending"
													}
												>
													{p.status}
												</span>
											</td>
											<td className="muted">
												{new Date(p.triggeredAt).toLocaleDateString("en-IN", {
													dateStyle: "medium",
												})}
											</td>
											<td className="muted">
												{p.paidAt
													? new Date(p.paidAt).toLocaleDateString("en-IN", {
															dateStyle: "medium",
														})
													: "Pending transfer"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)
				) : (
					<p className="muted mb-0">Loading payouts…</p>
				)}
			</div>

			{(payouts?.length ?? 0) > 0 && (
				<div className="card">
					<div className="row-between">
						<h2>Bank Details for Payout Transfer</h2>
						{bankDetails && !editingBankDetails && (
							<button
								type="button"
								className="button button--secondary button--small"
								onClick={() => setEditingBankDetails(true)}
							>
								Update Details
							</button>
						)}
					</div>

					{bankDetailsRequired && !editingBankDetails && (
						<div className="notice notice--warn" style={{ marginBottom: "1rem" }}>
							You have a pending payout. Please submit your school's bank account details below to
							receive your transfer.
						</div>
					)}

					{bankDetails && !editingBankDetails ? (
						<div
							style={{
								background: "var(--bg-primary)",
								padding: "1rem",
								borderRadius: "var(--radius-md)",
								border: "1px solid var(--border-subtle)",
							}}
						>
							<div className="grid-2" style={{ gap: "0.75rem" }}>
								<div>
									<span className="muted" style={{ fontSize: "0.8rem" }}>
										Account Holder
									</span>
									<div>
										<strong>{bankDetails.accountHolderName}</strong>
									</div>
								</div>
								<div>
									<span className="muted" style={{ fontSize: "0.8rem" }}>
										Bank Name
									</span>
									<div>
										<strong>{bankDetails.bankName}</strong>
									</div>
								</div>
								<div>
									<span className="muted" style={{ fontSize: "0.8rem" }}>
										Account Number
									</span>
									<div>
										<strong className="text-mono">••••••••{bankDetails.accountNumberLast4}</strong>
									</div>
								</div>
								<div>
									<span className="muted" style={{ fontSize: "0.8rem" }}>
										IFSC Code
									</span>
									<div>
										<strong className="text-mono">{bankDetails.ifscCode}</strong>
									</div>
								</div>
								<div>
									<span className="muted" style={{ fontSize: "0.8rem" }}>
										PAN
									</span>
									<div>
										<strong className="text-mono">{bankDetails.panMasked}</strong>
									</div>
								</div>
								<div>
									<span className="muted" style={{ fontSize: "0.8rem" }}>
										Last Updated
									</span>
									<div className="muted">
										{new Date(bankDetails.updatedAt).toLocaleDateString("en-IN")}
									</div>
								</div>
							</div>
						</div>
					) : (
						<form
							onSubmit={handleSubmitBankDetails}
							className="form-grid"
							style={{ maxWidth: 500 }}
						>
							<div>
								<label htmlFor="accountHolderName">
									Account Holder Name (School / Trust / Society)
								</label>
								<input
									id="accountHolderName"
									name="accountHolderName"
									required
									defaultValue={bankDetails?.accountHolderName || ""}
									placeholder="e.g. Delhi Public School Society"
								/>
							</div>

							<div>
								<label htmlFor="bankName">Bank Name</label>
								<input
									id="bankName"
									name="bankName"
									required
									defaultValue={bankDetails?.bankName || ""}
									placeholder="e.g. State Bank of India"
								/>
							</div>

							<div className="grid-2" style={{ gap: "0.75rem" }}>
								<div>
									<label htmlFor="ifscCode">IFSC Code</label>
									<input
										id="ifscCode"
										name="ifscCode"
										required
										defaultValue={bankDetails?.ifscCode || ""}
										placeholder="SBIN0001234"
									/>
								</div>
								<div>
									<label htmlFor="pan">PAN Number</label>
									<input id="pan" name="pan" required placeholder="ABCDE1234F" />
								</div>
							</div>

							<div>
								<label htmlFor="accountNumber">Account Number</label>
								<input
									id="accountNumber"
									name="accountNumber"
									type="password"
									required
									placeholder="Enter full bank account number"
								/>
							</div>

							<div className="row" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
								<button type="submit" className="button" disabled={submitting}>
									{submitting ? "Saving…" : "Save Bank Details"}
								</button>
								{bankDetails && (
									<button
										type="button"
										className="button button--secondary"
										onClick={() => setEditingBankDetails(false)}
									>
										Cancel
									</button>
								)}
							</div>
						</form>
					)}
				</div>
			)}
		</main>
	);
}
