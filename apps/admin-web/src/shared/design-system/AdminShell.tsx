import type { ReactNode } from "react";
import { useDesignSystem } from "./DesignSystemProvider";

/**
 * Layout shell the design system can replace later. The `nav` and content
 * slots are the hook points the ops command center surface renders into.
 */
export function AdminShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
	const tokens = useDesignSystem();
	return (
		<div className={tokens.surface} data-admin-shell="true">
			<nav aria-label="Ops command center navigation" className={tokens.muted}>
				{nav}
			</nav>
			<main className={tokens.accent}>{children}</main>
		</div>
	);
}
