import { CONTRACT_VERSION } from "../../shared-types/src/index.ts";

export * from "./clients/index.ts";
export * from "./events/index.ts";
export { CONTRACT_VERSION };

export type BioEventProducer = "bio-portal" | "bio-admin" | "bio-exam" | "bio-proctor";

export interface BioEventEnvelope<TPayload> {
	readonly eventId: string;
	readonly eventType: string;
	readonly eventVersion: typeof CONTRACT_VERSION;
	readonly occurredAt: string;
	readonly producer: BioEventProducer;
	readonly correlationId: string;
	readonly causationId?: string;
	readonly idempotencyKey: string;
	readonly payload: TPayload;
}

export const CROSS_REPO_EVENT_TYPES = [
	"RegistrationConfirmed",
	"RegistrationCancelled",
	"ExamSnapshotPublished",
	"ExamSlotPublished",
	"attempt.submitted",
	"ProctorSessionRequested",
	"RiskScoreChanged",
	"ProctorReportFinalized",
] as const;

export type CrossRepoEventType = (typeof CROSS_REPO_EVENT_TYPES)[number];
