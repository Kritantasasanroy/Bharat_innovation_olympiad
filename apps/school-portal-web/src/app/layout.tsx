import type { ReactNode } from "react";
import { AuthProvider } from "../lib/auth-context";
import "./globals.css";

export const metadata = {
	title: "BIO School Portal",
	description: "Bharat Innovation Olympiad — School coordinator portal",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
	return (
		<html lang="en">
			<body>
				<AuthProvider>{children}</AuthProvider>
			</body>
		</html>
	);
}
