"use client";

export default function ErrorPage({
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<main className="page error-page">
			<p className="eyebrow">School portal</p>
			<h1>Something went wrong</h1>
			<p className="muted">
				The page could not finish loading. Your application and roster are safe.
			</p>
			<button type="button" className="button" onClick={reset}>
				Try again
			</button>
		</main>
	);
}
