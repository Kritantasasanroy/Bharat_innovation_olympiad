"use client";

import { type FormEvent, useCallback, useState } from "react";
import { StatusBadge } from "../../../components/status-badge";
import { ApiError, portalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import type { Payout, Statement } from "../../../lib/types";
import { usePoll } from "../../../lib/use-poll";

function rupeesFromPaise(paise: number): string {
	return `₹${(paise / 100).toLocaleString("en-IN", {
		maximumFractionDigits: 2,
		minimumFractionDigits: 2,
	})}`;
}

export default function PayoutsPage() {
	const { token } = useAuth();
	const [statements, setStatements] = useState<Statement[] | null>(null);
	const [payouts, setPayouts] = useState<Payout[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [period, setPeriod] = useState("");
	const [requesting, setRequesting] = useState(false);

	const load = useCallback(async () => {
		if (!token) return;
		try {
			const [statementList, payoutList] = await Promise.all([
				portalApi.listStatements(token),
				portalApi.listPayouts(token),
			]);
			setStatements(statementList);
			setPayouts(payoutList);
			setError(null);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not load your commission records.");
		}
	}, [token]);

	usePoll(load);

	async function handleGenerate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token || !period) return;
		setRequesting(true);
		setError(null);
		setNotice(null);
		try {
			await portalApi.requestStatement(token, { period });
			setPeriod("");
			setNotice(`Statement requested for ${period}. Refreshing the ledger.`);
			await load();
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not generate a statement.");
		} finally {
			setRequesting(false);
		}
	}

	return (
		<main>
			<div className="page-header">
				<h1>Payouts &amp; statements</h1>
				<p>
					Statements are issued for a calendar month. The payout ledger shows the finance status for
					each issued statement; only BIO staff can sign off or release a payout.
				</p>
			</div>

			{error ? <div className="notice notice--error">{error}</div> : null}
			{notice ? <div className="notice notice--success">{notice}</div> : null}

			<div className="card">
				<h2>Request a statement</h2>
				<p className="muted">
					Choose a month in which you had credited paid conversions. If a statement already exists,
					BIO will issue a new version rather than overwriting the earlier record.
				</p>
				<form
					onSubmit={handleGenerate}
					style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}
				>
					<div>
						<label htmlFor="period">Statement month</label>
						<input
							id="period"
							type="month"
							required
							value={period}
							onChange={(event) => setPeriod(event.target.value)}
						/>
					</div>
					<button type="submit" className="button" disabled={requesting || !period}>
						{requesting ? "Requesting…" : "Generate statement"}
					</button>
				</form>
			</div>

			<div className="card">
				<h2>Commission statements</h2>
				{statements ? (
					statements.length === 0 ? (
						<div className="empty-state">
							No statements yet. Request your first statement above after a paid conversion is
							credited.
						</div>
					) : (
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Period</th>
										<th>Version</th>
										<th>Commission</th>
										<th>Status</th>
										<th>Issued</th>
									</tr>
								</thead>
								<tbody>
									{statements.map((statement) => (
										<tr key={statement.id}>
											<td>{statement.period}</td>
											<td>{statement.version}</td>
											<td>{rupeesFromPaise(statement.totalPaise)}</td>
											<td>
												<StatusBadge status={statement.status} />
											</td>
											<td>{new Date(statement.issuedAt).toLocaleDateString("en-IN")}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)
				) : !error ? (
					<p className="muted">Loading statements…</p>
				) : null}
			</div>

			<div className="card">
				<h2>Payout ledger</h2>
				{payouts ? (
					payouts.length === 0 ? (
						<div className="empty-state">
							No payout entries yet. A ledger entry appears when a statement is issued.
						</div>
					) : (
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Amount</th>
										<th>Status</th>
										<th>Finance sign-off</th>
										<th>Created</th>
									</tr>
								</thead>
								<tbody>
									{payouts.map((payout) => (
										<tr key={payout.id}>
											<td>{rupeesFromPaise(payout.amountPaise)}</td>
											<td>
												<StatusBadge status={payout.status} />
											</td>
											<td>{payout.financeSignOffApprover ?? "Pending"}</td>
											<td>{new Date(payout.createdAt).toLocaleDateString("en-IN")}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)
				) : !error ? (
					<p className="muted">Loading payout ledger…</p>
				) : null}
			</div>
		</main>
	);
}
