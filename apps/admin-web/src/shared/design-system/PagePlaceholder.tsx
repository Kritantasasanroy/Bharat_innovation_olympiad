import { useDesignSystem } from "./DesignSystemProvider";

/**
 * Placeholder route screen. Intentionally not a final workflow screen — it
 * marks where a real ops workflow surface will be wired in later.
 */
export function PagePlaceholder({ title, description }: { title: string; description: string }) {
	const tokens = useDesignSystem();
	return (
		<section className={tokens.surface} data-placeholder="true">
			<h2>{title}</h2>
			<p className={tokens.muted}>{description}</p>
		</section>
	);
}
