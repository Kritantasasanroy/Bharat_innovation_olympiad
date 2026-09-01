import { PagePlaceholder } from "../../shared/design-system";
import type { RouteDefinition } from "../../shared/router";

/**
 * Ops command center route map. Every entry renders a placeholder screen —
 * the final ops workflow surfaces will replace these placeholders later.
 */
export const opsRoutes: RouteDefinition[] = [
	{
		id: "ops-overview",
		path: "/ops",
		label: "Command Center",
		index: true,
		element: (
			<PagePlaceholder
				title="Ops Command Center"
				description="Operational overview placeholder for the Innovation Olympiad admin command center."
			/>
		),
	},
	{
		id: "ops-scheduling",
		path: "/ops/scheduling",
		label: "Scheduling",
		element: (
			<PagePlaceholder
				title="Scheduling"
				description="Exam window scheduling surface placeholder."
			/>
		),
	},
	{
		id: "ops-publishing",
		path: "/ops/publishing",
		label: "Publishing",
		element: (
			<PagePlaceholder
				title="Publishing"
				description="Exam and content publishing surface placeholder."
			/>
		),
	},
	{
		id: "ops-scoring",
		path: "/ops/scoring",
		label: "Scoring",
		element: (
			<PagePlaceholder title="Scoring" description="Scoring and answer-key surface placeholder." />
		),
	},
	{
		id: "ops-results",
		path: "/ops/results",
		label: "Results",
		element: (
			<PagePlaceholder
				title="Results"
				description="Results publication and review surface placeholder."
			/>
		),
	},
	{
		id: "ops-analytics",
		path: "/ops/analytics",
		label: "Analytics",
		element: (
			<PagePlaceholder
				title="Analytics"
				description="Operational analytics and reporting surface placeholder."
			/>
		),
	},
	{
		id: "ops-incidents",
		path: "/ops/incidents",
		label: "Incidents",
		element: (
			<PagePlaceholder
				title="Incidents"
				description="Operational incident monitoring surface placeholder."
			/>
		),
	},
];
