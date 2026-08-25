import { Elysia, t } from "elysia";
import type { PartnerContainer } from "../../../container";
import { authPlugin, requireAuth } from "./auth.plugin";
import { assertOwnsPartner, assertStaffRole } from "./partner-auth.helpers";

/**
 * Partner-scoped routes (PRD-046): campaign generation, the funnel read
 * model, commission statements, and self-service institution assignment.
 *
 * Every route here is partner-scoped: staff (any recognised admin role) may
 * act on behalf of any partner; otherwise the caller's JWT `sub` must equal
 * `:id` (the partner owns the resource) — enforced by
 * `assertOwnsPartner` (deny-by-default, see `partner-authorization.port.ts`).
 * Institution assignment is staff-only self-service (no partner self-service).
 */
export const partnerRoutes = (container: PartnerContainer) =>
	new Elysia({ name: "partner-routes" })
		.use(authPlugin)
		.get("/partners/:id", async ({ params, auth }) => {
			const user = requireAuth(auth);
			assertOwnsPartner(user, params.id);
			const data = await container.partnerQueryService.get(params.id);
			return { success: true, data };
		})
		.get("/partners/:id/campaigns", async ({ params, auth }) => {
			const user = requireAuth(auth);
			assertOwnsPartner(user, params.id);
			const data = await container.campaignService.listByPartner(params.id);
			return { success: true, data };
		})
		.post(
			"/partners/:id/campaigns",
			async ({ params, body, auth }) => {
				const user = requireAuth(auth);
				assertOwnsPartner(user, params.id);
				const data = await container.campaignService.create({
					partnerId: params.id,
					name: body.name,
					caps: body.caps ?? null,
				});
				return { success: true, data };
			},
			{
				body: t.Object({
					name: t.String(),
					caps: t.Optional(t.Object({ maxConversions: t.Optional(t.Number()) })),
				}),
			},
		)
		.patch(
			"/partners/:id/campaigns/:campaignId",
			async ({ params, body, auth }) => {
				const user = requireAuth(auth);
				assertOwnsPartner(user, params.id);
				const data = await container.campaignService.update({
					partnerId: params.id,
					campaignId: params.campaignId,
					...(body.name !== undefined ? { name: body.name } : {}),
					...(body.caps !== undefined ? { caps: body.caps } : {}),
					...(body.deactivate !== undefined ? { deactivate: body.deactivate } : {}),
				});
				return { success: true, data };
			},
			{
				body: t.Object({
					name: t.Optional(t.String()),
					caps: t.Optional(t.Object({ maxConversions: t.Optional(t.Number()) })),
					deactivate: t.Optional(t.Boolean()),
				}),
			},
		)
		.patch(
			"/partners/:id/access",
			async ({ params, body, auth }) => {
				const user = requireAuth(auth);
				assertStaffRole(user);
				const data = await container.partnerApplicationService.setAccess({
					partnerId: params.id,
					status: body.status,
					reason: body.reason,
					decidedBy: user.userId,
				});
				return { success: true, data };
			},
			{
				body: t.Object({
					status: t.Union([t.Literal("APPROVED"), t.Literal("REJECTED"), t.Literal("REVOKED")]),
					reason: t.String(),
				}),
			},
		)
		.get("/partners/:id/funnel", async ({ params, auth }) => {
			const user = requireAuth(auth);
			assertOwnsPartner(user, params.id);
			const data = await container.attributionService.getFunnel(params.id);
			return { success: true, data };
		})
		.get("/partners/:id/payouts", async ({ params, auth }) => {
			const user = requireAuth(auth);
			assertOwnsPartner(user, params.id);
			const data = await container.payoutService.listForPartner(params.id);
			return { success: true, data };
		})
		.get("/partners/:id/bank-details", async ({ params, query, auth }) => {
			const user = requireAuth(auth);
			assertOwnsPartner(user, params.id);
			const data = await container.bankDetailsService.get(params.id);
			if (!data) return { success: true, data: null };

			// The owning partner reads their own submission back in full — it is
			// already theirs, no audit needed. A staff caller sees the masked view
			// by default and must explicitly reveal, which is audited (who, when).
			const isOwner = user.userId === params.id;
			if (isOwner || query["reveal"] === "true") {
				const revealed = await container.bankDetailsService.reveal(params.id);
				if (!isOwner && revealed) {
					const now = new Date();
					await container.audit.record({
						action: "bank-details.revealed",
						actor: { id: user.userId, type: "user" },
						resource: { type: "partner-bank-details", id: params.id },
						outcome: "success",
						occurredAt: now.toISOString(),
					});
				}
				return { success: true, data: revealed ? { ...data, ...revealed } : data };
			}
			return { success: true, data };
		})
		.put(
			"/partners/:id/bank-details",
			async ({ params, body, auth }) => {
				const user = requireAuth(auth);
				assertOwnsPartner(user, params.id);
				const data = await container.bankDetailsService.submit({
					partnerId: params.id,
					accountHolderName: body.accountHolderName,
					bankName: body.bankName,
					ifscCode: body.ifscCode,
					accountNumber: body.accountNumber,
					pan: body.pan,
				});
				return { success: true, data };
			},
			{
				body: t.Object({
					accountHolderName: t.String(),
					bankName: t.String(),
					ifscCode: t.String(),
					accountNumber: t.String(),
					pan: t.String(),
				}),
			},
		)
		.get("/partners/:id/institutions", async ({ params, auth }) => {
			const user = requireAuth(auth);
			assertOwnsPartner(user, params.id);
			const data = await container.institutionAssignmentService.list(params.id);
			return { success: true, data };
		})
		.post(
			"/partners/:id/institutions",
			async ({ params, body, auth }) => {
				const user = requireAuth(auth);
				assertStaffRole(user);
				const data = await container.institutionAssignmentService.assign({
					partnerId: params.id,
					institutionId: body.institutionId,
					assignedBy: user.userId,
				});
				return { success: true, data };
			},
			{ body: t.Object({ institutionId: t.String() }) },
		)
		.delete(
			"/partners/:id/institutions",
			async ({ params, body, auth }) => {
				const user = requireAuth(auth);
				assertStaffRole(user);
				const data = await container.institutionAssignmentService.unassign({
					partnerId: params.id,
					institutionId: body.institutionId,
					assignedBy: user.userId,
				});
				return { success: true, data };
			},
			{ body: t.Object({ institutionId: t.String() }) },
		);
