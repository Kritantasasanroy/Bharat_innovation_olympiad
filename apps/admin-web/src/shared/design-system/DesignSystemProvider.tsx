import type { ReactNode } from "react";
import { createContext, useContext } from "react";

export type DesignSystemTokens = {
	surface: string;
	accent: string;
	muted: string;
};

/**
 * Placeholder tokens. The shared design system package is expected to supply
 * real tokens via <DesignSystemProvider tokens={...}> once it is wired in.
 */
export const placeholderTokens: DesignSystemTokens = {
	surface: "admin-surface",
	accent: "admin-accent",
	muted: "admin-muted",
};

const DesignSystemContext = createContext<DesignSystemTokens>(placeholderTokens);

export function DesignSystemProvider({
	tokens = placeholderTokens,
	children,
}: {
	tokens?: DesignSystemTokens;
	children: ReactNode;
}) {
	return <DesignSystemContext.Provider value={tokens}>{children}</DesignSystemContext.Provider>;
}

/** Design-system hook point: read the active tokens. */
export function useDesignSystem(): DesignSystemTokens {
	return useContext(DesignSystemContext);
}
