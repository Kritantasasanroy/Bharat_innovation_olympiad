import { opsRoutes } from "./features/ops";
import { AdminShell, DesignSystemProvider } from "./shared/design-system";
import { RouteNav, Router, RouterView } from "./shared/router";

export function AdminApp() {
	return (
		<DesignSystemProvider>
			<Router>
				<AdminShell nav={<RouteNav routes={opsRoutes} />}>
					<RouterView routes={opsRoutes} />
				</AdminShell>
			</Router>
		</DesignSystemProvider>
	);
}
