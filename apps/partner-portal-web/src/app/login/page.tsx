"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ApiError, backendApi } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";

/**
 * Partner sign-in — the password chosen when applying, or the access token
 * staff issue on approval. Both resolve to the same partner.
 *
 * The legacy backend is the platform's only JWT signer, so it owns partner
 * login (`POST /api/partner/login`) and returns a `role: PARTNER` token whose
 * `sub` is the admin-api partnerId. Only an APPROVED partner gets a token;
 * PENDING/REJECTED/REVOKED are rejected with a clear message.
 */
export default function LoginPage() {
	const { setToken } = useAuth();
	const router = useRouter();
	const [mode, setMode] = useState<"password" | "token">("password");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [accessToken, setAccessToken] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const result =
				mode === "token"
					? await backendApi.loginWithToken(accessToken.trim())
					: await backendApi.login(email.trim(), password);
			setToken(result.accessToken);
			router.push("/dashboard");
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not sign you in.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main className="page">
			<div className="page-header">
				<h1>Partner sign in</h1>
				<p>Use the password from your access request, or the access token BIO issued you.</p>
			</div>

			<div className="inline" style={{ marginBottom: "1.5rem" }}>
				<button
					type="button"
					className={mode === "password" ? "pill pill--active" : "pill"}
					onClick={() => setMode("password")}
				>
					Email &amp; password
				</button>
				<button
					type="button"
					className={mode === "token" ? "pill pill--active" : "pill"}
					onClick={() => setMode("token")}
				>
					Access token
				</button>
			</div>

			<div className="card" style={{ maxWidth: 480 }}>
				<form className="form-grid" onSubmit={handleSubmit} style={{ maxWidth: "none" }}>
					{mode === "token" ? (
						<div>
							<label htmlFor="accessToken">Access token</label>
							<input
								id="accessToken"
								required
								spellCheck={false}
								autoComplete="one-time-code"
								placeholder="BIO-PTR-XXXXX-XXXXX-XXXXX-XXXXX"
								value={accessToken}
								onChange={(event) => setAccessToken(event.target.value)}
							/>
						</div>
					) : (
						<>
							<div>
								<label htmlFor="email">Email</label>
								<input
									id="email"
									type="email"
									required
									autoComplete="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
								/>
							</div>
							<div>
								<label htmlFor="password">Password</label>
								<input
									id="password"
									type="password"
									required
									autoComplete="current-password"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
								/>
							</div>
						</>
					)}
					{error ? <div className="notice notice--error">{error}</div> : null}
					<button type="submit" className="button" disabled={submitting}>
						{submitting ? "Signing in…" : "Sign in"}
					</button>
				</form>
			</div>

			<p className="muted" style={{ marginTop: "1rem" }}>
				New partner? <Link href="/apply">Request access</Link>.
			</p>
		</main>
	);
}
