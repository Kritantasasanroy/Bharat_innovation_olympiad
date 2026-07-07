/**
 * Consumer-side pin of the BIO cross-repo contract version.
 *
 * {@link EXPECTED_CONTRACT_VERSION} is the version this repo was built and
 * tested against. The producer's source of truth is `CONTRACT_VERSION`,
 * exported from `@bio/admin-shared-types`. The two are reconciled by the
 * contract-version gate (PLAT-02): a *major* divergence between the pinned
 * expectation and the shipped shared-types means the wire shapes may have
 * changed incompatibly, so dependents must fail closed rather than start
 * against a contract they do not understand.
 *
 * The comparison is intentionally a pure, dependency-free helper so the boot
 * guard (`services/admin-api/src/contracts/version-guard.ts`), the CI gate
 * (`scripts/check-contract-version.ts`), and this package's tests all share a
 * single notion of "compatible".
 */

/** The contract version this repo's consumers are built against. */
export const EXPECTED_CONTRACT_VERSION = "0.1.0";

/** A semantic version split into its numeric components. */
export interface ContractVersion {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
}

/**
 * Parse a `MAJOR.MINOR.PATCH` string into its numeric parts.
 *
 * Pre-release / build metadata (anything after `-` or `+`) is ignored for the
 * purposes of the gate; only the numeric core matters for compatibility.
 *
 * @throws {RangeError} when the string is not a well-formed semantic version.
 */
export function parseContractVersion(version: string): ContractVersion {
	const core = version.trim().split(/[-+]/, 1)[0] ?? "";
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(core);
	if (match === null) {
		throw new RangeError(`"${version}" is not a valid MAJOR.MINOR.PATCH contract version`);
	}
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
	};
}

/**
 * True when two contract versions share the same major component and are
 * therefore wire-compatible under semver.
 *
 * A `0.x` line is treated strictly: while the major is `0`, semver permits
 * breaking changes on every minor bump, so a minor divergence within `0.x`
 * is *also* incompatible. From `1.0.0` onward only the major must match.
 *
 * @throws {RangeError} when either argument is not a valid semantic version.
 */
export function isContractCompatible(expected: string, actual: string): boolean {
	const e = parseContractVersion(expected);
	const a = parseContractVersion(actual);
	if (e.major !== a.major) {
		return false;
	}
	// 0.x: minor bumps are breaking per semver §4.
	if (e.major === 0) {
		return e.minor === a.minor;
	}
	return true;
}
