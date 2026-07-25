import type { AttributionRecord, CommissionLineItem } from "./partner-models";

/**
 * Pure commission math (no ports, no I/O — trivially unit-testable).
 *
 * Commission is computed per credited attribution as
 * `round(amountPaise * commissionRatePct / 100)`, using banker-free
 * standard rounding (nearest paisa) so line items always sum to a
 * deterministic, reproducible total.
 */
export function commissionForAmount(amountPaise: number, commissionRatePct: number): number {
	return Math.round((amountPaise * commissionRatePct) / 100);
}

/**
 * Build the line items + total for a set of credited attributions, applying
 * a single partner-level commission rate. Attributions without an amount or
 * registration (i.e. not yet credited) are never included — callers must
 * pre-filter to `CREDITED` records, but this is defensive besides.
 */
export function buildCommissionLineItems(
	attributions: readonly AttributionRecord[],
	commissionRatePct: number,
): { readonly lineItems: readonly CommissionLineItem[]; readonly totalPaise: number } {
	const lineItems: CommissionLineItem[] = [];
	let totalPaise = 0;

	for (const attribution of attributions) {
		if (attribution.amountPaise === null || attribution.registrationId === null) continue;
		const commissionPaise = commissionForAmount(attribution.amountPaise, commissionRatePct);
		lineItems.push({
			attributionId: attribution.id,
			campaignId: attribution.campaignId,
			studentId: attribution.studentId,
			registrationId: attribution.registrationId,
			amountPaise: attribution.amountPaise,
			commissionRatePct,
			commissionPaise,
		});
		totalPaise += commissionPaise;
	}

	return { lineItems, totalPaise };
}

/** Format a `Date` as its `"YYYY-MM"` billing period (UTC). */
export function periodOf(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}

/** True when `date` falls within the given `"YYYY-MM"` billing period (UTC). */
export function isInPeriod(date: Date, period: string): boolean {
	return periodOf(date) === period;
}
