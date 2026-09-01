import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { ConnectionBanner } from "../components/connection-banner";
import { AuthProvider } from "../lib/auth-context";
import "./globals.css";

// `variable` (not `className`) — globals.css's --font-sans/--font-display
// tokens resolve through these, so every existing var(--font-sans) rule
// keeps working without touching page markup.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jakarta = Plus_Jakarta_Sans({
	subsets: ["latin"],
	weight: ["500", "600", "700", "800"],
	variable: "--font-jakarta",
});

export const metadata = {
	title: "Innovation Olympiad Partner Portal | Bharat Innovation Olympiad",
	description:
		"Bharat Innovation Olympiad partner portal — manage schools, students, campaigns, and payouts.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
	// Light by default; the toggle persists a choice to localStorage `bio-theme`.
	return (
		<html
			lang="en"
			data-theme="light"
			suppressHydrationWarning
			className={`${inter.variable} ${jakarta.variable}`}
		>
			<head>
				<link rel="icon" href="/favicon.ico" />
			</head>
			<body>
				<ConnectionBanner />
				<AuthProvider>{children}</AuthProvider>
			</body>
		</html>
	);
}
