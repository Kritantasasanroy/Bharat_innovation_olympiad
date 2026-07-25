"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { StatusBadge } from "../../../components/status-badge";
import { ApiError, portalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import type { Statement } from "../../../lib/types";

export default function PayoutsPage() {
	const { token } = useAuth();
	const [statements, setStatements] = useState<Statement[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [periodStart, setPeriodStart] = useState("");
	const [periodEnd, setPeriodEnd] = useState("");
	const [requesting, setRequesting] = useState(false);

	const load = useCallback(async () => {
		if (!token) return;
		try {
			const data = await portalApi.listStatements(token);
			setStatements(data);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Failed to load statements.");
		}
	}, [token]);

	useEffect(() => {
		void load();
	}, [load]);

	async function handleGenerate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token || !periodStart || !periodEnd) return;
		setRequesting(true);
		setError(null);
		try {
			await portalApi.requestStatement(token, { periodStart, periodEnd });
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
				<h1>Payouts & statements</h1>
				<p>
					Commission statements are generated automatically each period. You can also request one
					for a specific period below. Payout release status — including finance sign-off — is shown
					per statement.
				</p>
			</div>

			{error ? <div className="notice notice--error">{error}</div> : null}

			<div className="card">
				<h2>Request a statement</h2>
				<form
					onSubmit={handleGenerate}
					style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}
				>
					<div>
						<label htmlFor="periodStart">Period start</label>
						<input
							id="periodStart"
							type="date"
							required
							value={periodStart}
							onChange={(event) => setPeriodStart(event.target.value)}
						/>
					</div>
					<div>
						<label htmlFor="periodEnd">Period end</label>
						<input
							id="periodEnd"
							type="date"
							required
							value={periodEnd}
							onChange={(event) => setPeriodEnd(event.target.value)}
						/>
					</div>
					<button type="submit" className="button" disabled={requesting}>
						{requesting ? "Requesting…" : "Generate statement"}
					</button>
				</form>
			</div>

			<div className="card">
				<h2>Statement & payout ledger</h2>
				{statements ? (
					<div className="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Period</th>
									<th>Commission</th>
									<th>Payout status</th>
									<th>Finance sign-off</th>
									<th>Generated</th>
									<th>Statement</th>
								</tr>
							</thead>
							<tbody>
								{statements.map((statement) => (
									<tr key={statement.id}>
										<td>
											{statement.periodStart} → {statement.periodEnd}
										</td>
										<td>
											{statement.currency} {statement.totalCommission.toLocaleString()}
										</td>
										<td>
											<StatusBadge status={statement.payoutStatus} />
										</td>
										<td>{statement.financeSignOff ? "Signed off" : "Pending"}</td>
										<td>{new Date(statement.generatedAt).toLocaleDateString()}</td>
										<td>
											{statement.downloadUrl ? (
												<a href={statement.downloadUrl} target="_blank" rel="noreferrer">
													Download
												</a>
											) : (
												<span className="muted">Not ready</span>
											)}
										</td>
									</tr>
								))}
								{statements.length === 0 ? (
									<tr>
										<td colSpan={6} className="muted">
											No statements yet.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				) : !error ? (
					<p className="muted">Loading…</p>
				) : null}
			</div>
		</main>
	);
}
