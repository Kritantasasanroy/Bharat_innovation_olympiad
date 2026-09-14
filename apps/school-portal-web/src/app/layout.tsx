import { Inter, Lexend } from "next/font/google";
import type { ReactNode } from "react";
import { ConnectionBanner } from "../components/connection-banner";
import { ReferralCapture } from "../components/referral-capture";
import { ScrollToError } from "../components/scroll-to-error";
import { AuthProvider } from "../lib/auth-context";
import "./globals.css";

// `variable` (not `className`) — globals.css's --font-sans/--font-display
// tokens resolve through these, so every existing var(--font-sans) rule
// keeps working without touching page markup.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const lexend = Lexend({
	subsets: ["latin"],
	weight: ["500", "600", "700", "800"],
	variable: "--font-lexend",
});

export const metadata = {
	title: "Innovation Olympiad School Portal | Bharat Innovation Olympiad",
	description:
		"Bharat Innovation Olympiad school portal — activate your school, manage students, and results.",
};

export const viewport = {
	width: "device-width",
	initialScale: 1,
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
	// Light by default; the toggle persists a choice to localStorage `bio-theme`.
	return (
		<html
			lang="en"
			data-theme="light"
			suppressHydrationWarning
			className={`${inter.variable} ${lexend.variable}`}
		>
			<head>
				<link rel="icon" href="/favicon.ico" />
			</head>
			<body>
				<ConnectionBanner />
				<ReferralCapture />
				<AuthProvider>{children}</AuthProvider>
				<ScrollToError />
				<footer
					style={{ textAlign: "center", padding: "24px 16px", fontSize: "0.8rem", opacity: 0.6 }}
				>
					© Bharat Innovation Olympiad is owned by Lemon Ideas Innovations Pvt Ltd.
				</footer>
			</body>
		</html>
	);
}
