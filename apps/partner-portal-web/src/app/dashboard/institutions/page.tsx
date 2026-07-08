"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, portalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import type { InstitutionPerformance } from "../../../lib/types";

export default function InstitutionsPage() {
	const { token } = useAuth();
	const [institutions, setInstitutions] = useState<readonly InstitutionPerformance[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!token) return;
		portalApi
			.getInstitutions(token)
			.then((data) => setInstitutions(data.institutions))
			.catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Failed to load"));
	}, [token]);

	return (
		<main>
			<div className="page-header">
				<h1>Institutions</h1>
				<p>All institutions assigned to you, with performance for each.</p>
			</div>

			{error ? <div className="notice notice--error">{error}</div> : null}

			{institutions ? (
				<div className="card">
					<div className="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Institution</th>
									<th>Leads</th>
									<th>Signups</th>
									<th>Paid conversions</th>
									<th />
								</tr>
							</thead>
							<tbody>
								{institutions.map((institution) => (
									<tr key={institution.institutionId}>
										<td>{institution.institutionName}</td>
										<td>{institution.leads}</td>
										<td>{institution.signups}</td>
										<td>{institution.paidConversions}</td>
										<td>
											<Link href={`/dashboard/institutions/${institution.institutionId}`}>
												Details →
											</Link>
										</td>
									</tr>
								))}
								{institutions.length === 0 ? (
									<tr>
										<td colSpan={5} className="muted">
											No institutions assigned yet — check back once you have referred one.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</div>
			) : !error ? (
				<p className="muted">Loading…</p>
			) : null}
		</main>
	);
}
