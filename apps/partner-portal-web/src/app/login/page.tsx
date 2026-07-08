"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useAuth } from "../../lib/auth-context";

/**
 * Token entry.
 *
 * PRD-011 explicitly delegates auth: "Partner accounts authenticate via the
 * SAME shared JWT... you do not need to build new auth infrastructure."
 * There is no partner-specific login flow anywhere in the org yet (see
 * `frontend/src/store/authStore.ts` for the one that exists for students:
 * Neon Auth OTP -> `POST /auth/login-sync` -> a signed `{sub,email,role}`
 * HS256 token). Until that (or an equivalent SSO front door) is wired up for
 * partners specifically, this page is the front door: paste the shared JWT
 * you already have, and every subsequent page attaches it as
 * `Authorization: Bearer <token>` on calls to portal-api, which verifies it
 * the same way `exam-api` does.
 */
export default function LoginPage() {
	const { setToken } = useAuth();
	const router = useRouter();
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const trimmed = value.trim();
		if (trimmed.split(".").length !== 3) {
			setError("That doesn't look like a JWT (expected header.payload.signature).");
			return;
		}
		setToken(trimmed);
		router.push("/");
	}

	return (
		<main className="page">
			<div className="page-header">
				<h1>Sign in</h1>
				<p>
					Paste your BIO platform access token (the shared JWT issued to your partner account).
					portal-api verifies it on every request — nothing is trusted from this form beyond the
					token itself.
				</p>
			</div>
			<form className="form-grid" onSubmit={handleSubmit}>
				<div>
					<label htmlFor="token">Access token</label>
					<textarea
						id="token"
						value={value}
						onChange={(event) => setValue(event.target.value)}
						placeholder="eyJhbGciOi..."
						required
					/>
				</div>
				{error ? <div className="notice notice--error">{error}</div> : null}
				<button type="submit" className="button">
					Continue
				</button>
			</form>
		</main>
	);
}
