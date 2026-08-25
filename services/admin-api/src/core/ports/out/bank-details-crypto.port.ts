/**
 * Outbound port: at-rest encryption for the two sensitive `BankDetails`
 * fields (account number, PAN). The concrete implementation (AES-256-GCM,
 * its own dedicated key) is infrastructure and lives in `adapters/out/crypto`
 * — core only ever sees this interface.
 */
export interface BankDetailsCrypto {
	seal(plaintext: string): string;
	open(sealed: string): string;
	maskAccountNumber(accountNumber: string): string;
	maskPan(pan: string): string;
}
