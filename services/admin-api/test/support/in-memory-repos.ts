import type {
	ApplicationStatus,
	AttributionRule,
	CampaignStatus,
	PartnerStatus,
} from "../../src/core/domain/partner-enums";
import type {
	AttributionRecord,
	BankDetails,
	Campaign,
	CampaignCaps,
	Partner,
	PartnerApplication,
	PartnerInstitutionAssignment,
	Payout,
} from "../../src/core/domain/partner-models";
import type { AuditEvent, AuditSink } from "../../src/core/ports/out/audit-sink.port";
import type { BankDetailsCrypto } from "../../src/core/ports/out/bank-details-crypto.port";
import type {
	PartnerDomainEvent,
	PartnerEventPublisher,
} from "../../src/core/ports/out/partner-event-publisher.port";
import type { Clock, IdGenerator } from "../../src/core/ports/out/partner-gateways.port";
import type {
	AttributionRepository,
	BankDetailsRepository,
	CampaignRepository,
	NewCampaign,
	NewPartnerApplication,
	PartnerApplicationRepository,
	PartnerInstitutionAssignmentRepository,
	PartnerRepository,
	PayoutRepository,
} from "../../src/core/ports/out/partner-repositories.port";

/** Deterministic clock — starts at a fixed instant and only advances when told to. */
export class FakeClock implements Clock {
	private current: Date;
	constructor(start: Date = new Date("2026-06-15T00:00:00.000Z")) {
		this.current = start;
	}
	now(): Date {
		return this.current;
	}
	set(date: Date): void {
		this.current = date;
	}
	advanceMs(ms: number): void {
		this.current = new Date(this.current.getTime() + ms);
	}
}

/** Deterministic, sequential id generator (`id-1`, `id-2`, ...). */
export class FakeIdGenerator implements IdGenerator {
	private counter = 0;
	uuid(): string {
		this.counter += 1;
		return `id-${this.counter}`;
	}
}

/** Records every published event for assertions; never throws. */
export class RecordingEventPublisher implements PartnerEventPublisher {
	readonly events: PartnerDomainEvent[] = [];
	publish(event: PartnerDomainEvent): Promise<void> {
		this.events.push(event);
		return Promise.resolve();
	}
}

/** Records every audit event for assertions; never throws. */
export class RecordingAuditSink implements AuditSink {
	readonly events: AuditEvent[] = [];
	record(event: AuditEvent): Promise<void> {
		this.events.push(event);
		return Promise.resolve();
	}
}

export class InMemoryPartnerRepository implements PartnerRepository {
	private readonly rows = new Map<string, Partner>();

	async findById(id: string): Promise<Partner | null> {
		return this.rows.get(id) ?? null;
	}

	async create(input: {
		readonly id: string;
		readonly orgName: string;
		readonly contactPerson: string;
		readonly email: string;
		readonly phone: string;
		readonly createdAt: Date;
	}): Promise<Partner> {
		const partner: Partner = { ...input, status: "PENDING" };
		this.rows.set(partner.id, partner);
		return partner;
	}

	async updateStatus(id: string, status: PartnerStatus): Promise<Partner | null> {
		const existing = this.rows.get(id);
		if (!existing) return null;
		const updated: Partner = { ...existing, status };
		this.rows.set(id, updated);
		return updated;
	}
}

export class InMemoryPartnerApplicationRepository implements PartnerApplicationRepository {
	private readonly rows = new Map<string, PartnerApplication>();

	async findById(id: string): Promise<PartnerApplication | null> {
		return this.rows.get(id) ?? null;
	}

	async create(input: NewPartnerApplication): Promise<PartnerApplication> {
		const application: PartnerApplication = {
			id: input.applicationId,
			partnerId: input.partnerId,
			orgName: input.orgName,
			contactPerson: input.contactPerson,
			email: input.email,
			phone: input.phone,
			status: "SUBMITTED",
			decisionReason: null,
			decidedBy: null,
			decidedAt: null,
			createdAt: input.createdAt,
		};
		this.rows.set(application.id, application);
		return application;
	}

	async decide(
		id: string,
		status: Extract<ApplicationStatus, "APPROVED" | "REJECTED">,
		reason: string,
		decidedBy: string,
		decidedAt: Date,
	): Promise<PartnerApplication | null> {
		const existing = this.rows.get(id);
		if (!existing) return null;
		const updated: PartnerApplication = {
			...existing,
			status,
			decisionReason: reason,
			decidedBy,
			decidedAt,
		};
		this.rows.set(id, updated);
		return updated;
	}
}

export class InMemoryCampaignRepository implements CampaignRepository {
	private readonly rows = new Map<string, Campaign>();

	async findById(id: string): Promise<Campaign | null> {
		return this.rows.get(id) ?? null;
	}

	async findByReferralCode(referralCode: string): Promise<Campaign | null> {
		return [...this.rows.values()].find((c) => c.referralCode === referralCode) ?? null;
	}

	async findByPartnerId(partnerId: string): Promise<readonly Campaign[]> {
		return [...this.rows.values()].filter((c) => c.partnerId === partnerId);
	}

	async isUnique(linkToken: string, referralCode: string): Promise<boolean> {
		for (const campaign of this.rows.values()) {
			if (campaign.linkToken === linkToken || campaign.referralCode === referralCode) return false;
		}
		return true;
	}

	async create(input: NewCampaign): Promise<Campaign> {
		const campaign: Campaign = {
			id: input.id,
			partnerId: input.partnerId,
			name: input.name,
			linkToken: input.linkToken,
			referralCode: input.referralCode,
			status: "ACTIVE",
			caps: input.caps,
			createdAt: input.createdAt,
		};
		this.rows.set(campaign.id, campaign);
		return campaign;
	}

	async update(
		id: string,
		patch: { readonly name?: string; readonly caps?: CampaignCaps | null },
	): Promise<Campaign | null> {
		const existing = this.rows.get(id);
		if (!existing) return null;
		const updated: Campaign = {
			...existing,
			...(patch.name !== undefined ? { name: patch.name } : {}),
			...(patch.caps !== undefined ? { caps: patch.caps } : {}),
		};
		this.rows.set(id, updated);
		return updated;
	}

	async setStatus(id: string, status: CampaignStatus): Promise<Campaign | null> {
		const existing = this.rows.get(id);
		if (!existing) return null;
		const updated: Campaign = { ...existing, status };
		this.rows.set(id, updated);
		return updated;
	}
}

export class InMemoryAttributionRepository implements AttributionRepository {
	private readonly rows = new Map<string, AttributionRecord>();

	async findById(id: string): Promise<AttributionRecord | null> {
		return this.rows.get(id) ?? null;
	}

	async findOpenByStudent(studentId: string): Promise<AttributionRecord | null> {
		for (const record of this.rows.values()) {
			if (record.studentId === studentId && record.status === "OPEN") return record;
		}
		return null;
	}

	async findCreditedByStudentAndRegistration(
		studentId: string,
		registrationId: string,
	): Promise<AttributionRecord | null> {
		for (const record of this.rows.values()) {
			if (
				record.studentId === studentId &&
				record.registrationId === registrationId &&
				record.status === "CREDITED"
			) {
				return record;
			}
		}
		return null;
	}

	async createOpenTouch(input: {
		readonly id: string;
		readonly partnerId: string;
		readonly campaignId: string;
		readonly studentId: string;
		readonly createdAt: Date;
	}): Promise<AttributionRecord> {
		const record: AttributionRecord = {
			id: input.id,
			partnerId: input.partnerId,
			campaignId: input.campaignId,
			studentId: input.studentId,
			registrationId: null,
			status: "OPEN",
			ruleApplied: null,
			amountPaise: null,
			convertedAt: null,
			createdAt: input.createdAt,
		};
		this.rows.set(record.id, record);
		return record;
	}

	async credit(input: {
		readonly existingId: string | null;
		readonly newId: string;
		readonly partnerId: string;
		readonly campaignId: string;
		readonly studentId: string;
		readonly registrationId: string;
		readonly ruleApplied: AttributionRule;
		readonly amountPaise: number;
		readonly convertedAt: Date;
	}): Promise<AttributionRecord> {
		// Idempotency safety net, mirroring the Drizzle adapter's unique-index
		// fallback: if a credited row for this partner+student+registration
		// already exists, never create a second one.
		for (const record of this.rows.values()) {
			if (
				record.partnerId === input.partnerId &&
				record.studentId === input.studentId &&
				record.registrationId === input.registrationId &&
				record.status === "CREDITED"
			) {
				return record;
			}
		}

		if (input.existingId) {
			const existing = this.rows.get(input.existingId);
			if (!existing) throw new Error(`in-memory credit: no open touch ${input.existingId}`);
			const updated: AttributionRecord = {
				...existing,
				status: "CREDITED",
				registrationId: input.registrationId,
				ruleApplied: input.ruleApplied,
				amountPaise: input.amountPaise,
				convertedAt: input.convertedAt,
			};
			this.rows.set(updated.id, updated);
			return updated;
		}

		const record: AttributionRecord = {
			id: input.newId,
			partnerId: input.partnerId,
			campaignId: input.campaignId,
			studentId: input.studentId,
			registrationId: input.registrationId,
			status: "CREDITED",
			ruleApplied: input.ruleApplied,
			amountPaise: input.amountPaise,
			convertedAt: input.convertedAt,
			createdAt: input.convertedAt,
		};
		this.rows.set(record.id, record);
		return record;
	}

	async findCreditedByPartnerId(partnerId: string): Promise<readonly AttributionRecord[]> {
		return [...this.rows.values()].filter(
			(r) => r.partnerId === partnerId && r.status === "CREDITED",
		);
	}

	async findAllByPartnerId(partnerId: string): Promise<readonly AttributionRecord[]> {
		return [...this.rows.values()].filter((r) => r.partnerId === partnerId);
	}

	async findAll(): Promise<readonly AttributionRecord[]> {
		return [...this.rows.values()];
	}
}

export class InMemoryPayoutRepository implements PayoutRepository {
	private readonly rows = new Map<string, Payout>();

	async findById(id: string): Promise<Payout | null> {
		return this.rows.get(id) ?? null;
	}

	async create(input: {
		readonly id: string;
		readonly partnerId: string;
		readonly amountPaise: number;
		readonly note: string | null;
		readonly triggeredBy: string;
		readonly triggeredAt: Date;
	}): Promise<Payout> {
		const payout: Payout = { ...input, status: "TRIGGERED", paidBy: null, paidAt: null };
		this.rows.set(payout.id, payout);
		return payout;
	}

	async markPaid(id: string, paidBy: string, paidAt: Date): Promise<Payout | null> {
		const existing = this.rows.get(id);
		if (!existing) return null;
		const updated: Payout = { ...existing, status: "PAID", paidBy, paidAt };
		this.rows.set(id, updated);
		return updated;
	}

	async findByPartnerId(partnerId: string): Promise<readonly Payout[]> {
		return [...this.rows.values()].filter((p) => p.partnerId === partnerId);
	}

	async findAll(): Promise<readonly Payout[]> {
		return [...this.rows.values()];
	}
}

export class InMemoryBankDetailsRepository implements BankDetailsRepository {
	private readonly rows = new Map<string, BankDetails>();
	private readonly sealed = new Map<
		string,
		{ readonly accountNumberSealed: string; readonly panSealed: string }
	>();

	async findByPartnerId(partnerId: string): Promise<BankDetails | null> {
		return this.rows.get(partnerId) ?? null;
	}

	async findSealedByPartnerId(
		partnerId: string,
	): Promise<{ readonly accountNumberSealed: string; readonly panSealed: string } | null> {
		return this.sealed.get(partnerId) ?? null;
	}

	async upsert(input: {
		readonly id: string;
		readonly partnerId: string;
		readonly accountHolderName: string;
		readonly bankName: string;
		readonly ifscCode: string;
		readonly accountNumberSealed: string;
		readonly accountNumberLast4: string;
		readonly panSealed: string;
		readonly panMasked: string;
		readonly now: Date;
	}): Promise<BankDetails> {
		const existing = this.rows.get(input.partnerId);
		const record: BankDetails = {
			partnerId: input.partnerId,
			accountHolderName: input.accountHolderName,
			bankName: input.bankName,
			ifscCode: input.ifscCode,
			accountNumberLast4: input.accountNumberLast4,
			panMasked: input.panMasked,
			submittedAt: existing?.submittedAt ?? input.now,
			updatedAt: input.now,
		};
		this.rows.set(input.partnerId, record);
		this.sealed.set(input.partnerId, {
			accountNumberSealed: input.accountNumberSealed,
			panSealed: input.panSealed,
		});
		return record;
	}
}

/** Reversible, non-cryptographic fake — real enough to test seal/reveal round-tripping. */
export class FakeBankDetailsCrypto implements BankDetailsCrypto {
	seal(plaintext: string): string {
		return `sealed:${plaintext}`;
	}
	open(sealed: string): string {
		return sealed.replace(/^sealed:/, "");
	}
	maskAccountNumber(accountNumber: string): string {
		return `XXXXXXXX${accountNumber.slice(-4)}`;
	}
	maskPan(pan: string): string {
		return pan.length === 10 ? `${pan.slice(0, 5)}****${pan.slice(-1)}` : "*".repeat(pan.length);
	}
}

export class InMemoryPartnerInstitutionAssignmentRepository
	implements PartnerInstitutionAssignmentRepository
{
	private readonly rows = new Map<string, PartnerInstitutionAssignment>();

	async findActive(
		partnerId: string,
		institutionId: string,
	): Promise<PartnerInstitutionAssignment | null> {
		for (const row of this.rows.values()) {
			if (
				row.partnerId === partnerId &&
				row.institutionId === institutionId &&
				row.effectiveTo === null
			) {
				return row;
			}
		}
		return null;
	}

	async create(input: {
		readonly id: string;
		readonly partnerId: string;
		readonly institutionId: string;
		readonly effectiveFrom: Date;
		readonly assignedBy: string;
	}): Promise<PartnerInstitutionAssignment> {
		const assignment: PartnerInstitutionAssignment = { ...input, effectiveTo: null };
		this.rows.set(assignment.id, assignment);
		return assignment;
	}

	async deactivate(id: string, effectiveTo: Date): Promise<PartnerInstitutionAssignment | null> {
		const existing = this.rows.get(id);
		if (!existing) return null;
		const updated: PartnerInstitutionAssignment = { ...existing, effectiveTo };
		this.rows.set(id, updated);
		return updated;
	}

	async findByPartnerId(partnerId: string): Promise<readonly PartnerInstitutionAssignment[]> {
		return [...this.rows.values()].filter((r) => r.partnerId === partnerId);
	}
}
