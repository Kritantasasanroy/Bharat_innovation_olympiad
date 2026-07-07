/**
 * Boot-time contract-version gate (fail-closed).
 *
 * The admin API is a *consumer* of the BIO cross-repo contract. It is built
 * against a specific version, pinned as {@link EXPECTED_CONTRACT_VERSION} in
 * `@bio/admin-contract-fixtures`. The shared-types package it actually links
 * against advertises its own {@link CONTRACT_VERSION}. If those diverge across
 * a major boundary the wire shapes may have changed incompatibly, so the
 * service must refuse to start rather than serve or persist data it might
 * misinterpret (PLAT-02 contract-version gate; companion to the fail-closed
 * config guard in `config/admin-config.ts`).
 *
 * This is distinct from the `CONTRACT_VERSION` *environment* variable checked
 * by {@link loadAdminConfig}: that guards against a misconfigured deploy; this
 * guards against a mis-built artifact (a stale or mismatched shared-types
 * dependency baked into the bundle).
 */

import { EXPECTED_CONTRACT_VERSION, isContractCompatible } from "@bio/admin-contract-fixtures";
import { CONTRACT_VERSION } from "@bio/admin-shared-types";

/**
 * Thrown at boot when the linked shared-types contract version is not
 * compatible with the version this service was built against.
 */
export class ContractVersionMismatchError extends Error {
	/** Machine-readable code for log filtering and alerting. */
	readonly code = "CONTRACT_VERSION_MISMATCH";
	/** The version this service pins (what it was built against). */
	readonly expected: string;
	/** The version advertised by the linked `@bio/admin-shared-types`. */
	readonly actual: string;

	constructor(expected: string, actual: string) {
		super(
			`Contract version mismatch: this service was built against ` +
				`"${expected}" but is linked to @bio/admin-shared-types ` +
				`"${actual}". The major versions are incompatible; the service ` +
				`will not start (fail-closed, PLAT-02 contract-version gate).`,
		);
		this.name = "ContractVersionMismatchError";
		this.expected = expected;
		this.actual = actual;
		Object.setPrototypeOf(this, ContractVersionMismatchError.prototype);
	}
}

/** Options for {@link assertContractCompatible}, injectable for testing. */
export interface AssertContractOptions {
	/** Consumer-pinned version; defaults to {@link EXPECTED_CONTRACT_VERSION}. */
	readonly expected?: string;
	/** Linked shared-types version; defaults to {@link CONTRACT_VERSION}. */
	readonly actual?: string;
}

/**
 * Assert that the linked contract version is compatible with the expected one.
 *
 * @throws {ContractVersionMismatchError} on a major (or `0.x` minor) divergence.
 * @throws {RangeError} when either version is not a valid semantic version.
 */
export function assertContractCompatible(options: AssertContractOptions = {}): void {
	const expected = options.expected ?? EXPECTED_CONTRACT_VERSION;
	const actual = options.actual ?? CONTRACT_VERSION;
	if (!isContractCompatible(expected, actual)) {
		throw new ContractVersionMismatchError(expected, actual);
	}
}
