import type { ReactElement } from "react";

/**
 * A single client route. The route map is plain data so it can be inspected
 * and tested without rendering, and rendered by <RouterView> at runtime.
 */
export type RouteDefinition = {
	id: string;
	path: string;
	label: string;
	element: ReactElement;
	index?: boolean;
};
