"use client";

import { useCallback, useEffect, useState } from "react";
import { type Announcement, ApiError, partnerAnnouncementApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { usePoll } from "../../../lib/use-poll";

export default function AnnouncementsPage() {
	const { token } = useAuth();
	const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!token) return;
		try {
			const data = await partnerAnnouncementApi.list(token);
			setAnnouncements(data);
			setError(null);
		} catch (cause) {
			setError(cause instanceof ApiError ? cause.message : "Could not load announcements.");
		} finally {
			setLoading(false);
		}
	}, [token]);

	useEffect(() => {
		void load();
	}, [load]);

	usePoll(load);

	return (
		<main>
			<div className="page-header">
				<h1>Announcements</h1>
				<p className="muted">Updates from the Innovation Olympiad team for partners.</p>
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
