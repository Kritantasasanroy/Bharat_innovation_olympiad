import type { PartnerInstitutionAssignment } from "../domain/partner-models";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import type { AssignInstitutionInput, UnassignInstitutionInput } from "../ports/in/partner.port";
import type { AuditSink } from "../ports/out/audit-sink.port";
import type { Clock, IdGenerator } from "../ports/out/partner-gateways.port";
import type {
	PartnerInstitutionAssignmentRepository,
	PartnerRepository,
} from "../ports/out/partner-repositories.port";

export interface InstitutionAssignmentServiceDeps {
	readonly assignments: PartnerInstitutionAssignmentRepository;
	readonly partners: PartnerRepository;
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly audit: AuditSink;
}

/** Self-service partner<->institution assignment, audited (PRD-046). */
export class InstitutionAssignmentService {
	constructor(private readonly deps: InstitutionAssignmentServiceDeps) {}

	async assign(input: AssignInstitutionInput): Promise<PartnerInstitutionAssignment> {
		if (!input.institutionId) {
			throw new ValidationError("Validation failed", [
				{ field: "institutionId", message: "institutionId is required" },
			]);
		}
		const partner = await this.deps.partners.findById(input.partnerId);
		if (!partner) throw new NotFoundError("Partner", input.partnerId);

		const existing = await this.deps.assignments.findActive(input.partnerId, input.institutionId);
		if (existing) {
			throw new ConflictError(
				`Partner ${input.partnerId} is already assigned to institution ${input.institutionId}`,
				"INSTITUTION_ALREADY_ASSIGNED",
			);
		}

		const now = this.deps.clock.now();
		const assignment = await this.deps.assignments.create({
			id: this.deps.ids.uuid(),
			partnerId: input.partnerId,
			institutionId: input.institutionId,
			effectiveFrom: now,
			assignedBy: input.assignedBy,
		});

		await this.deps.audit.record({
			action: "partner.institution-assigned",
			actor: { id: input.assignedBy, type: "user" },
			resource: { type: "partner-institution-assignment", id: assignment.id },
			outcome: "success",
			occurredAt: now.toISOString(),
			metadata: { partnerId: input.partnerId, institutionId: input.institutionId },
		});

		return assignment;
	}

	async unassign(input: UnassignInstitutionInput): Promise<PartnerInstitutionAssignment> {
		const existing = await this.deps.assignments.findActive(input.partnerId, input.institutionId);
		if (!existing) {
			throw new NotFoundError(
				`Active assignment of partner ${input.partnerId} to institution ${input.institutionId}`,
			);
		}

		const now = this.deps.clock.now();
		const deactivated = await this.deps.assignments.deactivate(existing.id, now);
		if (!deactivated) throw new NotFoundError("Partner institution assignment", existing.id);

		await this.deps.audit.record({
			action: "partner.institution-unassigned",
			actor: { id: input.assignedBy, type: "user" },
			resource: { type: "partner-institution-assignment", id: deactivated.id },
			outcome: "success",
			occurredAt: now.toISOString(),
			metadata: { partnerId: input.partnerId, institutionId: input.institutionId },
		});

		return deactivated;
	}

	async list(partnerId: string): Promise<readonly PartnerInstitutionAssignment[]> {
		const partner = await this.deps.partners.findById(partnerId);
		if (!partner) throw new NotFoundError("Partner", partnerId);
		return this.deps.assignments.findByPartnerId(partnerId);
	}
}
