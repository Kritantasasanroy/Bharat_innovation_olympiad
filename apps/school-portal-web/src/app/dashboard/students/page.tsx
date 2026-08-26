"use client";

import { type ChangeEvent, type DragEvent, useMemo, useRef, useState } from "react";
import { SchoolStepGuide } from "../../../components/step-guide";
import {
	ApiError,
	type NewStudent,
	type PortalStudent,
	portalApi,
	type RegisterStudentsResult,
} from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { downloadCsv } from "../../../lib/csv";
import { useResource } from "../../../lib/use-resource";

type Filter = "ALL" | "INVITED" | "PARTICIPATING";
type SortOption =
	| "class-asc"
	| "class-desc"
	| "status-completed"
	| "status-invited"
	| "name-asc"
	| "name-desc"
	| "score-desc";

const STATUS_BADGE: Record<PortalStudent["status"], string> = {
	INVITED: "badge",
	REGISTERED: "badge badge--pending",
	PAID: "badge badge--pending",
	COMPLETED: "badge badge--positive",
};

interface ParsedRow {
	id: string;
	name: string;
	classBand: string;
	email: string;
	valid: boolean;
	error?: string | undefined;
}

/**
 * View invited (§2.6) and participating (§2.7) students, plus bulk upload (§2.8) and school referral link.
 *
 * Registering students is the ONE thing a school may write. It creates each
 * student as an invited roster entry; the student claims the account by
 * registering with that email. Alternatively, students can onboard via the School Referral link.
 */
export default function StudentsPage() {
	const { token } = useAuth();
	const { data: students, loading, error, reload } = useResource(portalApi.students);
	const { data: profile } = useResource(portalApi.profile);

	const [filter, setFilter] = useState<Filter>("ALL");
	const [classFilter, setClassFilter] = useState<string>("ALL");
	const [query, setQuery] = useState("");
	const [sortBy, setSortBy] = useState<SortOption>("class-asc");
	const [copied, setCopied] = useState(false);
	const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
	const [dragActive, setDragActive] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<RegisterStudentsResult | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);

	const schoolCode = profile?.code ?? "";
	const referralUrl =
		typeof window !== "undefined" && schoolCode
			? `${window.location.origin.replace("4002", "3000").replace("school-portal", "www")}/register?school=${schoolCode}`
			: `https://www.innovationolympiad.in/register?school=${schoolCode || "YOUR_CODE"}`;

	const copyReferralLink = () => {
		navigator.clipboard.writeText(referralUrl);
		setCopied(true);
		setTimeout(() => setCopied(false), 2500);
	};

	const shareWhatsApp = () => {
		const message = encodeURIComponent(
			`Dear Students & Parents,\n\nRegister for Bharat Innovation Olympiad under ${profile?.name || "our school"} using our official registration link:\n${referralUrl}\n\nExplore innovation, problem solving, and future skills!`,
		);
		window.open(`https://api.whatsapp.com/send?text=${message}`, "_blank");
	};

	const visible = useMemo(() => {
		const filtered = (students ?? []).filter((s) => {
			const matchesFilter =
				filter === "ALL" ||
				(filter === "INVITED" && s.status === "INVITED") ||
				(filter === "PARTICIPATING" && s.status !== "INVITED");
			const matchesClass = classFilter === "ALL" || String(s.classBand) === classFilter;
			const matchesQuery =
				!query ||
				s.name.toLowerCase().includes(query.toLowerCase()) ||
				s.email.toLowerCase().includes(query.toLowerCase());
			return matchesFilter && matchesClass && matchesQuery;
		});

		const statusWeight: Record<PortalStudent["status"], number> = {
			COMPLETED: 4,
			PAID: 3,
			REGISTERED: 2,
			INVITED: 1,
		};

		return [...filtered].sort((a, b) => {
			switch (sortBy) {
				case "class-asc":
					return (a.classBand ?? 0) - (b.classBand ?? 0);
				case "class-desc":
					return (b.classBand ?? 0) - (a.classBand ?? 0);
				case "status-completed":
					return (statusWeight[b.status] ?? 0) - (statusWeight[a.status] ?? 0);
				case "status-invited":
					return (statusWeight[a.status] ?? 0) - (statusWeight[b.status] ?? 0);
				case "score-desc":
					return (b.score ?? 0) - (a.score ?? 0);
				case "name-asc":
					return a.name.localeCompare(b.name);
				case "name-desc":
					return b.name.localeCompare(a.name);
				default:
					return 0;
			}
		});
	}, [students, filter, classFilter, query, sortBy]);

	function parseCsv(text: string) {
		const lines = text.trim().split(/\r?\n/).filter(Boolean);
		const rows: ParsedRow[] = [];
		for (const line of lines) {
			const cells = line.split(",").map((c) => c.trim());
			const first = (cells[0] ?? "").toLowerCase();
			if (first === "name" || first === "student name") continue; // header
			const name = cells[0] ?? "";
			const classBand = cells[1] ?? "";
			const email = cells[2] ?? "";
			const classNum = Number(classBand);
			const valid =
				name.length > 1 &&
				classNum >= 1 &&
				classNum <= 12 &&
				/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
			rows.push({
				id: `${name}-${email}-${classBand}-${rows.length}`,
				name,
				classBand,
				email,
				valid,
				error: valid ? undefined : "Check name, class (1–12) and email",
			});
		}
		setParsed(rows);
		setResult(null);
		setSubmitError(null);
	}

	function onFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;
		file.text().then(parseCsv);
	}

	function onDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		setDragActive(false);
		const file = event.dataTransfer.files?.[0];
		if (file) file.text().then(parseCsv);
	}

	async function importValid() {
		if (!parsed || !token) return;
		const payload: NewStudent[] = parsed
			.filter((r) => r.valid)
			.map((r) => ({ name: r.name, email: r.email, classBand: Number(r.classBand) }));
		if (!payload.length) return;

		setSubmitting(true);
		setSubmitError(null);
		try {
			const outcome = await portalApi.registerStudents(token, payload);
			setResult(outcome);
			setParsed(null);
			reload();
		} catch (cause) {
			setSubmitError(
				cause instanceof ApiError ? cause.message : "Could not register these students.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	const validCount = parsed?.filter((r) => r.valid).length ?? 0;
	const invalidCount = (parsed?.length ?? 0) - validCount;

	function exportCsv() {
		downloadCsv(
			"bio-students.csv",
			["Name", "Class", "Email", "Status", "Score"],
			visible.map((s) => [s.name, s.classBand, s.email, s.status, s.score ?? "—"]),
		);
	}

	return (
		<main>
			<div className="page-header">
				<h1>Students</h1>
				<p className="muted">
					Onboard students to your school via your official School Referral Link or CSV upload, and
					track exam progress.
				</p>
			</div>

			<SchoolStepGuide defaultOpen={false} />

			{/* ── Official School Referral Link Hub (PRD Onboarding & Referral) ── */}
			<div
				className="card"
				style={{
					background: "var(--gradient-card)",
					border: "1.5px solid var(--border-default)",
					marginBottom: "1.5rem",
				}}
			>
				<div
					className="row-between"
					style={{ alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}
				>
					<div>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: "0.5rem",
								marginBottom: "0.25rem",
							}}
						>
							<span style={{ fontSize: "1.3rem" }}>🔗</span>
							<h2 style={{ margin: 0, fontSize: "1.15rem" }}>School Student Referral Link</h2>
							{schoolCode && <span className="badge badge--positive">{schoolCode}</span>}
						</div>
						<p className="muted mb-0" style={{ fontSize: "0.88rem", maxWidth: 640 }}>
							Share this link with students and parents via WhatsApp, email, or school circulars.
							Students who sign up through this link are automatically enrolled into your school
							roster without requiring a CSV upload.
						</p>
					</div>
					<div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
						<button
							type="button"
							className="button button--secondary button--small"
							onClick={shareWhatsApp}
							style={{
								background: "#25D366",
								color: "#fff",
								borderColor: "#25D366",
								display: "inline-flex",
								alignItems: "center",
								gap: "6px",
							}}
						>
							<span>💬</span> Share on WhatsApp
						</button>
						<button
							type="button"
							className="button button--small"
							onClick={copyReferralLink}
							style={{ minWidth: 100 }}
						>
							{copied ? "✓ Copied!" : "📋 Copy Link"}
						</button>
					</div>
				</div>

				<div
					style={{
						marginTop: "1rem",
						padding: "0.6rem 0.85rem",
						borderRadius: "var(--radius-sm)",
						background: "var(--bg-primary)",
						border: "1px dashed var(--border-strong)",
						fontFamily: "monospace",
						fontSize: "0.85rem",
						color: "var(--text-primary)",
						wordBreak: "break-all",
					}}
				>
					{referralUrl}
				</div>
			</div>

			{result && (
				<div className="notice notice--success" style={{ marginBottom: "1rem" }}>
					Added {result.added} student{result.added === 1 ? "" : "s"}.
					{result.skipped.length > 0 && (
						<>
							{" "}
							{result.skipped.length} skipped —{" "}
							{result.skipped.map((s) => `${s.email} (${s.reason})`).join("; ")}.
						</>
					)}
				</div>
			)}
			{submitError && (
				<div className="notice notice--error" style={{ marginBottom: "1rem" }}>
					{submitError}
				</div>
			)}

			<div className="card">
				<div className="section-title">
					<div>
						<h2>Bulk CSV Invite</h2>
						<p className="muted mb-0" style={{ fontSize: "0.82rem" }}>
							Alternative method: upload an Excel/CSV student list directly.
						</p>
					</div>
					<a
						className="button button--secondary button--small"
						href={
							"data:text/csv;charset=utf-8," +
							encodeURIComponent("Name,Class,Email\nAarav Sharma,7,aarav@student.edu.in\n")
						}
						download="bio-student-template.csv"
					>
						Download template
					</a>
				</div>
				{/* biome-ignore lint/a11y: upload affordance; keyboard users use the button below */}
				<div
					className={dragActive ? "drop-zone drop-zone--active" : "drop-zone"}
					onClick={() => fileInput.current?.click()}
					onDragOver={(e) => {
						e.preventDefault();
						setDragActive(true);
					}}
					onDragLeave={() => setDragActive(false)}
					onDrop={onDrop}
				>
					<span className="drop-zone__icon">📄</span>
					Drop a CSV here, or click to choose a file. Columns: <strong>Name, Class, Email</strong>.
					<input
						ref={fileInput}
						type="file"
						accept=".csv,text/csv"
						onChange={onFile}
						style={{ display: "none" }}
					/>
				</div>

				{parsed ? (
					<div className="mt-4">
						<div className="inline" style={{ marginBottom: "0.75rem" }}>
							<span className="badge badge--positive">{validCount} valid</span>
							{invalidCount > 0 ? (
								<span className="badge badge--negative">{invalidCount} need fixing</span>
							) : null}
						</div>
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Name</th>
										<th>Class</th>
										<th>Email</th>
										<th>Result</th>
									</tr>
								</thead>
								<tbody>
									{parsed.map((r) => (
										<tr key={r.id}>
											<td>{r.name}</td>
											<td>{r.classBand}</td>
											<td className="text-mono" style={{ fontSize: "0.8rem" }}>
												{r.email}
											</td>
											<td>
												{r.valid ? (
													<span className="badge badge--positive">OK</span>
												) : (
													<span className="badge badge--negative" title={r.error}>
														Fix
													</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<div className="inline mt-4">
							<button
								type="button"
								className="button"
								onClick={importValid}
								disabled={validCount === 0 || submitting}
							>
								{submitting
									? "Inviting…"
									: `Invite ${validCount} student${validCount === 1 ? "" : "s"}`}
							</button>
							<button
								type="button"
								className="button button--secondary"
								onClick={() => setParsed(null)}
							>
								Cancel
							</button>
						</div>
					</div>
				) : null}
			</div>

			<div className="card">
				<div className="section-title" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
					<h2>School Roster ({visible.length})</h2>
					<div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
						<select
							value={classFilter}
							onChange={(e) => setClassFilter(e.target.value)}
							style={{
								padding: "0.35rem 0.6rem",
								fontSize: "0.85rem",
								borderRadius: "var(--radius-sm)",
							}}
						>
							<option value="ALL">All Classes/Grades</option>
							{[6, 7, 8, 9, 10, 11, 12].map((cls) => (
								<option key={cls} value={String(cls)}>
									Class {cls}
								</option>
							))}
						</select>

						<select
							value={sortBy}
							onChange={(e) => setSortBy(e.target.value as SortOption)}
							style={{
								padding: "0.35rem 0.6rem",
								fontSize: "0.85rem",
								borderRadius: "var(--radius-sm)",
							}}
						>
							<option value="class-asc">Sort: Grade (6 → 12)</option>
							<option value="class-desc">Sort: Grade (12 → 6)</option>
							<option value="status-completed">Sort: Exam Completed / Submitted</option>
							<option value="status-invited">Sort: Status (Invited First)</option>
							<option value="score-desc">Sort: Exam Score (High → Low)</option>
							<option value="name-asc">Sort: Name (A → Z)</option>
							<option value="name-desc">Sort: Name (Z → A)</option>
						</select>

						<input
							placeholder="Search name or email…"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							style={{ maxWidth: 200, fontSize: "0.85rem" }}
						/>
						<button
							type="button"
							className="button button--secondary button--small"
							onClick={exportCsv}
							disabled={visible.length === 0}
						>
							Download CSV
						</button>
					</div>
				</div>

				<div className="inline" style={{ marginBottom: "1rem" }}>
					{(["ALL", "INVITED", "PARTICIPATING"] as Filter[]).map((f) => (
						<button
							key={f}
							type="button"
							className={filter === f ? "pill pill--active" : "pill"}
							onClick={() => setFilter(f)}
						>
							{f === "ALL"
								? "All Statuses"
								: f === "INVITED"
									? "Invited Only"
									: "Participating (Paid/Completed)"}
						</button>
					))}
				</div>

				{error && <div className="notice notice--error">{error}</div>}

				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th
									onClick={() => setSortBy(sortBy === "name-asc" ? "name-desc" : "name-asc")}
									style={{ cursor: "pointer", userSelect: "none" }}
								>
									Name {sortBy === "name-asc" ? "↑" : sortBy === "name-desc" ? "↓" : ""}
								</th>
								<th
									onClick={() => setSortBy(sortBy === "class-asc" ? "class-desc" : "class-asc")}
									style={{ cursor: "pointer", userSelect: "none" }}
								>
									Class/Grade {sortBy === "class-asc" ? "↑" : sortBy === "class-desc" ? "↓" : ""}
								</th>
								<th>Email</th>
								<th
									onClick={() =>
										setSortBy(sortBy === "status-completed" ? "status-invited" : "status-completed")
									}
									style={{ cursor: "pointer", userSelect: "none" }}
								>
									Exam Status{" "}
									{sortBy === "status-completed" ? "↓" : sortBy === "status-invited" ? "↑" : ""}
								</th>
								<th
									onClick={() => setSortBy(sortBy === "score-desc" ? "class-asc" : "score-desc")}
									style={{ cursor: "pointer", userSelect: "none" }}
								>
									Score {sortBy === "score-desc" ? "↓" : ""}
								</th>
							</tr>
						</thead>
						<tbody>
							{visible.map((s) => (
								<tr key={s.id}>
									<td>
										<strong>{s.name}</strong>
									</td>
									<td>
										<span
											className="badge"
											style={{ background: "var(--bg-elevated)", fontWeight: 600 }}
										>
											Class {s.classBand}
										</span>
									</td>
									<td className="text-mono" style={{ fontSize: "0.8rem" }}>
										{s.email}
									</td>
									<td>
										<span className={STATUS_BADGE[s.status]}>{s.status}</span>
									</td>
									<td style={{ fontWeight: s.score !== null ? 700 : 400 }}>
										{s.score !== null ? `${s.score} marks` : "—"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{!loading && visible.length === 0 ? (
					<div className="empty-state">
						<span className="empty-state__icon">🧑‍🎓</span>
						{students && students.length === 0
							? "No students yet. Share your school referral link or invite your first batch above."
							: "No students match this filter."}
					</div>
				) : null}
			</div>
		</main>
	);
}
