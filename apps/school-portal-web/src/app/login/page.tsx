"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ThemeToggle } from "../../components/theme-toggle";
import { ApiError, backendApi } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";

/**
 * Coordinator sign-in.
 *
 * The access token staff issue on approval is the credential. It is exchanged
 * here for a short-lived session JWT (`role: SCHOOL`), which every subsequent
 * request carries. A token belongs to exactly one school, and stops working the
 * moment staff revoke or rotate it.
 */
export default function LoginPage() {
	const { setToken } = useAuth();
	const router = useRouter();
	const [value, setValue] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const result = await backendApi.login(value.trim());
			setToken(result.accessToken);
			router.push("/dashboard");
		} catch (cause) {
			setError(cause instanceof ApiError ? cause.message : "Could not sign in. Please try again.");
			setSubmitting(false);
		}
	}

	return (
		<main className="page">
			<div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 50 }}>
				<ThemeToggle />
			</div>
			<div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
				<Image
					src="/bio-logo.png"
					alt="Bharat Innovation Olympiad"
					width={160}
					height={48}
					style={{ height: "48px", width: "auto", objectFit: "contain" }}
				/>
			</div>
			<div className="page-header">
				<h1>Coordinator sign in</h1>
				<p>
					Enter the access token issued to your school. The coordinator email must be confirmed
					before BIO staff can approve an application. New to the platform?{" "}
					<Link href="/activate">Activate your school</Link>.
				</p>
			</div>
			<div className="card" style={{ maxWidth: 560 }}>
				<form className="form-grid" onSubmit={handleSubmit} style={{ maxWidth: "none" }}>
					<div>
						<label htmlFor="token">Access token</label>
						<input
							id="token"
							maxLength={39}
							value={value}
							onChange={(event) => setValue(event.target.value)}
							placeholder="BIO-SCH-XXXXX-XXXXX-XXXXX-XXXXX"
							autoComplete="one-time-code"
							spellCheck={false}
							required
						/>
					</div>
					{error ? <div className="notice notice--error">{error}</div> : null}
					<button type="submit" className="button" disabled={submitting || !value.trim()}>
						{submitting ? "Signing in…" : "Continue to dashboard"}
					</button>
				</form>
				<p className="muted" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
					Need to confirm or resend your email? <Link href="/verify">Open verification</Link>.
				</p>
			</div>
		</main>
	);
}
