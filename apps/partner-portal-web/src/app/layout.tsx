import type { ReactNode } from "react";
import { AuthProvider } from "../lib/auth-context";
import "./globals.css";

export const metadata = { title: "BIO Partner Portal" };

export default function RootLayout({ children }: { readonly children: ReactNode }) {
	// Light by default; the toggle persists a choice to localStorage `bio-theme`.
	return (
		<html lang="en" data-theme="light" suppressHydrationWarning>
			<body>
				<AuthProvider>{children}</AuthProvider>
			</body>
		</html>
	);
}
