/**
 * SemVer helpers for the shared `CONTRACT_VERSION` gate (PLAT-02 FR-8).
 *
 * Consumers reject any contract whose **major** they do not understand
 * (fail-closed); additive optional fields bump minor, removals bump major.
 */

/** A parsed semantic version. */
export interface SemVer {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
	/** Dot-separated prerelease identifiers, e.g. `["rc", "1"]`. */
	readonly prerelease: readonly string[];
	/** Dot-separated build-metadata identifiers (ignored for precedence). */
	readonly build: readonly string[];
}

// Anchored SemVer 2.0.0 grammar (major.minor.patch[-prerelease][+build]).
const SEMVER_RE =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** Parse a SemVer string, returning `null` when it is not valid SemVer 2.0.0. */
export function parseSemVer(input: string): SemVer | null {
	const match = SEMVER_RE.exec(input.trim());
	if (match === null) {
		return null;
	}
	const [, major, minor, patch, prerelease, build] = match;
	if (major === undefined || minor === undefined || patch === undefined) {
		return null;
	}
	return {
		major: Number(major),
		minor: Number(minor),
		patch: Number(patch),
		prerelease: prerelease === undefined || prerelease === "" ? [] : prerelease.split("."),
		build: build === undefined || build === "" ? [] : build.split("."),
	};
}

/**
 * Strict parse for the canonical contract version. Throws on invalid input,
 * since an unparseable `CONTRACT_VERSION` is a build-time bug, not a runtime
 * condition to branch on. Use {@link parseSemVer} for untrusted input.
 */
export function parseContractVersion(input: string): SemVer {
	const parsed = parseSemVer(input);
	if (parsed === null) {
		throw new TypeError(`Invalid contract version: "${input}"`);
	}
	return parsed;
}

/** Serialise a {@link SemVer} back to its canonical string form. */
export function formatSemVer(version: SemVer): string {
	const core = `${version.major}.${version.minor}.${version.patch}`;
	const pre = version.prerelease.length > 0 ? `-${version.prerelease.join(".")}` : "";
	const build = version.build.length > 0 ? `+${version.build.join(".")}` : "";
	return `${core}${pre}${build}`;
}

function comparePrerelease(a: readonly string[], b: readonly string[]): -1 | 0 | 1 {
	// A version with prerelease identifiers has lower precedence than one without.
	if (a.length === 0 && b.length === 0) {
		return 0;
	}
	if (a.length === 0) {
		return 1;
	}
	if (b.length === 0) {
		return -1;
	}
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		const ai = a[i] as string;
		const bi = b[i] as string;
		if (ai === bi) {
			continue;
		}
		const aNum = /^\d+$/.test(ai);
		const bNum = /^\d+$/.test(bi);
		if (aNum && bNum) {
			return Number(ai) < Number(bi) ? -1 : 1;
		}
		// Numeric identifiers always have lower precedence than alphanumeric ones.
		if (aNum !== bNum) {
			return aNum ? -1 : 1;
		}
		return ai < bi ? -1 : 1;
	}
	if (a.length === b.length) {
		return 0;
	}
	return a.length < b.length ? -1 : 1;
}

/**
 * Compare two versions by SemVer precedence (build metadata ignored).
 * Returns -1 if `a < b`, 0 if equal, 1 if `a > b`.
 */
export function compareSemVer(a: SemVer, b: SemVer): -1 | 0 | 1 {
	if (a.major !== b.major) {
		return a.major < b.major ? -1 : 1;
	}
	if (a.minor !== b.minor) {
		return a.minor < b.minor ? -1 : 1;
	}
	if (a.patch !== b.patch) {
		return a.patch < b.patch ? -1 : 1;
	}
	return comparePrerelease(a.prerelease, b.prerelease);
}

/**
 * Whether two versions share a compatible major (FR-8). Below 1.0.0 every minor
 * is treated as its own breaking line (0.x convention), matching the current
 * `CONTRACT_VERSION` of `0.1.0`.
 */
export function isCompatibleMajor(a: SemVer, b: SemVer): boolean {
	if (a.major !== b.major) {
		return false;
	}
	if (a.major === 0) {
		return a.minor === b.minor;
	}
	return true;
}
