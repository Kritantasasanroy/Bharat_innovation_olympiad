"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, portalApi } from "../../../../lib/api-client";
import { useAuth } from "../../../../lib/auth-context";
import type { AssignedInstitution } from "../../../../lib/types";

export default function InstitutionDetailPage() {
	const { token } = useAuth();
	const params = useParams<{ institutionId: string }>();
	const institutionId = params.institutionId;
	const [institution, setInstitution] = useState<AssignedInstitution | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!token || !institutionId) return;
		portalApi
			.getInstitution(token, institutionId)
			.then(setInstitution)
			.catch((err: unknown) =>
				setError(
					err instanceof ApiError && err.statusCode === 404
						? "This institution is not assigned to your account."
						: "Failed to load institution.",
				),
			);
	}, [token, institutionId]);

	return (
		<main>
			<p>
				<Link href="/dashboard/institutions">← All institutions</Link>
			</p>

			{error ? <div className="notice notice--error">{error}</div> : null}

			{institution ? (
				<>
					<div className="page-header">
						<h1>{institution.institutionId}</h1>
						<p>Assignment details for this institution.</p>
					</div>
					<div className="card">
						<table>
							<tbody>
								<tr>
									<th>Assigned from</th>
									<td>{new Date(institution.effectiveFrom).toLocaleString()}</td>
								</tr>
								<tr>
									<th>Assignment ended</th>
									<td>
										{institution.effectiveTo
											? new Date(institution.effectiveTo).toLocaleString()
											: "—"}
									</td>
								</tr>
								<tr>
									<th>Status</th>
									<td>
										<span
											className={
												institution.effectiveTo ? "badge badge--negative" : "badge badge--positive"
											}
										>
											{institution.effectiveTo ? "Ended" : "Active"}
										</span>
									</td>
								</tr>
							</tbody>
						</table>
						<p className="muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
							Conversions are attributed per referral campaign, not per institution — see the{" "}
							<Link href="/dashboard/funnel">funnel</Link> for those numbers.
						</p>
					</div>
				</>
			) : !error ? (
				<p className="muted">Loading…</p>
			) : null}
		</main>
	);
}
