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
 * Two credentials resolve to the same session JWT (`role: SCHOOL`): the
 * access token staff issue on approval, or (for a self-applied school) the
 * email + password chosen at activation. A partner-submitted school has no
 * password, so it can only ever sign in with the token.
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
		} catch (cause) {
			setError(cause instanceof ApiError ? cause.message : "Could not sign in. Please try again.");
		} finally {
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
					Use the email and password chosen at activation, or the access token BIO issued you. The
					coordinator email must be confirmed before BIO staff can approve an application. New to
					the platform? <Link href="/activate">Activate your school</Link>.
				</p>
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

			<div className="card" style={{ maxWidth: 560 }}>
				<form className="form-grid" onSubmit={handleSubmit} style={{ maxWidth: "none" }}>
					{mode === "token" ? (
						<div>
							<label htmlFor="token">Access token</label>
							<input
								id="token"
								maxLength={39}
								value={accessToken}
								onChange={(event) => setAccessToken(event.target.value)}
								placeholder="BIO-SCH-XXXXX-XXXXX-XXXXX-XXXXX"
								autoComplete="one-time-code"
								spellCheck={false}
								required
							/>
						</div>
					) : (
						<>
							<div>
								<label htmlFor="email">Coordinator email</label>
								<input
									id="email"
									type="email"
									maxLength={254}
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
									autoCapitalize="none"
									autoCorrect="off"
									spellCheck={false}
									value={password}
									onChange={(event) => setPassword(event.target.value)}
								/>
								<p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
									<Link href="/forgot-password">Forgot your password?</Link>
								</p>
							</div>
						</>
					)}
					{error ? <div className="notice notice--error">{error}</div> : null}
					<button type="submit" className="button" disabled={submitting}>
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
