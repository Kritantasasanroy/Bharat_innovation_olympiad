import type { BankDetailsCrypto } from "../../../core/ports/out/bank-details-crypto.port";
import {
	maskAccountNumber,
	maskPan,
	openBankDetail,
	sealBankDetail,
} from "../../../infra/bank-details-encryption";

/** Production {@link BankDetailsCrypto} — thin wrapper over the AES-256-GCM helpers in `infra`. */
export class AesBankDetailsCrypto implements BankDetailsCrypto {
	seal(plaintext: string): string {
		return sealBankDetail(plaintext);
	}

	open(sealed: string): string {
		return openBankDetail(sealed);
	}

	maskAccountNumber(accountNumber: string): string {
		return maskAccountNumber(accountNumber);
	}

	maskPan(pan: string): string {
		return maskPan(pan);
	}
}
