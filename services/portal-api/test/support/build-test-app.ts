import { InMemorySupportRequestRepository } from "../../src/adapters/out/persistence/in-memory-support-request.repository";
import { buildApp } from "../../src/app";
import { FakeAdminApiClient } from "./fake-admin-api-client";
import { signTestJwt } from "./jwt";

export const TEST_JWT_SECRET = "portal-api-test-secret";

export function buildTestApp() {
	const adminApiClient = new FakeAdminApiClient();
	const supportRequestRepository = new InMemorySupportRequestRepository();
	const app = buildApp({ adminApiClient, supportRequestRepository, jwtSecret: TEST_JWT_SECRET });
	return { app, adminApiClient, supportRequestRepository };
}

/** Sign a `PARTNER`-role token for `partnerId`, valid for the test secret. */
export function partnerToken(partnerId: string, overrides: Record<string, unknown> = {}): string {
	return signTestJwt(
		{ sub: partnerId, email: `${partnerId}@example.com`, role: "PARTNER", ...overrides },
		TEST_JWT_SECRET,
	);
}

export function authHeader(token: string): { authorization: string } {
	return { authorization: `Bearer ${token}` };
}
