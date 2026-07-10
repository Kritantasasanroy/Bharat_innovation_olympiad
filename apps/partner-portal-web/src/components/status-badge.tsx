const TONE_BY_STATUS: Record<string, string> = {
	APPROVED: "badge badge--positive",
	RELEASED: "badge badge--positive",
	RESOLVED: "badge badge--positive",
	ACTIVE: "badge badge--positive",
	SUBMITTED: "badge badge--pending",
	PENDING: "badge badge--pending",
	FINANCE_REVIEW: "badge badge--pending",
	OPEN: "badge badge--pending",
	IN_PROGRESS: "badge badge--pending",
	PAUSED: "badge badge--pending",
	DEACTIVATED: "badge badge--pending",
	REJECTED: "badge badge--negative",
	REVOKED: "badge badge--negative",
	ON_HOLD: "badge badge--negative",
};

export function StatusBadge({ status }: { readonly status: string }) {
	const className = TONE_BY_STATUS[status] ?? "badge";
	return <span className={className}>{status.replaceAll("_", " ")}</span>;
}
