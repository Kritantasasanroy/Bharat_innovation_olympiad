"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, portalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import type { AssignedInstitution } from "../../../lib/types";

export default function InstitutionsPage() {
	const { token } = useAuth();
	const [institutions, setInstitutions] = useState<readonly AssignedInstitution[] | null>(null);
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
				<p>
					Institutions the BIO team has assigned to you. Conversions are tracked per referral
					campaign rather than per institution — see the funnel for those numbers.
				</p>
			</div>

			{error ? <div className="notice notice--error">{error}</div> : null}

			{institutions ? (
				<div className="card">
					<div className="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Institution</th>
									<th>Assigned from</th>
									<th>Status</th>
									<th />
								</tr>
							</thead>
							<tbody>
								{institutions.map((institution) => (
									<tr key={institution.institutionId}>
										<td>{institution.institutionId}</td>
										<td className="muted">
											{new Date(institution.effectiveFrom).toLocaleDateString()}
										</td>
										<td>
											<span
												className={
													institution.effectiveTo ? "badge badge--negative" : "badge badge--positive"
												}
											>
												{institution.effectiveTo ? "Ended" : "Active"}
											</span>
										</td>
										<td>
											<Link href={`/dashboard/institutions/${institution.institutionId}`}>
												Details →
											</Link>
										</td>
									</tr>
								))}
								{institutions.length === 0 ? (
									<tr>
										<td colSpan={4} className="muted">
											No institutions assigned yet — the BIO team assigns these.
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
