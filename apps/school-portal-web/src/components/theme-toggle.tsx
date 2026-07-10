"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "bio-theme";

function apply(theme: Theme) {
	document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Light/dark toggle. Portals default to light (`<html data-theme="light">`);
 * a stored choice wins. Zero dependencies — mirrors the admin portal's approach,
 * sharing the same `bio-theme` key and `data-theme` attribute so the whole
 * platform reads one preference.
 */
export function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>("light");

	useEffect(() => {
		const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
		const initial: Theme = stored ?? "light";
		setTheme(initial);
		apply(initial);
	}, []);

	function toggle() {
		const next: Theme = theme === "dark" ? "light" : "dark";
		setTheme(next);
		apply(next);
		try {
			window.localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// storage disabled — the in-memory toggle still works this session
		}
	}

	return (
		<button
			type="button"
			className="theme-toggle"
			onClick={toggle}
			aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
			title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
		>
			{theme === "dark" ? "☀️" : "🌙"}
		</button>
	);
}
