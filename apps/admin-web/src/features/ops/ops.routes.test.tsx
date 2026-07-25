import { describe, expect, it } from "bun:test";
import { matchRoute } from "../../shared/router/match";
import { opsRoutes } from "./ops.routes";

describe("ops command center route map", () => {
	it("exposes the core ops surfaces", () => {
		expect(opsRoutes.length).toBeGreaterThanOrEqual(2);
	});

	it("scopes every route under /ops", () => {
		for (const route of opsRoutes) {
			expect(route.path.startsWith("/ops")).toBe(true);
		}
	});

	it("gives every route a unique id and path, plus a label and element", () => {
		const ids = new Set(opsRoutes.map((route) => route.id));
		const paths = new Set(opsRoutes.map((route) => route.path));
		expect(ids.size).toBe(opsRoutes.length);
		expect(paths.size).toBe(opsRoutes.length);
		for (const route of opsRoutes) {
			expect(route.id.length).toBeGreaterThan(0);
			expect(route.label.length).toBeGreaterThan(0);
			expect(route.element).toBeTruthy();
		}
	});

	it("declares exactly one index route, at /ops", () => {
		const indexRoutes = opsRoutes.filter((route) => route.index === true);
		expect(indexRoutes.length).toBe(1);
		expect(indexRoutes[0]?.path).toBe("/ops");
	});

	it("matches a known sub-route exactly", () => {
		const scheduling = opsRoutes.find((route) => route.path === "/ops/scheduling");
		expect(matchRoute(opsRoutes, "/ops/scheduling")).toBe(scheduling);
	});

	it("normalizes a trailing slash when matching", () => {
		expect(matchRoute(opsRoutes, "/ops/scheduling/")).toBe(
			matchRoute(opsRoutes, "/ops/scheduling"),
		);
	});

	it("falls back to the index route for unknown paths", () => {
		const fallback = matchRoute(opsRoutes, "/ops/does-not-exist");
		expect(fallback?.index).toBe(true);
		expect(fallback?.path).toBe("/ops");
	});
});
