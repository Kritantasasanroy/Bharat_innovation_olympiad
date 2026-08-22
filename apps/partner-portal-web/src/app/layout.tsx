import type { ReactNode } from "react";
import { AuthProvider } from "../lib/auth-context";
import "./globals.css";

export const metadata = {
	title: "BIO Partner Portal | Bharat Innovation Olympiad",
	description:
		"Bharat Innovation Olympiad partner portal — manage schools, students, campaigns, and payouts.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
	// Light by default; the toggle persists a choice to localStorage `bio-theme`.
	return (
		<html lang="en" data-theme="light" suppressHydrationWarning>
			<head>
				<link rel="icon" href="/favicon.ico" />
			</head>
			<body>
				<AuthProvider>{children}</AuthProvider>
			</body>
		</html>
	);
}
