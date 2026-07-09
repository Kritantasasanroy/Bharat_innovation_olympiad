"use client";

import Link from "next/link";
import { examWindows, participationSummary } from "../../lib/school-data";

/** Overview — Dashboard Access (§2.5) + Participation Summary at a glance (§2.15). */
export default function OverviewPage() {
	const summary = participationSummary();

	const tiles = [
		{ label: "Invited students", value: summary.invited },
		{ label: "Registered", value: summary.registered },
		{ label: "Paid", value: summary.paid },
		{ label: "Completed", value: summary.completed },
	];

	const quickLinks = [
		{ href: "/dashboard/students", icon: "🧑‍🎓", title: "Manage students", desc: "Invited & participating, bulk upload" },
		{ href: "/dashboard/slots", icon: "🗓️", title: "Slots & windows", desc: "Set exam dates, track allocation" },
		{ href: "/dashboard/monitoring", icon: "📡", title: "Live monitoring", desc: "Exam-day participation snapshot" },
		{ href: "/dashboard/results", icon: "📊", title: "Results & analytics", desc: "Scores, percentiles, benchmarking" },
	];

	return (
		<main>
			<div className="page-header">
				<h1>Overview</h1>
				<p className="muted">Welcome back — here&apos;s how your school is tracking.</p>
			</div>

			<div className="stat-row">
				{tiles.map((t) => (
					<div key={t.label} className="stat-tile">
						<span className="stat-tile__label">{t.label}</span>
						<span className="stat-tile__value">{t.value}</span>
					</div>
				))}
			</div>

			<div className="grid-4" style={{ marginBottom: "1.5rem" }}>
				{quickLinks.map((q) => (
					<Link key={q.href} href={q.href} className="card" style={{ textDecoration: "none", color: "inherit", marginBottom: 0 }}>
						<div style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>{q.icon}</div>
						<h3 style={{ marginBottom: "0.25rem" }}>{q.title}</h3>
						<p className="muted mb-0" style={{ fontSize: "0.85rem" }}>{q.desc}</p>
					</Link>
				))}
			</div>

			<div className="card">
				<div className="section-title">
					<h2>Upcoming exam windows</h2>
					<Link href="/dashboard/slots" className="button button--secondary button--small">
						Manage
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
							{examWindows.map((w) => (
								<tr key={w.id}>
									<td>{w.examTitle}</td>
									<td>{new Date(w.startsAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
									<td>
										{w.booked}/{w.capacity}
									</td>
									<td>
										<span
											className={
												w.status === "FULL"
													? "badge badge--pending"
													: w.status === "CLOSED"
														? "badge badge--negative"
														: "badge badge--positive"
											}
										>
											{w.status}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</main>
	);
}
