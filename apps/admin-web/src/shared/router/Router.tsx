import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type RouterContextValue = {
	pathname: string;
	navigate: (to: string) => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);

/**
 * Minimal History-API client router. Kept dependency-free on purpose so the
 * ops surface can land before a routing library is chosen.
 */
export function Router({ children }: { children: ReactNode }) {
	const [pathname, setPathname] = useState(() => window.location.pathname);

	useEffect(() => {
		const handlePopState = () => {
			setPathname(window.location.pathname);
		};
		window.addEventListener("popstate", handlePopState);
		return () => {
			window.removeEventListener("popstate", handlePopState);
		};
	}, []);

	const value = useMemo<RouterContextValue>(
		() => ({
			pathname,
			navigate: (to: string) => {
				window.history.pushState({}, "", to);
				setPathname(to);
			},
		}),
		[pathname],
	);

	return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterContextValue {
	const context = useContext(RouterContext);
	if (context === null) {
		throw new Error("useRouter must be used within a <Router> provider.");
	}
	return context;
}
