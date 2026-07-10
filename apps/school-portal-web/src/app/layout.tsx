import type { ReactNode } from "react";
import { ReferralCapture } from "../components/referral-capture";
import { AuthProvider } from "../lib/auth-context";
import "./globals.css";

export const metadata = {
	title: "BIO School Portal",
	description: "Bharat Innovation Olympiad — School coordinator portal",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
	// Light by default; the toggle persists a choice to localStorage `bio-theme`.
	return (
		<html lang="en" data-theme="light" suppressHydrationWarning>
			<body>
				<ReferralCapture />
				<AuthProvider>{children}</AuthProvider>
			</body>
		</html>
	);
}
