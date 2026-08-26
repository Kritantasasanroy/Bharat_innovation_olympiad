"use client";

import Link from "next/link";
import { SchoolStepGuide } from "../../components/step-guide";
import { portalApi } from "../../lib/api-client";
import { useResource } from "../../lib/use-resource";

/** Overview — Dashboard Access (§2.5) + Participation Summary at a glance (§2.15). */
export default function OverviewPage() {
	const { data: overview, loading, error, errorStatus } = useResource(portalApi.overview);

	const tiles = [
		{ label: "Invited students", value: overview?.invited ?? 0 },
		{ label: "Registered", value: overview?.registered ?? 0 },
		{ label: "Exam completed", value: overview?.completed ?? 0 },
	];

	const quickLinks = [
		{
			href: "/dashboard/students",
			icon: "🧑‍🎓",
			title: "Manage students",
			desc: "Invite students, view participation",
		},
		{
			href: "/dashboard/monitoring",
			icon: "📡",
			title: "Live monitoring",
			desc: "Exam-day participation snapshot",
		},
		{
			href: "/dashboard/results",
			icon: "📊",
			title: "Results & analytics",
			desc: "Scores, percentiles, benchmarking",
		},
	];

	return (
		<main>
			<div className="page-header">
				<h1>Overview</h1>
				<p className="muted">Welcome back — here&apos;s how your school is tracking.</p>
			</div>

			{error && (
				<div className="notice notice--error" role="alert">
					{errorStatus === 401 || errorStatus === 403
						? "Your session expired or this school no longer has access. Sign out and sign in again with a current access token."
						: error}
				</div>
			)}

			<SchoolStepGuide defaultOpen={false} />

			<div className="stat-row">
				{tiles.map((t) => (
					<div key={t.label} className="stat-tile">
						<span className="stat-tile__label">{t.label}</span>
						<span className="stat-tile__value">{loading ? "…" : t.value}</span>
					</div>
				))}
			</div>

			<div className="grid-4" style={{ marginBottom: "1.5rem" }}>
				{quickLinks.map((q) => (
					<Link
						key={q.href}
						href={q.href}
						className="card"
						style={{ textDecoration: "none", color: "inherit", marginBottom: 0 }}
					>
						<div style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>{q.icon}</div>
						<h3 style={{ marginBottom: "0.25rem" }}>{q.title}</h3>
						<p className="muted mb-0" style={{ fontSize: "0.85rem" }}>
							{q.desc}
						</p>
					</Link>
				))}
			</div>
		</main>
	);
}
