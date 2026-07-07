import type { ReactNode } from "react";
export const metadata = { title: "BIO Marketing" };
export default function RootLayout({ children }: { readonly children: ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
