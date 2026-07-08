/**
 * Branded value-object identifiers (PLAT-02 FR-6: value-object identities cross
 * the wire as plain strings, but are branded in-process so callers cannot pass
 * an arbitrary string where a specific entity id is expected).
 *
 * No branded-id convention existed anywhere in this package yet, so this file
 * establishes the pattern with the minimal, dependency-free approach: a
 * nominal `Brand<T, TBrand>` intersection type plus a constructor function of
 * the same name as the type (distinct namespaces — TS allows a `type Foo` and
 * a `function Foo` with the same identifier to coexist). The constructor
 * validates non-emptiness so a blank string can never be smuggled in as an id.
 */

/** Nominal branding helper: `T` tagged with a unique string literal `TBrand`. */
export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

function brand<TBrand extends string>(kind: TBrand): (value: string) => Brand<string, TBrand> {
	return (value: string) => {
		if (!value || value.trim().length === 0) {
			throw new Error(`${kind} must be a non-empty string`);
		}
		return value as Brand<string, TBrand>;
	};
}

/** Identifier of a `Partner` (channel partner) aggregate. */
export type PartnerId = Brand<string, "PartnerId">;
/** Construct a validated {@link PartnerId} from a raw string. */
export const PartnerId: (value: string) => PartnerId = brand("PartnerId");

/** Identifier of a `Campaign`'s referral code / link token (the "coupon"). */
export type ReferralCodeId = Brand<string, "ReferralCodeId">;
/** Construct a validated {@link ReferralCodeId} from a raw string. */
export const ReferralCodeId: (value: string) => ReferralCodeId = brand("ReferralCodeId");
