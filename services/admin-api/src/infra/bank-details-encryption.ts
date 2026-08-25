import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "./config";

/**
 * At-rest encryption for the two genuinely sensitive `PartnerBankDetails`
 * fields (account number, PAN) — AES-256-GCM, sealed/opened here only.
 *
 * Deliberately a fresh implementation, not a shared import of the legacy
 * backend's `access-token.ts` seal: the two are separate deployables with
 * separate keys (`BANK_DETAILS_ENCRYPTION_KEY`, required, no fallback — see
 * `config/admin-config.ts`), so a leaked bank-details key can never be used
 * to forge an access token, or vice versa.
 */

const CIPHER = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSION = "v1";

function derivedKey(): Buffer {
	return scryptSync(config.bankDetailsEncryptionKey, "bio-bank-details-v1", 32);
}

/** Seal one plaintext value. Never throws on a missing key — `config` already fails closed at boot. */
export function sealBankDetail(plaintext: string): string {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(CIPHER, derivedKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [
		VERSION,
		iv.toString("base64url"),
		tag.toString("base64url"),
		ciphertext.toString("base64url"),
	].join(".");
}

/** Open a value sealed by {@link sealBankDetail}. Throws on a malformed or tampered payload. */
export function openBankDetail(sealed: string): string {
	const [version, ivB64, tagB64, dataB64] = sealed.split(".");
	if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
		throw new Error("Malformed sealed bank detail");
	}
	const decipher = createDecipheriv(CIPHER, derivedKey(), Buffer.from(ivB64, "base64url"));
	decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
	return Buffer.concat([
		decipher.update(Buffer.from(dataB64, "base64url")),
		decipher.final(),
	]).toString("utf8");
}

/** Last 4 digits only, e.g. "XXXXXXXX1234". Safe to render in any list view. */
export function maskAccountNumber(accountNumber: string): string {
	const last4 = accountNumber.slice(-4);
	return `${"X".repeat(Math.max(0, accountNumber.length - 4))}${last4}`;
}

/** Standard 10-character PAN (AAAAA9999A) masked to first 5 + last 1, e.g. "ABCDE****F". */
export function maskPan(pan: string): string {
	if (pan.length !== 10) return "*".repeat(pan.length);
	return `${pan.slice(0, 5)}****${pan.slice(-1)}`;
}
