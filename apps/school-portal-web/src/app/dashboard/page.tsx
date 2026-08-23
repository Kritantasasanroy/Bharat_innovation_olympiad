"use client";

import Link from "next/link";
import { portalApi } from "../../lib/api-client";
import { useResource } from "../../lib/use-resource";

/** Overview — Dashboard Access (§2.5) + Participation Summary at a glance (§2.15). */
export default function OverviewPage() {
	const { data: overview, loading, error, errorStatus } = useResource(portalApi.overview);
	const { data: slots } = useResource(portalApi.slots);

	const tiles = [
		{ label: "Invited students", value: overview?.invited ?? 0 },
		{ label: "Registered", value: overview?.registered ?? 0 },
		{ label: "Paid", value: overview?.paid ?? 0 },
		{ label: "Completed", value: overview?.completed ?? 0 },
	];

	const quickLinks = [
		{
			href: "/dashboard/students",
			icon: "🧑‍🎓",
			title: "Manage students",
			desc: "Invite students, view participation",
		},
		{
			href: "/dashboard/slots",
			icon: "🗓️",
			title: "Slots & windows",
			desc: "Your allocated exam windows",
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

			<div className="card">
				<div className="section-title">
					<h2>Your exam windows</h2>
					<Link href="/dashboard/slots" className="button button--secondary button--small">
						View all
					</Link>
				</div>
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Exam</th>
								<th>Date</th>
								<th>Seats</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{/* The slots endpoint now returns the whole board per exam, not just
							    the one slot staff assigned. Pick out our own, and say plainly when
							    we hold none rather than rendering a blank row. */}
							{(slots ?? []).map((board) => {
								const ours = board.slots.find((s) => s.isAssignedToUs) ?? null;

								return (
									<tr key={board.examInstanceId}>
										<td>{board.examTitle}</td>
										<td>
											{new Date(ours?.startsAt ?? board.startsAt).toLocaleString("en-IN", {
												dateStyle: "medium",
												timeStyle: "short",
											})}
										</td>
										<td>{ours ? `${ours.booked}/${ours.capacity}` : "—"}</td>
										<td>
											{ours ? (
												<span
													className={
														ours.remaining <= 0 ? "badge badge--pending" : "badge badge--positive"
													}
												>
													{ours.remaining <= 0 ? "FULL" : "OPEN"}
												</span>
											) : (
												<a href="/dashboard/slots" className="badge badge--pending">
													Pick a slot
												</a>
											)}
										</td>
									</tr>
								);
							})}
							{slots && slots.length === 0 && (
								<tr>
									<td
										colSpan={4}
										className="muted"
										style={{ textAlign: "center", padding: "1.5rem" }}
									>
										No exam windows allocated yet. Staff assign your slots once your school is set
										up.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>
		</main>
	);
}
