"use client";

import { portalApi } from "../../../lib/api-client";
import { useResource } from "../../../lib/use-resource";

export default function AnnouncementsPage() {
	const { data: announcements, loading, error } = useResource(portalApi.announcements);

	return (
		<main>
			<div className="page-header">
				<h1>Announcements</h1>
				<p className="muted">Updates from the BIO team for your school.</p>
			</div>

			{error && <div className="notice notice--error">{error}</div>}

			{loading && !announcements && <div className="card">Loading…</div>}

			{!loading && announcements && announcements.length === 0 && (
				<div className="card">
					<div className="empty-state">
						<span className="empty-state__icon">📢</span>
						No announcements right now.
					</div>
				</div>
			)}

			{(announcements ?? []).map((a) => (
				<div key={a.id} className="card" style={{ marginBottom: "1rem" }}>
					<div style={{ marginBottom: "0.5rem" }}>
						<h2 style={{ margin: 0 }}>{a.title}</h2>
						<span className="muted" style={{ fontSize: "0.8rem" }}>
							{new Date(a.publishedAt).toLocaleString("en-IN", {
								dateStyle: "medium",
								timeStyle: "short",
							})}
						</span>
					</div>
					<p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{a.body}</p>
				</div>
			))}
		</main>
	);
}
