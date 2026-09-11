#!/usr/bin/env node
/**
 * Post-deploy verification for a whole BIO environment.
 *
 *   node scripts/e2e/verify.mjs dev
 *   node scripts/e2e/verify.mjs demo
 *   node scripts/e2e/verify.mjs both        # runs each, then compares them
 *
 * Read-only apart from one thing: with ADMIN_EMAIL/ADMIN_PASSWORD in the
 * environment it signs in as admin to prove the guarded routes actually work
 * rather than merely 401-ing. It never writes application data.
 *
 * Why this exists rather than more unit tests: every outage in this system so
 * far has been a *deployment* fault that no unit test could have caught — a
 * stale `index.html` served beside newly-hashed chunks, a container built from
 * a source tree three weeks behind, an env var that was set in `.env` but never
 * in Parameter Store. Those are only visible from outside, against the running
 * thing, so that is what this checks.
 *
 * Exit code is the number of failures, so CI can gate on it.
 */

import { adminToken, c, check, ENVS, req, summarise } from "./harness.mjs";

// ── Groups ───────────────────────────────────────────────────────────────────

async function checkHealth(env) {
	console.log(c.head("\n  Service health"));
	for (const key of ["api", "exam"]) {
		const r = await req(`${env[key]}/api/health`);
		check(
			`${key} /api/health`,
			r.status === 200 && r.json?.status === "ok",
			`${r.status} ${r.ms}ms`,
		);
	}
}

/**
 * A page is not "up" because it returns 200.
 *
 * The worst outage this system has had returned 200 on every HTML page while
 * every JS chunk 404'd into the SPA fallback, so the browser was handed
 * `text/html` where it expected JavaScript and the app never mounted. That is
 * exactly what this checks: fetch the HTML, then fetch every chunk it names and
 * insist each one is really JavaScript.
 */
async function checkPortals(env) {
	console.log(c.head("\n  Portals — HTML and chunk integrity"));
	for (const key of ["student", "school", "partner", "admin"]) {
		const r = await req(env[key]);
		check(`${key} loads`, r.status === 200 && r.text.length > 500, `${r.status} ${r.text.length}b`);
		if (r.status !== 200) continue;

		const chunks = [
			...new Set([...r.text.matchAll(/\/_next\/static\/chunks\/[^"']+?\.js/g)].map((m) => m[0])),
		];
		if (chunks.length === 0) {
			check(`${key} references JS chunks`, false, "none found in HTML");
			continue;
		}

		const results = await Promise.all(chunks.slice(0, 25).map((p) => req(`${env[key]}${p}`)));
		const bad = results.filter(
			(x) =>
				x.status !== 200 || !/javascript|ecmascript/i.test(x.headers.get("content-type") ?? ""),
		);
		check(
			`${key} all ${Math.min(chunks.length, 25)} chunks are real JS`,
			bad.length === 0,
			bad.length
				? `${bad.length} bad (first: ${bad[0].status} ${bad[0].headers.get("content-type")})`
				: "",
		);
	}
}

async function checkPublicApi(env) {
	console.log(c.head("\n  Public API"));

	const pin = await req(`${env.api}/api/geo/pincode/441108`);
	check(
		"pincode lookup resolves",
		pin.status === 200 && pin.json?.city,
		`${pin.status} ${pin.json?.city ?? ""}`,
	);

	// Regression guard: `?name=` and `?pincode=` both 500'd for weeks because the
	// deployed Prisma client had School.code as non-nullable. `?q=` alone passed.
	for (const qs of ["name=test", "pincode=400607", "q=test", ""]) {
		const r = await req(`${env.api}/api/schools?${qs}`);
		check(
			`schools?${qs || "(no params)"} does not 500`,
			r.status === 200 && Array.isArray(r.json),
			`${r.status}`,
		);
	}

	const onboarded = await req(`${env.api}/api/schools?name=test`);
	check(
		"school search only returns onboarded schools",
		Array.isArray(onboarded.json) && onboarded.json.every((s) => s.onboarded === true),
		`${onboarded.json?.length ?? 0} rows`,
	);
}

async function checkCors(env) {
	console.log(c.head("\n  CORS"));
	const origin = env.student;
	const r = await req(`${env.api}/api/schools?name=test`, { headers: { origin } });
	check(
		"API echoes the portal origin",
		r.headers.get("access-control-allow-origin") === origin,
		r.headers.get("access-control-allow-origin") ?? "header absent",
	);
	const evil = await req(`${env.api}/api/schools?name=test`, {
		headers: { origin: "https://evil.example.com" },
	});
	check(
		"API does not echo an unknown origin",
		evil.headers.get("access-control-allow-origin") !== "https://evil.example.com",
		evil.headers.get("access-control-allow-origin") ?? "header absent",
	);
}

/** Every new route exists and refuses an anonymous caller. */
async function checkGuards(env) {
	console.log(c.head("\n  Auth guards on the 2026-09-10 features"));
	const cases = [
		["POST", "/api/exam-feedback", { rating: 5, attemptId: "x" }],
		["GET", "/api/exam-feedback/attempt/abc", null],
		["GET", "/api/admin/exam-feedback", null],
		["GET", "/api/admin/exam-feedback/summary", null],
		["POST", "/api/grievances/attachment", null],
		["POST", "/api/grievances", { type: "GRIEVANCE", subject: "s", description: "d" }],
		["GET", "/api/attempts/results", null],
		["GET", "/api/access-pass/me", null],
	];
	for (const [method, path, body] of cases) {
		const r = await req(`${env.api}${path}`, {
			method,
			...(body
				? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
				: {}),
		});
		// 401 = exists and is guarded. 404 = the route is missing, i.e. a stale build.
		check(`${method} ${path} is guarded (not missing)`, r.status === 401, `${r.status}`);
	}
}

async function checkAdmin(env) {
	console.log(c.head("\n  Admin (needs BIO_ADMIN_EMAIL / BIO_ADMIN_PASSWORD)"));
	const bad = await req(`${env.api}/api/auth/admin-login`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ email: "admin@bharatolympiad.in", password: "definitely-wrong" }),
	});
	check("admin login rejects a wrong password", bad.status === 401, `${bad.status}`);

	const token = await adminToken(env);
	if (!token) {
		console.log(`  ${c.dim("SKIP")} ${c.dim("signed-in admin checks — credentials not in env")}`);
		return;
	}
	check("admin login succeeds with the right password", Boolean(token));

	const auth = { authorization: `Bearer ${token}` };
	const list = await req(`${env.api}/api/admin/exam-feedback`, { headers: auth });
	check(
		"admin can read exam feedback",
		list.status === 200 && Array.isArray(list.json),
		`${list.status}`,
	);

	const sum = await req(`${env.api}/api/admin/exam-feedback/summary`, { headers: auth });
	check(
		"feedback summary reports all five buckets",
		sum.status === 200 &&
			sum.json &&
			[1, 2, 3, 4, 5].every((n) => n in (sum.json.distribution ?? {})),
		`${sum.status}`,
	);

	const users = await req(`${env.api}/api/auth/admin/users`, { headers: auth });
	check(
		"admin can list students",
		users.status === 200,
		`${users.status} ${Array.isArray(users.json) ? `${users.json.length} rows` : ""}`,
	);
}

/**
 * The feedback rules, exercised through the real HTTP surface.
 *
 * Uses a throwaway attempt id, so every call must be rejected — but by the
 * *right* error. A 400 for a bad rating proves validation ran; a 404 for a
 * well-formed request proves validation passed and ownership was checked. That
 * distinction is the whole rule set.
 */
async function checkFeedbackRules(env) {
	console.log(c.head("\n  Feedback rules (via HTTP, no data written)"));
	const email = process.env.BIO_STUDENT_EMAIL;
	if (!email) {
		console.log(`  ${c.dim("SKIP")} ${c.dim("needs BIO_STUDENT_EMAIL of an existing student")}`);
		return;
	}
	const login = await req(`${env.api}/api/auth/login-sync`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ email }),
	});
	const token = login.json?.accessToken;
	if (!token) {
		check("student token obtained", false, `${login.status}`);
		return;
	}
	check("student token obtained", true);

	const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
	const post = (body) =>
		req(`${env.api}/api/exam-feedback`, {
			method: "POST",
			headers: auth,
			body: JSON.stringify(body),
		});

	const NOPE = "00000000-0000-0000-0000-000000000000";
	const r0 = await post({ attemptId: NOPE, rating: 0 });
	check("rating 0 rejected", r0.status === 400, `${r0.status}`);

	const r6 = await post({ attemptId: NOPE, rating: 6 });
	check("rating 6 rejected", r6.status === 400, `${r6.status}`);

	const low = await post({ attemptId: NOPE, rating: 1 });
	check("1 star with no comment rejected", low.status === 400, `${low.status}`);

	const short = await post({ attemptId: NOPE, rating: 2, comment: "bad" });
	check("1–2 stars with a too-short comment rejected", short.status === 400, `${short.status}`);

	// Valid shape, unknown attempt → 404, which proves the rules let it through.
	const ok = await post({ attemptId: NOPE, rating: 5 });
	check(
		"5 stars with no comment passes validation",
		ok.status === 404,
		`${ok.status} (404 = validation ok, attempt unknown)`,
	);

	const okLow = await post({ attemptId: NOPE, rating: 1, comment: "x".repeat(25) });
	check(
		"1 star with a long-enough comment passes validation",
		okLow.status === 404,
		`${okLow.status}`,
	);

	// Support proof is compulsory.
	const noProof = await req(`${env.api}/api/grievances`, {
		method: "POST",
		headers: auth,
		body: JSON.stringify({
			type: "GRIEVANCE",
			subject: "Date change",
			description: "Please move my exam.",
		}),
	});
	check("grievance without a document rejected", noProof.status === 400, `${noProof.status}`);
}

async function runEnv(name) {
	const env = ENVS[name];
	console.log(c.head(`\n${"=".repeat(64)}\n  ${env.label}\n${"=".repeat(64)}`));
	await checkHealth(env);
	await checkPortals(env);
	await checkPublicApi(env);
	await checkCors(env);
	await checkGuards(env);
	await checkAdmin(env);
	await checkFeedbackRules(env);
}

/** Feature parity: the same routes must exist in both environments. */
async function checkParity() {
	console.log(c.head(`\n${"=".repeat(64)}\n  dev ↔ demo parity\n${"=".repeat(64)}`));
	const routes = [
		["POST", "/api/exam-feedback"],
		["GET", "/api/admin/exam-feedback"],
		["GET", "/api/admin/exam-feedback/summary"],
		["POST", "/api/grievances/attachment"],
	];
	console.log(c.head("\n  Same routes deployed to both"));
	for (const [method, path] of routes) {
		const [d, p] = await Promise.all([
			req(`${ENVS.dev.api}${path}`, { method }),
			req(`${ENVS.demo.api}${path}`, { method }),
		]);
		check(
			`${method} ${path} present in both`,
			d.status === p.status && d.status !== 404,
			`dev ${d.status} / demo ${p.status}`,
		);
	}

	console.log(c.head("\n  Same school directory"));
	const [d, p] = await Promise.all([
		req(`${ENVS.dev.api}/api/schools?name=test`),
		req(`${ENVS.demo.api}/api/schools?name=test`),
	]);
	const dn = Array.isArray(d.json) ? d.json.length : -1;
	const pn = Array.isArray(p.json) ? p.json.length : -1;
	check("school search returns the same count", dn === pn && dn >= 0, `dev ${dn} / demo ${pn}`);
}

const arg = process.argv[2] ?? "both";
if (arg === "both") {
	await runEnv("dev");
	await runEnv("demo");
	await checkParity();
} else if (ENVS[arg]) {
	await runEnv(arg);
} else {
	console.error(`Unknown environment "${arg}". Use: dev | demo | both`);
	process.exit(2);
}

summarise();
