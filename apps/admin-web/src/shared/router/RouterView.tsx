import { matchRoute } from "./match";
import { useRouter } from "./Router";
import type { RouteDefinition } from "./types";

/**
 * Renders the route matching the current pathname, or nothing when no route
 * (and no index fallback) matches.
 */
export function RouterView({ routes }: { routes: readonly RouteDefinition[] }) {
	const { pathname } = useRouter();
	const route = matchRoute(routes, pathname);
	return <>{route ? route.element : null}</>;
}
