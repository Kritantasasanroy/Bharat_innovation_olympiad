"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, portalApi } from "../../../../lib/api-client";
import { useAuth } from "../../../../lib/auth-context";
import type { InstitutionPerformance } from "../../../../lib/types";

export default function InstitutionDetailPage() {
	const { token } = useAuth();
	const params = useParams<{ institutionId: string }>();
	const institutionId = params.institutionId;
	const [institution, setInstitution] = useState<InstitutionPerformance | null>(null);
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
						<h1>{institution.institutionName}</h1>
					</div>
					<div className="stat-row">
						<div className="stat-tile">
							<span className="stat-tile__label">Leads</span>
							<span className="stat-tile__value">{institution.leads}</span>
						</div>
						<div className="stat-tile">
							<span className="stat-tile__label">Signups</span>
							<span className="stat-tile__value">{institution.signups}</span>
						</div>
						<div className="stat-tile">
							<span className="stat-tile__label">Paid conversions</span>
							<span className="stat-tile__value">{institution.paidConversions}</span>
						</div>
					</div>
				</>
			) : !error ? (
				<p className="muted">Loading…</p>
			) : null}
		</main>
	);
}
