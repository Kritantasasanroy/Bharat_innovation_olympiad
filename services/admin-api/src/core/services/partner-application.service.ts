import { ApplicationStatus, PartnerStatus } from "../domain/partner-enums";
import type { Partner, PartnerApplication } from "../domain/partner-models";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import type {
	DecidePartnerApplicationInput,
	SubmitPartnerApplicationInput,
} from "../ports/in/partner.port";
import type { AuditSink } from "../ports/out/audit-sink.port";
import type {
	PartnerDomainEvent,
	PartnerEventPublisher,
} from "../ports/out/partner-event-publisher.port";
import type { Clock, IdGenerator } from "../ports/out/partner-gateways.port";
import type {
	PartnerApplicationRepository,
	PartnerRepository,
} from "../ports/out/partner-repositories.port";

/** Global default commission rate applied to a newly-created partner (PRD-046 decision). */
export const DEFAULT_COMMISSION_RATE_PCT = 10;

export interface PartnerApplicationServiceDeps {
	readonly applications: PartnerApplicationRepository;
	readonly partners: PartnerRepository;
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: PartnerEventPublisher;
	readonly audit: AuditSink;
}

function assertNonEmpty(field: string, value: string): void {
	if (!value || value.trim().length === 0) {
		throw new ValidationError("Validation failed", [{ field, message: `${field} is required` }]);
	}
}

/**
 * Partner onboarding application service (PRD-046).
 *
 * There is intentionally NO review UI, queue, or assignment machinery here —
 * the approval decision is made by staff outside this system; this service
 * only records it via a minimal, audited manual-decision hook (status field +
 * mandatory reason + actor + audit trail).
 */
export class PartnerApplicationService {
	constructor(private readonly deps: PartnerApplicationServiceDeps) {}

	async submit(input: SubmitPartnerApplicationInput): Promise<PartnerApplication> {
		assertNonEmpty("orgName", input.orgName);
		assertNonEmpty("contactPerson", input.contactPerson);
		assertNonEmpty("email", input.email);
		assertNonEmpty("phone", input.phone);

		const now = this.deps.clock.now();
		const partnerId = this.deps.ids.uuid();
		const applicationId = this.deps.ids.uuid();

		await this.deps.partners.create({
			id: partnerId,
			orgName: input.orgName,
			contactPerson: input.contactPerson,
			email: input.email,
			phone: input.phone,
			commissionRatePct: DEFAULT_COMMISSION_RATE_PCT,
			createdAt: now,
		});

		const application = await this.deps.applications.create({
			applicationId,
			partnerId,
			orgName: input.orgName,
			contactPerson: input.contactPerson,
			email: input.email,
			phone: input.phone,
			createdAt: now,
		});

		await this.publish({
			type: "PartnerApplicationSubmitted",
			applicationId: application.id,
			partnerId,
			orgName: input.orgName,
			contactPerson: input.contactPerson,
			email: input.email,
			submittedAt: now,
		});

		await this.deps.audit.record({
			action: "partner-application.submitted",
			actor: { id: partnerId, type: "user", label: input.contactPerson },
			resource: { type: "partner-application", id: application.id },
			outcome: "success",
			occurredAt: now.toISOString(),
		});

		return application;
	}

	async get(applicationId: string): Promise<PartnerApplication> {
		const application = await this.deps.applications.findById(applicationId);
		if (!application) throw new NotFoundError("Partner application", applicationId);
		return application;
	}

	/**
	 * Staff-set decision (`APPROVED`/`REJECTED`), mandatory reason, actor recorded.
	 * A decision can only be recorded once — an already-decided application
	 * cannot be re-decided through this hook.
	 */
	async decide(input: DecidePartnerApplicationInput): Promise<PartnerApplication> {
		assertNonEmpty("reason", input.reason);
		assertNonEmpty("decidedBy", input.decidedBy);

		const application = await this.deps.applications.findById(input.applicationId);
		if (!application) throw new NotFoundError("Partner application", input.applicationId);
		if (application.status !== ApplicationStatus.SUBMITTED) {
			throw new ConflictError(
				`Application ${input.applicationId} was already decided (${application.status})`,
				"APPLICATION_ALREADY_DECIDED",
			);
		}

		const now = this.deps.clock.now();
		const decided = await this.deps.applications.decide(
			input.applicationId,
			input.status,
			input.reason,
			input.decidedBy,
			now,
		);
		if (!decided) throw new NotFoundError("Partner application", input.applicationId);

		const partnerStatus =
			input.status === "APPROVED" ? PartnerStatus.APPROVED : PartnerStatus.REJECTED;
		await this.deps.partners.updateStatus(application.partnerId, partnerStatus);

		await this.publish({
			type: "PartnerStatusChanged",
			partnerId: application.partnerId,
			applicationId: application.id,
			previousStatus: PartnerStatus.PENDING,
			newStatus: partnerStatus,
			reason: input.reason,
			decidedBy: input.decidedBy,
			decidedAt: now,
		});

		await this.deps.audit.record({
			action: `partner-application.${input.status.toLowerCase()}`,
			actor: { id: input.decidedBy, type: "user" },
			resource: { type: "partner-application", id: application.id },
			outcome: "success",
			occurredAt: now.toISOString(),
			metadata: { reason: input.reason, partnerId: application.partnerId },
		});

		return decided;
	}

	/**
	 * Staff access hook — set a partner's access status directly
	 * (`APPROVED` | `REJECTED` | `REVOKED`), audited with a mandatory reason.
	 *
	 * Unlike {@link decide} (the one-shot application decision), this operates on
	 * the Partner aggregate and is idempotent/repeatable, so staff can revoke a
	 * previously-approved partner and re-grant later. `Partner.status` is the
	 * single gate the partner dashboard reads (portal-api `requireApprovedPartner`),
	 * so a REVOKE here removes access on the partner's very next request.
	 *
	 * No contract event is published (the status set is an operational access
	 * change, not a first onboarding decision) — the audit record is the trail.
	 */
	async setAccess(input: {
		readonly partnerId: string;
		readonly status: PartnerStatus;
		readonly reason: string;
		readonly decidedBy: string;
	}): Promise<Partner> {
		assertNonEmpty("partnerId", input.partnerId);
		assertNonEmpty("reason", input.reason);
		assertNonEmpty("decidedBy", input.decidedBy);

		const partner = await this.deps.partners.findById(input.partnerId);
		if (!partner) throw new NotFoundError("Partner", input.partnerId);

		const now = this.deps.clock.now();
		const updated = await this.deps.partners.updateStatus(input.partnerId, input.status);
		if (!updated) throw new NotFoundError("Partner", input.partnerId);

		await this.deps.audit.record({
			action: `partner.access.${input.status.toLowerCase()}`,
			actor: { id: input.decidedBy, type: "user" },
			resource: { type: "partner", id: input.partnerId },
			outcome: "success",
			occurredAt: now.toISOString(),
			metadata: { reason: input.reason, previousStatus: partner.status },
		});

		return updated;
	}

	private async publish(event: PartnerDomainEvent): Promise<void> {
		await this.deps.events.publish(event);
	}
}
