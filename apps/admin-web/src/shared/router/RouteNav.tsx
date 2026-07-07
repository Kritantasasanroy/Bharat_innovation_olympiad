import { useRouter } from "./Router";
import type { RouteDefinition } from "./types";

/**
 * Navigation list for a route map. Intercepts clicks to navigate via the
 * History API instead of a full page reload.
 */
export function RouteNav({ routes }: { routes: readonly RouteDefinition[] }) {
	const { pathname, navigate } = useRouter();
	return (
		<ul>
			{routes.map((route) => (
				<li key={route.id}>
					<a
						href={route.path}
						aria-current={route.path === pathname ? "page" : undefined}
						onClick={(event) => {
							event.preventDefault();
							navigate(route.path);
						}}
					>
						{route.label}
					</a>
				</li>
			))}
		</ul>
	);
}
