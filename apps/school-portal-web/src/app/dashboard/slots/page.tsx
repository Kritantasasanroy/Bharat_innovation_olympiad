"use client";

import { useState } from "react";
import { ApiError, type BoardSlot, portalApi, type SlotBoard } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { useResource } from "../../../lib/use-resource";

/**
 * Exam slots — now visible **and pickable** (item 15).
 *
 * This page used to show only the one slot staff had already assigned, so a
 * coordinator with no assignment saw an empty page and had no way to ask for
 * one. It now shows the whole board for every published exam: every slot, how
 * full it is, and which one this school holds. A coordinator can claim an open
 * slot themselves.
 *
 * Picking goes through the same auto-allocation the admin console uses, so a
 * school-picked slot behaves identically to a staff-assigned one: the school's
 * eligible students are booked into it together, future registrations follow, and
 * the atomic capacity guard means two schools racing for the last places cannot
 * oversell it.
 */

const dt = (iso: string) =>
	new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeStyle: "short" });

export default function SlotsPage() {
	const { token } = useAuth();
	const { data: boards, loading, error, reload } = useResource(portalApi.slots);

	const [busy, setBusy] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [pickError, setPickError] = useState<string | null>(null);

	async function pick(board: SlotBoard, slot: BoardSlot) {
		if (!token) return;

		const changing = board.assignedSlotId !== null;
		if (
			changing &&
			!confirm(
				`Move your school from its current slot to "${slot.label ?? "this slot"}"? Students already booked will be moved with it.`,
			)
		) {
			return;
		}

		setBusy(slot.slotId);
		setNotice(null);
		setPickError(null);

		try {
			const result = await portalApi.pickSlot(token, board.examInstanceId, slot.slotId);

			if (result.changed) {
				setNotice(`Moved to ${slot.label ?? "the new slot"}. Your students moved with it.`);
			} else {
				const summary = result.summary;
				const allocated = summary?.allocated ?? 0;
				// "0 allocated" is true for several very different reasons; the server
				// says which, so the coordinator is not left guessing.
				const notes = summary?.notes?.length ? ` ${summary.notes.join(" ")}` : "";
				setNotice(`Slot claimed. ${allocated} student(s) booked into it.${notes}`.trim());
			}
			reload();
		} catch (err) {
			setPickError(err instanceof ApiError ? err.message : "Could not claim that slot.");
		} finally {
			setBusy(null);
		}
	}

	return (
		<main>
			<div className="page-header">
				<h1>Slots &amp; windows</h1>
				<p className="muted">
					Every exam your students are eligible for, and the slots available for it. Pick a slot and
					your whole school sits together in it.
				</p>
			</div>

			{error && <div className="notice notice--error">{error}</div>}
			{pickError && <div className="notice notice--error">{pickError}</div>}
			{notice && <div className="notice notice--positive">{notice}</div>}

			{loading && !boards && <div className="card">Loading slots…</div>}

			{!loading && boards && boards.length === 0 && (
				<div className="card">
					<div className="empty-state">
						<span className="empty-state__icon">🗓️</span>
						No published exams right now. Once BIO publishes an exam for your classes, its slots
						will appear here for you to pick from.
					</div>
				</div>
			)}

			{(boards ?? []).map((board) => (
				<div key={board.examInstanceId} className="card">
					<div className="row-between">
						<div>
							<h2 style={{ marginBottom: "0.2rem" }}>{board.examTitle}</h2>
							<p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
								{dt(board.startsAt)} – {time(board.endsAt)} · {board.durationMinutes} min · classes{" "}
								{board.classBands.join(", ")}
							</p>
						</div>
						<span className="badge badge--neutral">
							{board.eligibleStudents} eligible student
							{board.eligibleStudents === 1 ? "" : "s"}
						</span>
					</div>

					{board.assignedSlotId === null && board.slots.length > 0 && (
						<div className="notice notice--warn" style={{ marginTop: "1rem" }}>
							Your school has no slot for this exam yet. Your students cannot sit it until you pick
							one.
						</div>
					)}

					{board.slots.length === 0 ? (
						<p className="muted">
							No slots have been set up for this exam yet. The BIO team adds them before the exam
							opens.
						</p>
					) : (
						<div className="grid-3" style={{ marginTop: "1rem" }}>
							{board.slots.map((slot) => (
								<SlotTile
									key={slot.slotId}
									slot={slot}
									board={board}
									busy={busy === slot.slotId}
									onPick={() => pick(board, slot)}
								/>
							))}
						</div>
					)}
				</div>
			))}
		</main>
	);
}

function SlotTile({
	slot,
	board,
	busy,
	onPick,
}: {
	slot: BoardSlot;
	board: SlotBoard;
	busy: boolean;
	onPick: () => void;
}) {
	const mine = slot.isAssignedToUs;
	const full = slot.remaining <= 0;

	return (
		<div
			className="stat-tile"
			style={{
				background: "var(--bg-card)",
				borderColor: mine ? "var(--accent-500)" : undefined,
				borderWidth: mine ? 2 : undefined,
			}}
		>
			<div className="row-between">
				<span className="stat-tile__label">{slot.label ?? "Slot"}</span>
				{mine && <span className="badge badge--positive">Your slot</span>}
				{!mine && slot.hasEnded && <span className="badge badge--neutral">Ended</span>}
				{!mine && !slot.hasEnded && full && <span className="badge badge--pending">Full</span>}
			</div>

			<p className="muted" style={{ fontSize: "0.85rem", margin: "0.35rem 0 0.6rem" }}>
				{dt(slot.startsAt)} – {time(slot.endsAt)}
			</p>

			<div className="row-between" style={{ marginBottom: "0.4rem" }}>
				<span style={{ fontSize: "1.3rem", fontWeight: 700 }}>
					{slot.booked}
					<span className="muted" style={{ fontSize: "0.9rem" }}>
						/{slot.capacity}
					</span>
				</span>
				<span className="muted" style={{ fontSize: "0.85rem" }}>
					{slot.remaining} seat{slot.remaining === 1 ? "" : "s"} left
				</span>
			</div>

			<div className="perf-bar">
				<div className="perf-bar__fill" style={{ width: `${slot.fillPct}%` }} />
			</div>

			{/* A slot that cannot hold the whole cohort is a warning, not a block —
			    the rest overflow into other slots, but the coordinator should know. */}
			{!mine && slot.selectable && !slot.fitsAllStudents && board.eligibleStudents > 0 && (
				<p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.5rem" }}>
					Only {slot.remaining} of your {board.eligibleStudents} students fit here. The rest will
					overflow into other slots.
				</p>
			)}

			{!mine && (
				<button
					type="button"
					className="button button--secondary"
					style={{ width: "100%", marginTop: "0.75rem" }}
					disabled={!slot.selectable || busy}
					onClick={onPick}
					title={
						slot.hasEnded ? "This slot has already ended." : full ? "This slot is full." : undefined
					}
				>
					{busy ? "Claiming…" : board.assignedSlotId ? "Move here" : "Pick this slot"}
				</button>
			)}
		</div>
	);
}
