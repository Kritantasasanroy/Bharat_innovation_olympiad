import type { RouteDefinition } from "./types";

/**
 * Resolve the route for a pathname. Trailing slashes are normalized, and an
 * unmatched pathname falls back to the index route when one is declared.
 * Pure and DOM-free so it can be unit tested directly.
 */
export function matchRoute(
	routes: readonly RouteDefinition[],
	pathname: string,
): RouteDefinition | undefined {
	const normalized =
		pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
	const exact = routes.find((route) => route.path === normalized);
	if (exact) {
		return exact;
	}
	return routes.find((route) => route.index === true);
}
