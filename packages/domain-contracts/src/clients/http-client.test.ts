import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { CONTRACT_VERSION } from "../../../shared-types/src/index.ts";
import {
	CONTRACT_VERSION_HEADER,
	createHttpClient,
	type EndpointSpec,
	type FetchLike,
} from "./http-client.ts";

/** Records what the client sent and returns a scripted response. */
function stubFetch(make: (call: { url: string; init?: Parameters<FetchLike>[1] }) => Response): {
	fetch: FetchLike;
	calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }>;
} {
	const calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }> = [];
	const fetch: FetchLike = async (url, init) => {
		calls.push({ url, init });
		return make({ url, init });
	};
	return { fetch, calls };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set("content-type", "application/json");
	if (!headers.has(CONTRACT_VERSION_HEADER)) {
		headers.set(CONTRACT_VERSION_HEADER, CONTRACT_VERSION);
	}
	return new Response(JSON.stringify(body), { ...init, headers });
}

const SLOT = z.object({ id: z.string(), seats: z.number() });
const GET_SLOT: EndpointSpec<z.infer<typeof SLOT>> = {
	method: "GET",
	path: "/slots/abc",
	response: SLOT,
};

describe("createHttpClient — factory purity", () => {
	it("performs no network call during construction", () => {
		let called = false;
		const fetch: FetchLike = async () => {
			called = true;
			return jsonResponse({});
		};
		createHttpClient({ baseUrl: "https://api.test", fetch });
		expect(called).toBe(false);
	});

	it("normalizes a trailing slash off the base URL and defaults the contract version", () => {
		const { fetch } = stubFetch(() => jsonResponse({}));
		const client = createHttpClient({ baseUrl: "https://api.test/", fetch });
		expect(client.baseUrl).toBe("https://api.test");
		expect(client.contractVersion).toBe(CONTRACT_VERSION);
	});

	it("throws on an unparseable configured contract version", () => {
		const { fetch } = stubFetch(() => jsonResponse({}));
		expect(() =>
			createHttpClient({ baseUrl: "https://api.test", fetch, contractVersion: "nope" }),
		).toThrow();
	});
});

describe("createHttpClient — request wiring", () => {
	it("joins base URL with path, sends the version header, and validates the response", async () => {
		const { fetch, calls } = stubFetch(() => jsonResponse({ id: "abc", seats: 40 }));
		const client = createHttpClient({ baseUrl: "https://api.test", fetch });

		const result = await client.request(GET_SLOT);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("https://api.test/slots/abc");
		expect(calls[0]?.init?.method).toBe("GET");
		expect(calls[0]?.init?.headers?.[CONTRACT_VERSION_HEADER]).toBe(CONTRACT_VERSION);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({ id: "abc", seats: 40 });
		}
	});

	it("appends query parameters", async () => {
		const { fetch, calls } = stubFetch(() => jsonResponse({ id: "abc", seats: 1 }));
		const client = createHttpClient({ baseUrl: "https://api.test", fetch });
		await client.request(GET_SLOT, { query: { include: "capacity", page: 2, open: true } });
		expect(calls[0]?.url).toBe("https://api.test/slots/abc?include=capacity&page=2&open=true");
	});

	it("merges default and per-call headers (version header always wins)", async () => {
		const { fetch, calls } = stubFetch(() => jsonResponse({ id: "abc", seats: 1 }));
		const client = createHttpClient({
			baseUrl: "https://api.test",
			fetch,
			defaultHeaders: { authorization: "Bearer t", "x-keep": "1" },
		});
		await client.request(GET_SLOT, { headers: { "x-extra": "2" } });
		const headers = calls[0]?.init?.headers ?? {};
		expect(headers.authorization).toBe("Bearer t");
		expect(headers["x-keep"]).toBe("1");
		expect(headers["x-extra"]).toBe("2");
		expect(headers[CONTRACT_VERSION_HEADER]).toBe(CONTRACT_VERSION);
	});

	it("validates and serializes a request body", async () => {
		const { fetch, calls } = stubFetch(() => jsonResponse({ id: "abc", seats: 41 }));
		const client = createHttpClient({ baseUrl: "https://api.test", fetch });
		const spec: EndpointSpec<z.infer<typeof SLOT>, { seats: number }> = {
			method: "POST",
			path: "/slots/abc/seats",
			response: SLOT,
			body: z.object({ seats: z.number() }),
		};

		const result = await client.request(spec, { body: { seats: 41 } });

		expect(result.success).toBe(true);
		expect(calls[0]?.init?.body).toBe(JSON.stringify({ seats: 41 }));
		expect(calls[0]?.init?.headers?.["content-type"]).toBe("application/json");
	});

	it("rejects an invalid request body before sending (no fetch call)", async () => {
		const { fetch, calls } = stubFetch(() => jsonResponse({ id: "abc", seats: 1 }));
		const client = createHttpClient({ baseUrl: "https://api.test", fetch });
		const spec: EndpointSpec<z.infer<typeof SLOT>, { seats: number }> = {
			method: "POST",
			path: "/slots",
			response: SLOT,
			body: z.object({ seats: z.number() }),
		};

		const result = await client.request(spec, {
			// biome-ignore lint/suspicious/noExplicitAny: deliberately bad input for the test
			body: { seats: "lots" } as any,
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("VALIDATION_FAILED");
		}
		expect(calls).toHaveLength(0);
	});
});

describe("createHttpClient — contract-version guard (FR-8 fail-closed)", () => {
	it("rejects a response declaring an incompatible major", async () => {
		const { fetch } = stubFetch(() =>
			jsonResponse({ id: "abc", seats: 1 }, { headers: { [CONTRACT_VERSION_HEADER]: "1.0.0" } }),
		);
		const client = createHttpClient({ baseUrl: "https://api.test", fetch });

		const result = await client.request(GET_SLOT);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("UNSUPPORTED_CONTRACT_VERSION");
			expect(result.error.details?.declared).toBe("1.0.0");
		}
	});

	it("rejects a response declaring an unparseable version", async () => {
		const { fetch } = stubFetch(() =>
			jsonResponse({ id: "abc", seats: 1 }, { headers: { [CONTRACT_VERSION_HEADER]: "garbage" } }),
		);
		const client = createHttpClient({ baseUrl: "https://api.test", fetch });
		const result = await client.request(GET_SLOT);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("UNSUPPORTED_CONTRACT_VERSION");
		}
	});

	it("allows a response that omits the version header (no assertion to reject)", async () => {
		const headers = new Headers({ "content-type": "application/json" });
		const { fetch } = stubFetch(
			() => new Response(JSON.stringify({ id: "abc", seats: 1 }), { headers }),
		);
		const client = createHttpClient({ baseUrl: "https://api.test", fetch });
		const result = await client.request(GET_SLOT);
		expect(result.success).toBe(true);
	});

	it("honors a configured contract version on the outbound header", async () => {
		const { fetch, calls } = stubFetch(() =>
			jsonResponse({ id: "abc", seats: 1 }, { headers: { [CONTRACT_VERSION_HEADER]: "0.2.5" } }),
		);
		const client = createHttpClient({
			baseUrl: "https://api.test",
			fetch,
			contractVersion: "0.2.0",
		});
		const result = await client.request(GET_SLOT);
		expect(calls[0]?.init?.headers?.[CONTRACT_VERSION_HEADER]).toBe("0.2.0");
		// 0.2.5 shares the 0.2 line, so it is compatible under the 0.x rule.
		expect(result.success).toBe(true);
	});
});

describe("createHttpClient — error mapping", () => {
	it("maps non-2xx status codes to canonical error codes", async () => {
		const cases = [
			[401, "UNAUTHENTICATED"],
			[403, "FORBIDDEN"],
			[404, "NOT_FOUND"],
			[409, "CONFLICT"],
			[429, "RATE_LIMITED"],
			[500, "INTERNAL_ERROR"],
		] as const;
		for (const [status, code] of cases) {
			const { fetch } = stubFetch(() => jsonResponse({}, { status }));
			const client = createHttpClient({ baseUrl: "https://api.test", fetch });
			const result = await client.request(GET_SLOT);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe(code);
				expect(result.error.statusCode).toBe(status);
			}
		}
	});

	it("surfaces a serialized ApiError body verbatim", async () => {
		const { fetch } = stubFetch(() =>
			jsonResponse(
				{ code: "CONFLICT", message: "Seat already held", statusCode: 409, correlationId: "c-1" },
				{ status: 409 },
			),
		);
		const client = createHttpClient({ baseUrl: "https://api.test", fetch });
		const result = await client.request(GET_SLOT);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.message).toBe("Seat already held");
			expect(result.error.correlationId).toBe("c-1");
		}
	});

	it("fails validation when the success body does not match the schema", async () => {
		const { fetch } = stubFetch(() => jsonResponse({ id: "abc" }));
		const client = createHttpClient({ baseUrl: "https://api.test", fetch });
		const result = await client.request(GET_SLOT);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("VALIDATION_FAILED");
		}
	});

	it("maps an aborted fetch to DEPENDENCY_TIMEOUT", async () => {
		const fetch: FetchLike = async () => {
			const error = new Error("aborted");
			error.name = "AbortError";
			throw error;
		};
		const client = createHttpClient({ baseUrl: "https://api.test", fetch });
		const result = await client.request(GET_SLOT);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("DEPENDENCY_TIMEOUT");
		}
	});

	it("maps a transport failure to SERVICE_UNAVAILABLE", async () => {
		const fetch: FetchLike = async () => {
			throw new Error("ECONNREFUSED");
		};
		const client = createHttpClient({ baseUrl: "https://api.test", fetch });
		const result = await client.request(GET_SLOT);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("SERVICE_UNAVAILABLE");
		}
	});

	it("forwards an abort signal to the injected fetch", async () => {
		const controller = new AbortController();
		const { fetch, calls } = stubFetch(() => jsonResponse({ id: "abc", seats: 1 }));
		const client = createHttpClient({ baseUrl: "https://api.test", fetch });
		await client.request(GET_SLOT, { signal: controller.signal });
		expect(calls[0]?.init?.signal).toBe(controller.signal);
	});
});
