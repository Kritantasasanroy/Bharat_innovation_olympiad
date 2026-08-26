"use client";

import { useState } from "react";

interface Step {
	number: string;
	title: string;
	tagline: string;
	description: string;
	actionHref?: string;
	actionLabel?: string;
}

const SCHOOL_STEPS: Step[] = [
	{
		number: "01",
		title: "School Profile & Setup",
		tagline: "Verify institutional details",
		description:
			"Ensure your school board, UDISE code, and coordinator contact info are up to date under Profile & roles so students and BIO coordinators can reach you seamlessly.",
		actionHref: "/dashboard/profile",
		actionLabel: "View profile",
	},
	{
		number: "02",
		title: "Onboard Students (Link or CSV)",
		tagline: "Invite your student cohort",
		description:
			"Share your unique School Referral Link with parents and students via WhatsApp/circulars, or bulk upload your student roster with a CSV. Students get automatically linked to your school.",
		actionHref: "/dashboard/students",
		actionLabel: "Manage students",
	},
	{
		number: "03",
		title: "Exam Windows & Slot Calendar",
		tagline: "Check dates & scheduled students",
		description:
			"View upcoming exam dates in the Slot Calendar. Check the list of your students scheduled for each date and slot window.",
		actionHref: "/dashboard/slots",
		actionLabel: "View slot calendar",
	},
	{
		number: "04",
		title: "Live Exam-Day Monitoring",
		tagline: "Watch attempts in real time",
		description:
			"On exam day, track which students are currently in progress, auto-submitted, or completed via the live monitoring snapshot.",
		actionHref: "/dashboard/monitoring",
		actionLabel: "Live monitoring",
	},
	{
		number: "05",
		title: "Results, Analytics & Certificates",
		tagline: "Scores, percentiles & awards",
		description:
			"Once results are officially released, access class-wise performance analytics, national/state percentiles, and download formatted Excel report cards.",
		actionHref: "/dashboard/results",
		actionLabel: "View results",
	},
	{
		number: "06",
		title: "Payouts & Institutional Rewards",
		tagline: "Claim institutional incentives",
		description:
			"When institutional rewards or payouts are triggered by the BIO admin team, the Payouts tab appears automatically. Add your bank details to receive payouts directly.",
		actionHref: "/dashboard/payouts",
		actionLabel: "View payouts",
	},
];

export function SchoolStepGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<div
			className="card"
			style={{ marginBottom: "1.5rem", borderLeft: "4px solid var(--accent-400)" }}
		>
			<div className="row-between">
				<div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
					<span style={{ fontSize: "1.3rem" }}>📘</span>
					<div>
						<h3 style={{ margin: 0, fontSize: "1.05rem" }}>
							School Workflow &amp; Step-by-Step Guide
						</h3>
						<p className="muted mb-0" style={{ fontSize: "0.82rem" }}>
							6 easy steps to manage your school's Bharat Innovation Olympiad participation
						</p>
					</div>
				</div>
				<button
					type="button"
					className="button button--secondary button--small"
					onClick={(e) => {
						e.stopPropagation();
						setOpen(!open);
					}}
				>
					{open ? "Hide Guide ▲" : "Show Step Guide ▼"}
				</button>
			</div>

			{open && (
				<div
					style={{
						marginTop: "1.2rem",
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
						gap: "0.9rem",
					}}
				>
					{SCHOOL_STEPS.map((step) => (
						<div
							key={step.number}
							style={{
								padding: "1rem",
								borderRadius: "var(--radius-md)",
								background: "var(--bg-primary)",
								border: "1px solid var(--border-subtle)",
								display: "flex",
								flexDirection: "column",
								justifyContent: "space-between",
							}}
						>
							<div>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: "0.5rem",
										marginBottom: "0.35rem",
									}}
								>
									<span
										style={{
											fontWeight: 800,
											fontSize: "0.75rem",
											background: "var(--gradient-brand)",
											color: "var(--text-on-primary)",
											padding: "2px 7px",
											borderRadius: "var(--radius-sm)",
										}}
									>
										Step {step.number}
									</span>
									<strong style={{ fontSize: "0.92rem", color: "var(--text-primary)" }}>
										{step.title}
									</strong>
								</div>
								<div
									style={{
										fontSize: "0.75rem",
										color: "var(--accent-500)",
										fontWeight: 600,
										marginBottom: "0.4rem",
									}}
								>
									{step.tagline}
								</div>
								<p className="muted" style={{ fontSize: "0.8rem", lineHeight: 1.45, margin: 0 }}>
									{step.description}
								</p>
							</div>
							{step.actionHref && (
								<div style={{ marginTop: "0.75rem" }}>
									<a
										href={step.actionHref}
										className="button button--secondary button--small"
										style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
									>
										{step.actionLabel} →
									</a>
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
