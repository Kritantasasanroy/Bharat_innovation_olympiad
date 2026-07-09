"use client";

import { type FormEvent, useState } from "react";
import { school as initialSchool, schoolUsers as initialUsers } from "../../../lib/school-data";
import type { SchoolRole, SchoolUser } from "../../../lib/types";

/** Institution Profile Setup (§2.4) + Role Assignment / RBAC (§2.3). */
export default function ProfilePage() {
	const [profile, setProfile] = useState(initialSchool);
	const [saved, setSaved] = useState(false);
	const [users, setUsers] = useState<SchoolUser[]>(initialUsers);
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<SchoolRole>("READ_ONLY");

	function saveProfile(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaved(true);
		setTimeout(() => setSaved(false), 2500);
	}

	function addUser(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!inviteEmail.trim()) return;
		setUsers((prev) => [
			...prev,
			{
				id: `u${prev.length + 1}`,
				name: inviteEmail.split("@")[0] ?? "New user",
				email: inviteEmail.trim(),
				role: inviteRole,
			},
		]);
		setInviteEmail("");
	}

	function removeUser(id: string) {
		setUsers((prev) => prev.filter((u) => u.id !== id));
	}

	return (
		<main>
			<div className="page-header">
				<h1>Profile &amp; roles</h1>
				<p className="muted">Maintain your institution profile and manage who can access this portal.</p>
			</div>

			<div className="card">
				<h2>Institution profile</h2>
				<form className="form-grid" onSubmit={saveProfile} style={{ maxWidth: "none" }}>
					<div className="grid-2" style={{ gap: "1rem" }}>
						<div>
							<label htmlFor="name">School name</label>
							<input
								id="name"
								value={profile.name}
								onChange={(e) => setProfile({ ...profile, name: e.target.value })}
							/>
						</div>
						<div>
							<label htmlFor="code">School code</label>
							<input
								id="code"
								value={profile.code}
								onChange={(e) => setProfile({ ...profile, code: e.target.value })}
							/>
						</div>
					</div>
					<div className="grid-3" style={{ gap: "1rem" }}>
						<div>
							<label htmlFor="board">Board</label>
							<select
								id="board"
								value={profile.board}
								onChange={(e) => setProfile({ ...profile, board: e.target.value })}
							>
								<option>CBSE</option>
								<option>ICSE</option>
								<option>State Board</option>
								<option>IB / Cambridge</option>
							</select>
						</div>
						<div>
							<label htmlFor="city">City</label>
							<input
								id="city"
								value={profile.city}
								onChange={(e) => setProfile({ ...profile, city: e.target.value })}
							/>
						</div>
						<div>
							<label htmlFor="state">State</label>
							<input
								id="state"
								value={profile.state}
								onChange={(e) => setProfile({ ...profile, state: e.target.value })}
							/>
						</div>
					</div>
					<div className="grid-3" style={{ gap: "1rem" }}>
						<div>
							<label htmlFor="cn">Contact name</label>
							<input
								id="cn"
								value={profile.contactName}
								onChange={(e) => setProfile({ ...profile, contactName: e.target.value })}
							/>
						</div>
						<div>
							<label htmlFor="ce">Contact email</label>
							<input
								id="ce"
								value={profile.contactEmail}
								onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })}
							/>
						</div>
						<div>
							<label htmlFor="cp">Contact phone</label>
							<input
								id="cp"
								value={profile.contactPhone}
								onChange={(e) => setProfile({ ...profile, contactPhone: e.target.value })}
							/>
						</div>
					</div>
					<div className="inline">
						<button type="submit" className="button">
							Save profile
						</button>
						{saved ? <span className="badge badge--positive">Saved</span> : null}
					</div>
				</form>
			</div>

			<div className="card">
				<div className="section-title">
					<h2>Users &amp; roles</h2>
					<span className="muted" style={{ fontSize: "0.85rem" }}>
						Coordinators can edit; read-only users can view reports only.
					</span>
				</div>
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Name</th>
								<th>Email</th>
								<th>Role</th>
								<th className="text-right">Action</th>
							</tr>
						</thead>
						<tbody>
							{users.map((u) => (
								<tr key={u.id}>
									<td>{u.name}</td>
									<td className="text-mono" style={{ fontSize: "0.82rem" }}>{u.email}</td>
									<td>
										<span className={u.role === "COORDINATOR" ? "badge" : "badge badge--pending"}>
											{u.role === "COORDINATOR" ? "Coordinator" : "Read-only"}
										</span>
									</td>
									<td className="text-right">
										{u.role === "COORDINATOR" && users.filter((x) => x.role === "COORDINATOR").length === 1 ? (
											<span className="muted" style={{ fontSize: "0.8rem" }}>Primary</span>
										) : (
											<button
												type="button"
												className="button button--secondary button--small"
												onClick={() => removeUser(u.id)}
											>
												Remove
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="divider" />
				<form className="inline" onSubmit={addUser} style={{ alignItems: "flex-end" }}>
					<div style={{ flex: 1, minWidth: 220 }}>
						<label htmlFor="invite">Invite a user</label>
						<input
							id="invite"
							type="email"
							placeholder="colleague@school.edu.in"
							value={inviteEmail}
							onChange={(e) => setInviteEmail(e.target.value)}
						/>
					</div>
					<div>
						<label htmlFor="role">Role</label>
						<select id="role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as SchoolRole)}>
							<option value="READ_ONLY">Read-only</option>
							<option value="COORDINATOR">Coordinator</option>
						</select>
					</div>
					<button type="submit" className="button">
						Send invite
					</button>
				</form>
			</div>
		</main>
	);
}
