import { describe, expect, it } from "bun:test";
import { CONTRACT_VERSION } from "../../shared-types/src/index.ts";
import { ContractConsumer, checkpointKey, envelopeSchemaFor } from "./harness.ts";
import { CONTRACT_FIXTURES } from "./index.ts";

describe("every fixture validates against its payload schema and the envelope", () => {
	for (const fixture of CONTRACT_FIXTURES) {
		it(`${fixture.eventType} (${fixture.role}) parses`, () => {
			const result = envelopeSchemaFor(fixture.eventType).safeParse(fixture.envelope);
			expect(result.success).toBe(true);
		});

		it(`${fixture.eventType} (${fixture.role}) is accepted by a consumer`, () => {
			const consumer = new ContractConsumer();
			const outcome = consumer.ingest(fixture.envelope);
			expect(outcome.status).toBe("accepted");
			expect(consumer.checkpoint).toHaveLength(1);
		});
	}

	it("pins eventType so a payload cannot be validated under the wrong event", () => {
		const confirmed = CONTRACT_FIXTURES.find((f) => f.eventType === "RegistrationConfirmed");
		if (confirmed === undefined) throw new Error("expected a RegistrationConfirmed fixture");
		const result = envelopeSchemaFor("RegistrationCancelled").safeParse(confirmed.envelope);
		expect(result.success).toBe(false);
	});
});

describe("duplicate handling", () => {
	it("treats a second delivery of the same (eventId, idempotencyKey) as a no-op", () => {
		const consumer = new ContractConsumer();
		const [fixture] = CONTRACT_FIXTURES;
		if (fixture === undefined) throw new Error("expected at least one fixture");

		const first = consumer.ingest(fixture.envelope);
		const second = consumer.ingest(fixture.envelope);

		expect(first.status).toBe("accepted");
		expect(second.status).toBe("duplicate");
		// The duplicate does not advance the checkpoint a second time.
		expect(consumer.checkpoint).toEqual([
			checkpointKey(fixture.envelope.eventId, fixture.envelope.idempotencyKey),
		]);
	});
});

describe("unknown-major handling", () => {
	const [fixture] = CONTRACT_FIXTURES;
	if (fixture === undefined) throw new Error("expected at least one fixture");

	it("rejects a real major bump fail-closed without advancing the checkpoint", () => {
		const consumer = new ContractConsumer();
		const outcome = consumer.ingest({ ...fixture.envelope, eventVersion: "1.0.0" });

		expect(outcome).toMatchObject({ status: "rejected", reason: "unknown-major" });
		expect(consumer.checkpoint).toHaveLength(0);
	});

	it("treats a 0.x minor bump as an incompatible major (0.x convention)", () => {
		const consumer = new ContractConsumer();
		const outcome = consumer.ingest({ ...fixture.envelope, eventVersion: "0.2.0" });

		expect(outcome).toMatchObject({ status: "rejected", reason: "unknown-major" });
		expect(consumer.checkpoint).toHaveLength(0);
	});

	it("rejects an unparseable eventVersion rather than best-effort parsing", () => {
		const consumer = new ContractConsumer();
		const outcome = consumer.ingest({ ...fixture.envelope, eventVersion: "not-a-version" });

		expect(outcome).toMatchObject({ status: "rejected", reason: "unknown-major" });
		expect(consumer.checkpoint).toHaveLength(0);
	});

	it("accepts the canonical contract version", () => {
		const consumer = new ContractConsumer();
		const outcome = consumer.ingest({ ...fixture.envelope, eventVersion: CONTRACT_VERSION });
		expect(outcome.status).toBe("accepted");
	});
});

describe("replay handling", () => {
	it("collapses a replayed event to a no-op after other events were processed", () => {
		const consumer = new ContractConsumer();
		const first = CONTRACT_FIXTURES[0];
		const second = CONTRACT_FIXTURES[1];
		if (first === undefined || second === undefined) {
			throw new Error("expected at least two fixtures");
		}

		expect(consumer.ingest(first.envelope).status).toBe("accepted");
		expect(consumer.ingest(second.envelope).status).toBe("accepted");
		// The outbox re-delivers `first` long after its checkpoint advanced.
		const replay = consumer.ingest(first.envelope);

		expect(replay.status).toBe("duplicate");
		expect(consumer.checkpoint).toHaveLength(2);
	});
});

describe("malformed envelopes are rejected fail-closed", () => {
	const [fixture] = CONTRACT_FIXTURES;
	if (fixture === undefined) throw new Error("expected at least one fixture");

	it("rejects an envelope missing a required metadata field", () => {
		const { idempotencyKey, ...withoutIdempotencyKey } = fixture.envelope;
		void idempotencyKey;
		const outcome = new ContractConsumer().ingest(withoutIdempotencyKey);
		expect(outcome).toMatchObject({ status: "rejected", reason: "invalid-envelope" });
	});

	it("rejects an envelope whose payload violates its schema", () => {
		const confirmed = CONTRACT_FIXTURES.find((f) => f.eventType === "RegistrationConfirmed");
		if (confirmed === undefined) throw new Error("expected a RegistrationConfirmed fixture");
		const outcome = new ContractConsumer().ingest({
			...confirmed.envelope,
			// `registrationId` is a non-empty id; an empty string fails the payload schema.
			payload: { ...confirmed.envelope.payload, registrationId: "" },
		});
		expect(outcome).toMatchObject({ status: "rejected", reason: "invalid-payload" });
	});

	it("rejects an envelope carrying an unknown event type", () => {
		const outcome = new ContractConsumer().ingest({
			...fixture.envelope,
			eventType: "NotACatalogEvent",
		});
		expect(outcome).toMatchObject({ status: "rejected", reason: "invalid-payload" });
	});
});
