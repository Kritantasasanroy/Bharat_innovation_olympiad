import type { ReactNode } from "react";
import { ConnectionBanner } from "../components/connection-banner";
import { ReferralCapture } from "../components/referral-capture";
import { AuthProvider } from "../lib/auth-context";
import "./globals.css";

export const metadata = {
	title: "BIO School Portal | Bharat Innovation Olympiad",
	description:
		"Bharat Innovation Olympiad school portal — activate your school, manage students, slots, and results.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
	// Light by default; the toggle persists a choice to localStorage `bio-theme`.
	return (
		<html lang="en" data-theme="light" suppressHydrationWarning>
			<head>
				<link rel="icon" href="/favicon.ico" />
			</head>
			<body>
				<ConnectionBanner />
				<ReferralCapture />
				<AuthProvider>{children}</AuthProvider>
			</body>
		</html>
	);
}
