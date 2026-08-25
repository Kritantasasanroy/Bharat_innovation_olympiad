import type { BankDetails } from "../domain/partner-models";
import { NotFoundError, ValidationError } from "../errors";
import type { SubmitBankDetailsInput } from "../ports/in/partner.port";
import type { BankDetailsCrypto } from "../ports/out/bank-details-crypto.port";
import type { PartnerEventPublisher } from "../ports/out/partner-event-publisher.port";
import type { Clock, IdGenerator } from "../ports/out/partner-gateways.port";
import type {
	BankDetailsRepository,
	PartnerRepository,
} from "../ports/out/partner-repositories.port";

export interface BankDetailsServiceDeps {
	readonly bankDetails: BankDetailsRepository;
	readonly partners: PartnerRepository;
	readonly crypto: BankDetailsCrypto;
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: PartnerEventPublisher;
}

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const ACCOUNT_NUMBER_PATTERN = /^\d{9,18}$/;

function assertNonEmpty(field: string, value: string): void {
	if (!value || value.trim().length === 0) {
		throw new ValidationError("Validation failed", [{ field, message: `${field} is required` }]);
	}
}

/**
 * Where a partner's payouts get sent (see `BankDetails` for the shape).
 * Account number and PAN are the only fields sealed at rest — everything
 * else is needed unmasked just to render a row, so encrypting it would only
 * force a decrypt with nothing gained.
 */
export class BankDetailsService {
	constructor(private readonly deps: BankDetailsServiceDeps) {}

	async submit(input: SubmitBankDetailsInput): Promise<BankDetails> {
		assertNonEmpty("accountHolderName", input.accountHolderName);
		assertNonEmpty("bankName", input.bankName);

		const ifscCode = input.ifscCode.trim().toUpperCase();
		if (!IFSC_PATTERN.test(ifscCode)) {
			throw new ValidationError("Validation failed", [
				{ field: "ifscCode", message: "ifscCode must be a valid IFSC code (e.g. HDFC0001234)" },
			]);
		}

		const pan = input.pan.trim().toUpperCase();
		if (!PAN_PATTERN.test(pan)) {
			throw new ValidationError("Validation failed", [
				{ field: "pan", message: "pan must be a valid PAN (e.g. ABCDE1234F)" },
			]);
		}

		const accountNumber = input.accountNumber.trim();
		if (!ACCOUNT_NUMBER_PATTERN.test(accountNumber)) {
			throw new ValidationError("Validation failed", [
				{ field: "accountNumber", message: "accountNumber must be 9-18 digits" },
			]);
		}

		const partner = await this.deps.partners.findById(input.partnerId);
		if (!partner) throw new NotFoundError("Partner", input.partnerId);

		const now = this.deps.clock.now();
		const submitted = await this.deps.bankDetails.upsert({
			id: this.deps.ids.uuid(),
			partnerId: input.partnerId,
			accountHolderName: input.accountHolderName.trim(),
			bankName: input.bankName.trim(),
			ifscCode,
			accountNumberSealed: this.deps.crypto.seal(accountNumber),
			accountNumberLast4: this.deps.crypto.maskAccountNumber(accountNumber),
			panSealed: this.deps.crypto.seal(pan),
			panMasked: this.deps.crypto.maskPan(pan),
			now,
		});

		await this.deps.events.publish({
			type: "BankDetailsSubmitted",
			partnerId: input.partnerId,
			submittedAt: now,
		});

		return submitted;
	}

	/** Masked view — safe for any caller who already owns or may see this partner. */
	async get(partnerId: string): Promise<BankDetails | null> {
		return this.deps.bankDetails.findByPartnerId(partnerId);
	}

	/**
	 * Decrypts the account number + PAN. The caller (an admin-only HTTP route)
	 * is responsible for audit-logging the reveal — this method only knows how
	 * to open its own sealed fields, not who is asking or why.
	 */
	async reveal(
		partnerId: string,
	): Promise<{ readonly accountNumber: string; readonly pan: string } | null> {
		const sealed = await this.deps.bankDetails.findSealedByPartnerId(partnerId);
		if (!sealed) return null;
		return {
			accountNumber: this.deps.crypto.open(sealed.accountNumberSealed),
			pan: this.deps.crypto.open(sealed.panSealed),
		};
	}
}
