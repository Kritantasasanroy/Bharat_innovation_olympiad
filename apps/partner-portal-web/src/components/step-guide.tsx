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

const PARTNER_STEPS: Step[] = [
	{
		number: "01",
		title: "Partner Activation & Profile",
		tagline: "Set up your partner identity",
		description:
			"Complete your partner profile, regional preferences, and contact details to represent Bharat Innovation Olympiad in your territory.",
		actionHref: "/dashboard/profile",
		actionLabel: "View profile",
	},
	{
		number: "02",
		title: "Create Dedicated Campaigns",
		tagline: "Separate Student & School drives",
		description:
			"Create distinct Student Campaigns (with student registration links & QR codes) and School Campaigns (for onboarding schools and institutions).",
		actionHref: "/dashboard/campaigns",
		actionLabel: "Campaigns & links",
	},
	{
		number: "03",
		title: "Share & Distribute Links",
		tagline: "Amplify across your network",
		description:
			"Share your unique referral links with educators, institutions, parent groups, and students. Every signup is permanently attributed to your partner code.",
		actionHref: "/dashboard/campaigns",
		actionLabel: "Get links",
	},
	{
		number: "04",
		title: "Track Funnel & Milestones",
		tagline: "Live conversion analytics",
		description:
			"Monitor the conversion funnel: Signups → Registrations → Exam Completions, plus institutional approvals.",
		actionHref: "/dashboard/funnel",
		actionLabel: "View funnel",
	},
	{
		number: "05",
		title: "Manage Schools & Students",
		tagline: "Institutional roster visibility",
		description:
			"View every approved school and registered student in your network. Check their participation, exam status, and release results.",
		actionHref: "/dashboard/schools",
		actionLabel: "View schools",
	},
	{
		number: "06",
		title: "Receive Payouts & Rewards",
		tagline: "Direct admin-triggered payouts",
		description:
			"Innovation Olympiad staff trigger payouts based on your campaign performance. The moment a payout is triggered, the Payouts tab unlocks for you to enter bank details and receive funds.",
		actionHref: "/dashboard/payouts",
		actionLabel: "View payouts",
	},
];

export function PartnerStepGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<div
			className="card"
			style={{ marginBottom: "1.5rem", borderLeft: "4px solid var(--accent-500, #7dc832)" }}
		>
			<div className="row-between">
				<div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
					<span style={{ fontSize: "1.3rem" }}>🚀</span>
					<div>
						<h3 style={{ margin: 0, fontSize: "1.05rem" }}>
							Partner Workflow &amp; Step-by-Step Guide
						</h3>
						<p className="muted mb-0" style={{ fontSize: "0.82rem" }}>
							Step-by-step roadmap to run campaigns, onboard institutions, and receive payouts
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
					{PARTNER_STEPS.map((step) => (
						<div
							key={step.number}
							style={{
								padding: "1rem",
								borderRadius: "var(--radius-md)",
								background: "var(--bg-card)",
								border: "1px solid var(--border-default)",
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
											background: "linear-gradient(135deg, #7dc832, #4f9a12)",
											color: "#ffffff",
											padding: "2px 7px",
											borderRadius: "var(--radius-sm)",
										}}
									>
										Step {step.number}
									</span>
									<strong style={{ fontSize: "0.92rem" }}>{step.title}</strong>
								</div>
								<div
									style={{
										fontSize: "0.75rem",
										color: "#4f9a12",
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
