"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useAuth } from "../../lib/auth-context";

/**
 * Coordinator sign-in.
 *
 * A dedicated school-coordinator auth front door (SCHOOL_ADMIN role, invite
 * links) is a backend follow-up (PRD-047). Until then this mirrors the partner
 * portal: paste the shared BIO access token you were issued; every subsequent
 * request attaches it as `Authorization: Bearer <token>`.
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
		router.push("/dashboard");
	}

	return (
		<main className="page">
			<div className="page-header">
				<h1>Coordinator sign in</h1>
				<p>
					Paste your BIO platform access token (the shared JWT issued to your school-coordinator
					account). New to the platform? <Link href="/activate">Activate your school</Link>.
				</p>
			</div>
			<div className="card" style={{ maxWidth: 560 }}>
				<form className="form-grid" onSubmit={handleSubmit} style={{ maxWidth: "none" }}>
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
						Continue to dashboard
					</button>
				</form>
			</div>
		</main>
	);
}
