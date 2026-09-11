/**
 * Shared plumbing for the end-to-end checks (`verify.mjs`, `pipeline.mjs`).
 *
 * Both scripts talk to the same two live environments and both learned the same
 * lessons the hard way, so the environment table, the browser user-agent and the
 * request/assert helpers live here once rather than drifting apart in two files.
 */

export const ENVS = {
	dev: {
		label: "dev (AWS)",
		api: "https://api.dev.innovationolympiad.in",
		exam: "https://exam.dev.innovationolympiad.in",
		student: "https://dev.innovationolympiad.in",
		school: "https://school.dev.innovationolympiad.in",
		partner: "https://partner.dev.innovationolympiad.in",
		admin: "https://admin.dev.innovationolympiad.in",
		// The two Bun services. On dev they are sidecars on the portal box, each
		// with its own ALB hostname; `engine` is the partner engine the admin
		// console drives through the legacy backend.
		engine: "https://admin-api.dev.innovationolympiad.in",
		bff: "https://portal-api.dev.innovationolympiad.in",
	},
	demo: {
		label: "demo (Render + Vercel)",
		api: "https://olympiad-backend-khlq.onrender.com",
		exam: "https://olympiad-backend-khlq.onrender.com",
		student: "https://www.innovationolympiad.in",
		school: "https://school.innovationolympiad.in",
		partner: "https://partner.innovationolympiad.in",
		admin: "https://olympiad-admin-frontend.vercel.app",
		// Render free tier: these sleep, and a measured cold start is ~33s, so
		// anything probing them needs a budget well past that (see
		// `backend/src/partner/admin-api.client.ts`, which learned the same
		// lesson and retries for ~62s).
		engine: "https://bio-admin-api.onrender.com",
		bff: "https://bio-portal-api.onrender.com",
		coldStartMs: 75_000,
	},
};

// The ALB's WAF BotControl rule 403s anything that looks automated, so every
// request here presents a normal browser UA. Without it the whole dev run is a
// wall of 403s that says nothing about the deploy.
export const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

export const c = {
	ok: (s) => `\x1b[32m${s}\x1b[0m`,
	no: (s) => `\x1b[31m${s}\x1b[0m`,
	dim: (s) => `\x1b[90m${s}\x1b[0m`,
	head: (s) => `\x1b[1m${s}\x1b[0m`,
};

const state = { pass: 0, fail: 0, skip: 0, failures: [] };

export function check(name, condition, detail = "") {
	if (condition) {
		state.pass++;
		console.log(`  ${c.ok("PASS")} ${name}${detail ? c.dim(`  ${detail}`) : ""}`);
	} else {
		state.fail++;
		state.failures.push(name);
		console.log(`  ${c.no("FAIL")} ${name}${detail ? `  ${detail}` : ""}`);
	}
	return condition;
}

/** Announce something deliberately not run, so a green board never hides a gap. */
export function skip(name, why) {
	state.skip++;
	console.log(`  ${c.dim("SKIP")} ${c.dim(`${name} — ${why}`)}`);
}

export function group(title) {
	console.log(c.head(`\n  ${title}`));
}

export function banner(title) {
	console.log(c.head(`\n${"=".repeat(68)}\n  ${title}\n${"=".repeat(68)}`));
}

async function once(url, init) {
	const started = Date.now();
	try {
		const res = await fetch(url, {
			...init,
			headers: { "user-agent": UA, ...(init.headers ?? {}) },
			signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
		});
		const text = await res.text();
		let json = null;
		try {
			json = JSON.parse(text);
		} catch {
			/* not json */
		}
		return { status: res.status, text, json, headers: res.headers, ms: Date.now() - started };
	} catch (e) {
		// status 0 means the request never got an answer at all — DNS, TLS, a
		// dropped socket, a timeout. It is NOT a verdict from the service.
		return {
			status: 0,
			text: String(e),
			json: null,
			headers: new Headers(),
			ms: Date.now() - started,
		};
	}
}

/**
 * One retry, and only on a transport failure.
 *
 * A run of these checks is long enough that a single dropped connection between
 * here and Mumbai turns into a screen of red that says nothing about the deploy
 * — a real run lost seventeen checks that way and every one of them passed on
 * the next attempt. A retry is safe here precisely because it is scoped to
 * `status === 0`: any actual answer from the service, including a 500, is
 * reported as it came back and never retried into looking healthy.
 */
export async function req(url, init = {}) {
	const first = await once(url, init);
	if (first.status !== 0) return first;
	await new Promise((r) => setTimeout(r, 1_500));
	const second = await once(url, init);
	return second.status === 0 ? first : second;
}

/** POST/PATCH/PUT with a JSON body, optionally bearing a token. */
export function send(url, method, body, token) {
	return req(url, {
		method,
		headers: {
			"content-type": "application/json",
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
		...(body === null || body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

export const bearer = (token) => ({ authorization: `Bearer ${token}` });

export async function adminToken(env) {
	const email = process.env.BIO_ADMIN_EMAIL;
	const password = process.env.BIO_ADMIN_PASSWORD;
	if (!email || !password) return null;
	const r = await send(`${env.api}/api/auth/admin-login`, "POST", { email, password });
	return r.json?.accessToken ?? null;
}

export async function studentToken(env) {
	const email = process.env.BIO_STUDENT_EMAIL;
	if (!email) return null;
	const r = await send(`${env.api}/api/auth/login-sync`, "POST", { email });
	return r.json?.accessToken ?? null;
}

/** Prints the tally and exits with the failure count, so CI can gate on it. */
export function summarise() {
	console.log(c.head(`\n${"=".repeat(68)}`));
	const skipped = state.skip ? `   ${c.dim(`${state.skip} skipped`)}` : "";
	console.log(
		`  ${c.ok(`${state.pass} passed`)}   ${state.fail ? c.no(`${state.fail} failed`) : "0 failed"}${skipped}`,
	);
	if (state.fail) {
		console.log(c.no("\n  Failures:"));
		for (const f of state.failures) console.log(`    · ${f}`);
	}
	console.log("");
	process.exit(Math.min(state.fail, 125));
}
