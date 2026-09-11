#!/usr/bin/env node
/**
 * End-to-end pipeline check for all four BIO portals.
 *
 *   node scripts/e2e/pipeline.mjs dev
 *   node scripts/e2e/pipeline.mjs demo
 *   node scripts/e2e/pipeline.mjs both
 *
 * `verify.mjs` answers "did the deploy land" — HTML, chunks, health, a handful of
 * routes. This answers the next question: **does each portal's journey actually
 * work end to end**, stage by stage, against the running environment.
 *
 * Every portal is walked in the order a real user walks it, and each stage
 * asserts the thing that would be broken if the stage were broken. Where a stage
 * writes data it is exercised up to — but not through — the write: a well-formed
 * request against a deliberately unknown id must come back 404, which proves the
 * route, the guard and the validation all ran and only the row was missing.
 * Nothing here creates a partner, approves anyone, or emails a real person.
 *
 * WHY THIS EXISTS
 * ---------------
 * The bug it was written for: an admin pressing "Grant access" on a partner got
 *   "Partner engine (admin-api) unreachable at http://localhost:4100"
 * for weeks. Two faults stacked, and neither was visible from any single service:
 *
 *   1. ADMIN_API_URL was never set in Parameter Store, so the API fell back to
 *      `localhost:4100` — which, from inside a bridge-networked container, is
 *      the container itself, not the instance where the engine sidecar listens.
 *   2. Once reachable, every engine query failed anyway: RDS enforces TLS and
 *      node-postgres connects in plaintext unless told not to.
 *
 * Both services were "healthy" throughout. Health checks test a service alone;
 * these checks test the edges *between* services, which is where this system
 * actually breaks. The `Service wiring` group below is the direct regression
 * guard, and it is deliberately the first thing that runs.
 *
 * Credentials (optional, but most stages are skipped without them):
 *   BIO_ADMIN_EMAIL / BIO_ADMIN_PASSWORD   an admin login
 *   BIO_STUDENT_EMAIL                      an existing student
 *
 * Exit code is the number of failures.
 */

import {
	adminToken,
	banner,
	bearer,
	c,
	check,
	ENVS,
	group,
	req,
	send,
	skip,
	studentToken,
	summarise,
} from "./harness.mjs";

/** A uuid that is valid in shape and certain not to exist. */
const NOPE = "00000000-0000-0000-0000-000000000000";

/**
 * A guarded route answers 401 to an anonymous caller. It answers **404 when the
 * build is stale** and the route was never registered, which is the failure this
 * distinction exists to catch — a 404 here has been the signature of every
 * "deployed the wrong commit" incident in this system.
 */
function checkGuarded(label, r) {
	return check(
		`${label} is deployed and guarded`,
		r.status === 401 || r.status === 403,
		r.status === 404 ? "404 — route missing, stale build" : `${r.status}`,
	);
}

/** Fetch a portal's HTML plus every chunk it names, and insist each is real JS. */
async function fetchPortalBundle(base, label) {
	const html = await req(base);
	const loaded = check(
		`${label} portal loads`,
		html.status === 200 && html.text.length > 500,
		`${html.status} ${html.text.length}b`,
	);
	if (!loaded) return null;

	const chunks = [
		...new Set([...html.text.matchAll(/\/_next\/static\/chunks\/[^"']+?\.js/g)].map((m) => m[0])),
	];
	if (chunks.length === 0) {
		check(`${label} references JS chunks`, false, "none found in HTML");
		return null;
	}

	const picked = chunks.slice(0, 20);
	const bodies = await Promise.all(picked.map((p) => req(`${base}${p}`)));
	const bad = bodies.filter(
		(x) => x.status !== 200 || !/javascript|ecmascript/i.test(x.headers.get("content-type") ?? ""),
	);
	check(
		`${label} all ${picked.length} chunks are real JS`,
		bad.length === 0,
		bad.length
			? `${bad.length} bad (first: ${bad[0].status} ${bad[0].headers.get("content-type")})`
			: "",
	);

	// A portal built against a developer's machine ships a bundle that points at
	// a port nobody else can reach. It renders perfectly and every call fails.
	const localhostRefs = bodies
		.map((b, i) => [picked[i], (b.text.match(/localhost:(4000|4100|3300|3001)/g) ?? [])[0]])
		.filter(([, hit]) => hit);
	check(
		`${label} bundle has no localhost API URL baked in`,
		localhostRefs.length === 0,
		localhostRefs.length ? `${localhostRefs[0][1]} in ${localhostRefs[0][0]}` : "",
	);

	return { html, bodies };
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. Service wiring — the edges between services
// ─────────────────────────────────────────────────────────────────────────────

async function checkWiring(env, tokens) {
	group("Service wiring — the hops between services");

	for (const [key, path] of [
		["api", "/api/health"],
		["exam", "/api/health"],
	]) {
		const r = await req(`${env[key]}${path}`);
		check(
			`${key} answers ${path}`,
			r.status === 200 && r.json?.status === "ok",
			`${r.status} ${r.ms}ms`,
		);
	}

	for (const [key, label] of [
		["engine", "partner engine (admin-api)"],
		["bff", "partner BFF (portal-api)"],
	]) {
		if (!env[key]) {
			skip(`${label} reachable`, "not deployed as its own host in this environment");
			continue;
		}
		const r = await req(`${env[key]}/health/live`, { timeoutMs: env.coldStartMs ?? 30_000 });
		check(`${label} answers /health/live`, r.status === 200, `${r.status} ${r.ms}ms`);
	}

	// THE regression guard. This single call crosses the exact edge that was
	// broken: admin console -> legacy backend -> (staff JWT, ADMIN_API_URL) ->
	// admin-api -> (TLS) -> Postgres, and back. A 500 mentioning "unreachable"
	// is fault 1; a 500 mentioning `Failed query` is fault 2.
	if (!tokens.admin) {
		skip("backend reaches the partner engine", "needs BIO_ADMIN_EMAIL / BIO_ADMIN_PASSWORD");
		return;
	}

	const list = await req(`${env.api}/api/admin/partner-requests`, {
		headers: bearer(tokens.admin),
	});
	const rows = Array.isArray(list.json) ? list.json : (list.json?.data ?? []);
	check(
		"admin can list partner requests",
		list.status === 200 && Array.isArray(rows),
		`${list.status}`,
	);

	const approved = rows.find((r) => r.partnerId);
	if (!approved) {
		skip("backend reaches the partner engine", "no approved partner to read");
		return;
	}

	const engine = await req(`${env.api}/api/admin/partners/${approved.partnerId}/engine`, {
		headers: bearer(tokens.admin),
	});
	const msg = engine.json?.message ?? "";
	check(
		"backend reaches the partner engine (ADMIN_API_URL is routable)",
		!/unreachable|starting up/i.test(msg),
		/unreachable|starting up/i.test(msg) ? msg.slice(0, 90) : "no connection error",
	);
	check(
		"partner engine can query its own database (TLS to Postgres)",
		!/Failed query/i.test(msg),
		/Failed query/i.test(msg) ? "Failed query — pool has no ssl config" : "queries run",
	);
	check(
		"engine read returns the partner, campaigns, funnel and payouts",
		engine.status === 200 &&
			engine.json?.partner?.id === approved.partnerId &&
			Array.isArray(engine.json?.campaigns) &&
			engine.json?.funnel &&
			Array.isArray(engine.json?.payouts),
		`${engine.status}`,
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Student portal
// ─────────────────────────────────────────────────────────────────────────────

async function checkStudentPortal(env, tokens) {
	banner(`Student portal — ${env.student}`);

	group("Stage 1 · the page a student lands on");
	await fetchPortalBundle(env.student, "student");

	group("Stage 2 · sign-up needs the address and school lookups");
	const pin = await req(`${env.api}/api/geo/pincode/441108`);
	check(
		"pincode resolves to a city",
		pin.status === 200 && Boolean(pin.json?.city),
		`${pin.status} ${pin.json?.city ?? ""}`,
	);

	// `?name=` and `?pincode=` both 500'd for weeks while `?q=` passed, because
	// the deployed Prisma client had School.code as non-nullable. Each shape gets
	// its own assertion for that reason.
	for (const qs of ["name=test", "pincode=400607", "q=test", ""]) {
		const r = await req(`${env.api}/api/schools?${qs}`);
		check(
			`school search ?${qs || "(none)"} works`,
			r.status === 200 && Array.isArray(r.json),
			`${r.status}`,
		);
	}
	const dir = await req(`${env.api}/api/schools?name=test`);
	check(
		"school search returns only onboarded schools",
		Array.isArray(dir.json) && dir.json.every((s) => s.onboarded === true),
		`${dir.json?.length ?? 0} rows`,
	);

	group("Stage 3 · sign-in");
	if (!tokens.student) {
		skip("student sign-in and everything behind it", "needs BIO_STUDENT_EMAIL");
	} else {
		check("student token issued", true);
		const me = await req(`${env.api}/api/auth/me`, { headers: bearer(tokens.student) });
		check(
			"profile loads for the signed-in student",
			me.status === 200 && Boolean(me.json?.id ?? me.json?.email),
			`${me.status}`,
		);
	}
	checkGuarded("GET /auth/me", await req(`${env.api}/api/auth/me`));

	group("Stage 4 · registration — consent, guardian, schedule");
	for (const path of [
		"/api/consent/me",
		"/api/guardian/me",
		"/api/my-schedule",
		"/api/users/profile",
	]) {
		checkGuarded(`GET ${path}`, await req(`${env.api}${path}`));
	}
	if (tokens.student) {
		for (const path of ["/api/consent/me", "/api/guardian/me", "/api/my-schedule"]) {
			const r = await req(`${env.api}${path}`, { headers: bearer(tokens.student) });
			check(`GET ${path} answers a signed-in student`, r.status === 200, `${r.status}`);
		}
	}
	// The identity-document upload is the path the ALB WAF twice mistook for an
	// attack, because a JPEG's XMP metadata reads like markup to the core rule
	// set. It must reject an anonymous caller with 401 — never a bare 403 from
	// the WAF, which arrives with no CORS header and shows the student
	// "we couldn't reach our servers".
	const doc = await req(`${env.api}/api/guardian/id-document`, { method: "POST" });
	check(
		"identity-document upload is reachable (not WAF-blocked)",
		doc.status === 401 || doc.status === 400,
		doc.status === 403 ? "403 — WAF is eating the upload path" : `${doc.status}`,
	);

	group("Stage 5 · access pass and payment");
	for (const path of ["/api/access-pass/me", "/api/payments/my-payments"]) {
		checkGuarded(`GET ${path}`, await req(`${env.api}${path}`));
	}
	checkGuarded(
		"POST /access-pass/reconcile",
		await req(`${env.api}/api/access-pass/reconcile`, { method: "POST" }),
	);
	// Public by design: the peer environment polls it to reconcile a ₹1 unlock.
	const shared = await req(`${env.api}/api/payments/shared-link/check?email=nobody@example.com`);
	check(
		"shared-link payment check is public and answers",
		shared.status === 200,
		`${shared.status}`,
	);
	if (tokens.student) {
		const pass = await req(`${env.api}/api/access-pass/me`, { headers: bearer(tokens.student) });
		check("access pass reads for a signed-in student", pass.status === 200, `${pass.status}`);
	}

	group("Stage 6 · the exam itself");
	// The catalogue is a signed-in surface: `findAvailableExams` filters by the
	// caller's class band, so there is no anonymous view of it to check.
	for (const path of ["/api/exams", "/api/exams/upcoming", "/api/exams/trial"]) {
		checkGuarded(`GET ${path}`, await req(`${env.api}${path}`));
	}
	let exams = { json: null };
	let trial = { json: null };
	let practice = null;
	if (tokens.student) {
		const auth = { headers: bearer(tokens.student) };
		exams = await req(`${env.api}/api/exams`, auth);
		check(
			"exam catalogue loads for a student",
			exams.status === 200 && Array.isArray(exams.json),
			`${exams.status} ${exams.json?.length ?? 0} exams`,
		);
		trial = await req(`${env.api}/api/exams/trial`, auth);
		check(
			"the trial paper is published",
			trial.status === 200 && Boolean(trial.json?.id),
			`${trial.status}`,
		);
		const upcoming = await req(`${env.api}/api/exams/upcoming`, auth);
		check("upcoming instances load", upcoming.status === 200, `${upcoming.status}`);

		// `isPractice` is computed on the *detail* endpoint, not the list — so
		// finding the practice paper means opening each exam, which is also the
		// read the player makes when a student starts one. Two things for the
		// price of one: the detail endpoint works, and it carries the flag.
		const catalogue = Array.isArray(exams.json) ? exams.json.slice(0, 8) : [];
		const details = await Promise.all(
			catalogue.map((e) => req(`${env.api}/api/exams/${e.id}`, auth)),
		);
		if (catalogue.length) {
			check(
				"every exam in the catalogue opens with its sections",
				details.every((d) => d.status === 200 && Array.isArray(d.json?.sections)),
				`${details.filter((d) => d.status === 200).length}/${details.length} opened`,
			);
			check(
				"every exam detail carries the isPractice flag the player reads",
				details.every((d) => d.status !== 200 || typeof d.json?.isPractice === "boolean"),
			);
			practice = details.map((d) => d.json).find((e) => e?.isPractice && !e?.isTrial) ?? null;
		}
	} else {
		skip("the exam catalogue, trial paper and schedule", "needs BIO_STUDENT_EMAIL");
	}
	checkGuarded("GET /attempts/trial-status", await req(`${env.api}/api/attempts/trial-status`));
	checkGuarded(
		"POST /exams/:id/start",
		await req(`${env.api}/api/exams/${NOPE}/start`, { method: "POST" }),
	);
	checkGuarded(
		"POST /proctor/events",
		await req(`${env.api}/api/proctor/events`, { method: "POST" }),
	);
	checkGuarded("GET /proctor/enrollment", await req(`${env.api}/api/proctor/enrollment`));

	group("Stage 7 · after the paper — results, feedback, support");
	checkGuarded("GET /attempts/results", await req(`${env.api}/api/attempts/results`));
	checkGuarded("GET /certificates/me", await req(`${env.api}/api/certificates/me`));

	if (tokens.student) {
		const results = await req(`${env.api}/api/attempts/results`, {
			headers: bearer(tokens.student),
		});
		const rows = Array.isArray(results.json) ? results.json : [];
		check(
			"results list loads",
			results.status === 200 && Array.isArray(results.json),
			`${results.status} ${rows.length} rows`,
		);

		// The submitted screen reads these five fields off the row it picks by
		// examId. A row missing any of them renders a blank score card.
		if (rows.length) {
			const shape = rows.every(
				(r) =>
					typeof r.examId === "string" &&
					typeof r.score === "number" &&
					typeof r.total === "number" &&
					"isReleased" in r &&
					typeof r.violationCount === "number",
			);
			check(
				"every result row carries what the submitted screen reads",
				shape,
				`${rows.length} rows`,
			);
		} else {
			skip("result row shape", "this student has no submitted attempts");
		}

		// The rule, and the correction to it: the **trial rehearsal** never
		// produces a result, but a **practice paper is scored** and must appear.
		// Both halves were wrong at different times, so both are pinned.
		if (trial.json?.id) {
			check(
				"the trial rehearsal produces no result anywhere",
				!rows.some((r) => r.examId === trial.json.id),
				`trial ${trial.json.id.slice(0, 8)}`,
			);
		}
		if (practice) {
			const sat = rows.filter((r) => r.examId === practice.id);
			if (sat.length) {
				check(
					"a practice paper the student sat IS scored and listed",
					sat.every((r) => typeof r.score === "number"),
					`${practice.title}: ${sat[0].score}/${sat[0].total}`,
				);
			} else {
				skip("practice paper is scored", "this student has not sat one");
			}
		} else {
			skip("practice paper is scored", "no practice paper in the catalogue");
		}

		group("Stage 7b · feedback rules, over real HTTP");
		const post = (body) => send(`${env.api}/api/exam-feedback`, "POST", body, tokens.student);
		// A 400 proves validation ran. A 404 on a well-formed body proves
		// validation passed and only the attempt was unknown — that is the whole
		// rule set, expressed as the difference between those two codes.
		check("rating 0 rejected", (await post({ attemptId: NOPE, rating: 0 })).status === 400);
		check("rating 6 rejected", (await post({ attemptId: NOPE, rating: 6 })).status === 400);
		check(
			"1 star with no comment rejected",
			(await post({ attemptId: NOPE, rating: 1 })).status === 400,
		);
		check(
			"1–2 stars with a too-short comment rejected",
			(await post({ attemptId: NOPE, rating: 2, comment: "bad" })).status === 400,
		);
		check(
			"5 stars with no comment passes validation",
			(await post({ attemptId: NOPE, rating: 5 })).status === 404,
		);
		check(
			"1 star with a long-enough comment passes validation",
			(await post({ attemptId: NOPE, rating: 1, comment: "x".repeat(25) })).status === 404,
		);

		const noProof = await send(
			`${env.api}/api/grievances`,
			"POST",
			{ type: "GRIEVANCE", subject: "Date change", description: "Please move my exam." },
			tokens.student,
		);
		check(
			"a support request without proof is rejected",
			noProof.status === 400,
			`${noProof.status}`,
		);
	} else {
		skip("results, feedback and support rules", "needs BIO_STUDENT_EMAIL");
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. School portal
// ─────────────────────────────────────────────────────────────────────────────

async function checkSchoolPortal(env, tokens) {
	banner(`School portal — ${env.school}`);

	group("Stage 1 · the page a school lands on");
	await fetchPortalBundle(env.school, "school");

	group("Stage 2 · apply — verify the email first, then the application");
	// Verify-first onboarding: the address is confirmed before an application is
	// accepted, so both routes must exist and both must validate their input.
	const startBad = await send(`${env.api}/api/school/verification/start`, "POST", {});
	check("verification/start validates its input", startBad.status === 400, `${startBad.status}`);
	const confirmBad = await send(`${env.api}/api/school/verification/confirm`, "POST", {
		email: "x@y.z",
		code: "000000",
	});
	check(
		"verification/confirm rejects a wrong code",
		[400, 401, 404].includes(confirmBad.status),
		`${confirmBad.status}`,
	);
	const applyBad = await send(`${env.api}/api/school/apply`, "POST", {});
	check("school/apply validates its input", applyBad.status === 400, `${applyBad.status}`);
	const resend = await send(`${env.api}/api/school/resend-verification`, "POST", {});
	check("resend-verification is deployed", resend.status !== 404, `${resend.status}`);

	group("Stage 3 · sign-in and password recovery");
	const login = await send(`${env.api}/api/school/login`, "POST", {
		email: "nobody@example.com",
		password: "definitely-wrong",
	});
	check(
		"school login rejects unknown credentials",
		[400, 401].includes(login.status),
		`${login.status}`,
	);
	for (const path of [
		"/api/school/forgot-password",
		"/api/school/reset-password",
		"/api/school/set-password",
	]) {
		const r = await send(`${env.api}${path}`, "POST", {});
		check(`POST ${path} is deployed`, r.status !== 404, `${r.status}`);
	}

	group("Stage 4 · the admin side of a school application");
	checkGuarded("GET /admin/school-requests", await req(`${env.api}/api/admin/school-requests`));
	checkGuarded(
		"PATCH /admin/school-requests/:id",
		await send(`${env.api}/api/admin/school-requests/${NOPE}`, "PATCH", { decision: "APPROVED" }),
	);
	checkGuarded("GET /admin/schools", await req(`${env.api}/api/admin/schools`));

	if (!tokens.admin) {
		skip("signed-in school administration", "needs BIO_ADMIN_EMAIL / BIO_ADMIN_PASSWORD");
		return;
	}
	const auth = bearer(tokens.admin);
	const reqs = await req(`${env.api}/api/admin/school-requests`, { headers: auth });
	const rows = Array.isArray(reqs.json) ? reqs.json : (reqs.json?.data ?? []);
	check(
		"admin can list school requests",
		reqs.status === 200 && Array.isArray(rows),
		`${reqs.status} ${rows.length} rows`,
	);

	const schools = await req(`${env.api}/api/admin/schools`, { headers: auth });
	check("admin can list onboarded schools", schools.status === 200, `${schools.status}`);

	// A decision on an id that does not exist must be a clean 404, not a 500 —
	// that proves the decision path runs before it touches the row.
	const decide = await send(
		`${env.api}/api/admin/school-requests/${NOPE}`,
		"PATCH",
		{ decision: "APPROVED", reason: "pipeline probe" },
		tokens.admin,
	);
	check(
		"deciding an unknown school request is a clean 404",
		decide.status === 404,
		`${decide.status}`,
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Partner portal
// ─────────────────────────────────────────────────────────────────────────────

async function checkPartnerPortal(env, tokens) {
	banner(`Partner portal — ${env.partner}`);

	group("Stage 1 · the page a partner lands on");
	await fetchPortalBundle(env.partner, "partner");

	group("Stage 2 · apply — verify the email first, then the application");
	const startBad = await send(`${env.api}/api/partner/verification/start`, "POST", {});
	check("verification/start validates its input", startBad.status === 400, `${startBad.status}`);
	const applyBad = await send(`${env.api}/api/partner/apply`, "POST", {});
	check("partner/apply validates its input", applyBad.status === 400, `${applyBad.status}`);
	for (const path of [
		"/api/partner/verify-email",
		"/api/partner/resend-verification",
		"/api/partner/forgot-password",
	]) {
		const r = await send(`${env.api}${path}`, "POST", {});
		check(`POST ${path} is deployed`, r.status !== 404, `${r.status}`);
	}

	group("Stage 3 · sign-in with an access token");
	const login = await send(`${env.api}/api/partner/login`, "POST", {
		accessToken: "PARTNER-not-a-real-token",
	});
	check(
		"partner login rejects a bogus access token",
		[400, 401].includes(login.status),
		`${login.status}`,
	);

	group("Stage 4 · everything behind the partner session");
	for (const path of [
		"/api/partner/portal/overview",
		"/api/partner/portal/schools",
		"/api/partner/portal/students",
		"/api/partner/portal/results",
		"/api/partner/portal/profile",
		"/api/partner/portal/payouts",
		"/api/partner/portal/bank-details",
		"/api/partner/schools",
		"/api/partner/announcements",
		"/api/partner/support",
	]) {
		checkGuarded(`GET ${path}`, await req(`${env.api}${path}`));
	}

	group("Stage 5 · the BFF and the engine behind the portal");
	if (!env.bff) {
		skip("partner BFF routes", "portal-api is not its own host in this environment");
	} else {
		// A 401 here proves the BFF is up AND that it got far enough to check the
		// caller. A 500 would mean it fell over reaching the engine — the same
		// ADMIN_API_URL fault, one service along.
		for (const path of [
			"/partner/me",
			"/partner/institutions",
			"/partner/funnel",
			"/partner/applications/me",
		]) {
			const r = await req(`${env.bff}${path}`, { timeoutMs: env.coldStartMs ?? 30_000 });
			check(
				`BFF ${path} answers without a 5xx`,
				r.status >= 200 && r.status < 500,
				r.status >= 500 ? `${r.status} — BFF cannot reach the engine` : `${r.status}`,
			);
		}
	}

	group("Stage 6 · the admin levers over a partner");
	checkGuarded("GET /admin/partner-requests", await req(`${env.api}/api/admin/partner-requests`));
	checkGuarded(
		"PATCH /admin/partner-requests/:id",
		await send(`${env.api}/api/admin/partner-requests/${NOPE}`, "PATCH", { decision: "APPROVED" }),
	);
	checkGuarded(
		"GET /admin/partners/:id/engine",
		await req(`${env.api}/api/admin/partners/${NOPE}/engine`),
	);
	checkGuarded(
		"POST /admin/partners/:id/payouts",
		await send(`${env.api}/api/admin/partners/${NOPE}/payouts`, "POST", { amountPaise: 1 }),
	);
	checkGuarded(
		"GET /admin/partners/:id/bank-details/reveal",
		await req(`${env.api}/api/admin/partners/${NOPE}/bank-details/reveal`),
	);

	if (!tokens.admin) {
		skip("the grant-access path", "needs BIO_ADMIN_EMAIL / BIO_ADMIN_PASSWORD");
		return;
	}

	// The grant itself is a real side effect — it mints an access token and
	// emails a real person — so it is exercised up to the write and no further.
	// An unknown id must come back 404 from the *application*, which means the
	// route, the role guard and the lookup all ran.
	const grant = await send(
		`${env.api}/api/admin/partner-requests/${NOPE}`,
		"PATCH",
		{ decision: "APPROVED", reason: "pipeline probe — expected to 404" },
		tokens.admin,
	);
	check(
		"granting access to an unknown partner is a clean 404",
		grant.status === 404,
		`${grant.status}`,
	);
	check(
		"the grant path does not fail on the engine hop",
		!/unreachable|Failed query|starting up/i.test(grant.json?.message ?? ""),
		(grant.json?.message ?? "").slice(0, 80),
	);

	const auth = bearer(tokens.admin);
	const list = await req(`${env.api}/api/admin/partner-requests`, { headers: auth });
	const rows = Array.isArray(list.json) ? list.json : (list.json?.data ?? []);
	check(
		"admin can list partner requests",
		list.status === 200 && Array.isArray(rows),
		`${list.status} ${rows.length} rows`,
	);

	const approved = rows.find((r) => r.partnerId);
	if (!approved) {
		skip("engine-backed partner views", "no approved partner in this environment");
		return;
	}
	const engine = await req(`${env.api}/api/admin/partners/${approved.partnerId}/engine`, {
		headers: auth,
	});
	check("engine view loads for an approved partner", engine.status === 200, `${engine.status}`);
	check(
		"engine view carries campaigns, funnel, payouts and bank details",
		engine.status === 200 &&
			Array.isArray(engine.json?.campaigns) &&
			typeof engine.json?.funnel?.signups === "number" &&
			Array.isArray(engine.json?.payouts) &&
			"bankDetails" in (engine.json ?? {}),
		engine.status === 200 ? Object.keys(engine.json ?? {}).join(",") : "",
	);
	// Masked by default: the account number and PAN only come back on a
	// deliberate, audited reveal.
	const bank = engine.json?.bankDetails;
	if (bank) {
		check(
			"bank details are masked in the ordinary view",
			!("accountNumber" in bank) && !("pan" in bank),
			Object.keys(bank).join(","),
		);
	} else {
		skip("bank details are masked", "this partner has submitted none");
	}

	const card = await req(`${env.api}/api/admin/partner-requests/${approved.id}/card`, {
		headers: auth,
	});
	check("the handover card loads for an approved partner", card.status === 200, `${card.status}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Admin portal
// ─────────────────────────────────────────────────────────────────────────────

async function checkAdminPortal(env, tokens) {
	banner(`Admin portal — ${env.admin}`);

	group("Stage 1 · the page an admin lands on");
	await fetchPortalBundle(env.admin, "admin");

	group("Stage 2 · sign-in");
	const bad = await send(`${env.api}/api/auth/admin-login`, "POST", {
		email: "admin@bharatolympiad.in",
		password: "definitely-wrong",
	});
	check("admin login rejects a wrong password", bad.status === 401, `${bad.status}`);

	if (!tokens.admin) {
		skip("every signed-in admin surface", "needs BIO_ADMIN_EMAIL / BIO_ADMIN_PASSWORD");
		return;
	}
	check("admin login succeeds with the right password", true);
	const auth = bearer(tokens.admin);

	group("Stage 3 · a student token must not open an admin door");
	if (tokens.student) {
		const forbidden = await req(`${env.api}/api/auth/admin/users`, {
			headers: bearer(tokens.student),
		});
		check(
			"a student token is refused on an admin route",
			forbidden.status === 401 || forbidden.status === 403,
			`${forbidden.status}`,
		);
	} else {
		skip("student token refused on admin routes", "needs BIO_STUDENT_EMAIL");
	}

	group("Stage 4 · every console surface loads");
	const surfaces = [
		["students", "/api/auth/admin/users"],
		["exams", "/api/admin/exams"],
		["questions", "/api/admin/questions"],
		["media", "/api/admin/media"],
		["school requests", "/api/admin/school-requests"],
		["partner requests", "/api/admin/partner-requests"],
		["payments", "/api/admin/payments"],
		["access passes", "/api/admin/access-passes"],
		["coupons", "/api/admin/coupons"],
		["grievances", "/api/admin/grievances"],
		["refunds", "/api/admin/refunds"],
		["certificates", "/api/admin/certificates"],
		["results", "/api/admin/results"],
		["slots", "/api/admin/slots"],
		["exam feedback", "/api/admin/exam-feedback"],
		["proctor review queue", "/api/proctor/review/queue"],
		["live proctoring", "/api/proctor/live"],
		["user management", "/api/admin/manage/users"],
		["archive", "/api/admin/manage/archive"],
	];
	for (const [label, path] of surfaces) {
		const r = await req(`${env.api}${path}`, { headers: auth });
		check(
			`admin ${label} loads`,
			r.status === 200,
			`${r.status}${r.status === 404 ? " — route missing" : ""}`,
		);
	}

	group("Stage 5 · the feedback summary keeps its shape");
	const sum = await req(`${env.api}/api/admin/exam-feedback/summary`, { headers: auth });
	check(
		"feedback summary reports all five star buckets",
		sum.status === 200 && [1, 2, 3, 4, 5].every((n) => n in (sum.json?.distribution ?? {})),
		`${sum.status}`,
	);

	group("Stage 6 · notification health");
	for (const [label, path] of [
		["SMS", "/api/admin/notifications/sms-health"],
		["WhatsApp", "/api/admin/whatsapp/health"],
	]) {
		const r = await req(`${env.api}${path}`, { headers: auth });
		check(`${label} health endpoint answers`, r.status === 200, `${r.status}`);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cross-portal
// ─────────────────────────────────────────────────────────────────────────────

async function checkCrossPortal(env) {
	banner("Cross-portal");

	group("CORS — each portal origin, and nobody else's");
	for (const key of ["student", "school", "partner", "admin"]) {
		const origin = env[key];
		const r = await req(`${env.api}/api/schools?name=test`, { headers: { origin } });
		check(
			`API accepts the ${key} portal origin`,
			r.headers.get("access-control-allow-origin") === origin,
			r.headers.get("access-control-allow-origin") ?? "header absent",
		);
	}
	const evil = await req(`${env.api}/api/schools?name=test`, {
		headers: { origin: "https://evil.example.com" },
	});
	check(
		"API refuses an origin it does not know",
		evil.headers.get("access-control-allow-origin") !== "https://evil.example.com",
		evil.headers.get("access-control-allow-origin") ?? "header absent",
	);

	group("Transport");
	const probes = [
		["student", env.student],
		["school", env.school],
		["partner", env.partner],
		["admin", env.admin],
		["api", `${env.api}/api/health`],
		["exam", `${env.exam}/api/health`],
	];
	for (const [key, url] of probes) {
		if (!url?.startsWith("https://")) {
			check(`${key} is served over HTTPS`, false, url ?? "not configured");
			continue;
		}
		const r = await req(url);
		check(`${key} answers over HTTPS`, r.status === 200, `${r.status}`);
	}
}

// ─────────────────────────────────────────────────────────────────────────────

async function runEnv(name) {
	const env = ENVS[name];
	banner(`${env.label}`);
	const tokens = { admin: await adminToken(env), student: await studentToken(env) };
	if (!tokens.admin)
		console.log(c.dim("  (no admin credentials — signed-in stages will be skipped)"));
	if (!tokens.student) console.log(c.dim("  (no student email — student stages will be skipped)"));

	await checkWiring(env, tokens);
	await checkStudentPortal(env, tokens);
	await checkSchoolPortal(env, tokens);
	await checkPartnerPortal(env, tokens);
	await checkAdminPortal(env, tokens);
	await checkCrossPortal(env);
}

const arg = process.argv[2] ?? "dev";
if (arg === "both") {
	await runEnv("dev");
	await runEnv("demo");
} else if (ENVS[arg]) {
	await runEnv(arg);
} else {
	console.error(`Unknown environment "${arg}". Use: dev | demo | both`);
	process.exit(2);
}

summarise();
