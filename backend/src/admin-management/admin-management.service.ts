import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/admin-management.dto';

interface Actor {
    id: string;
    email?: string;
}

/**
 * The admin's power over people and institutions: view and edit any user, and
 * **permanently delete** a student, school, or partner.
 *
 * A delete is a real Neon delete of the operational rows — but never a silent
 * one. Each delete first copies the entity's identifying details and a full JSON
 * snapshot into {@link ArchivedEntity} (a table nothing else references, which
 * only grows) and writes an `AuditLog` row, so a deletion is always accountable
 * and the contact still recoverable on paper. Deletes run inside a transaction
 * so the archive and the removal succeed or fail together.
 */
@Injectable()
export class AdminManagementService {
    constructor(private prisma: PrismaService) {}

    // ── Read / edit ─────────────────────────────────────────────────────────

    /** List users with optional role/school filters and a name/email search. */
    async listUsers(params: { role?: Role; q?: string; schoolId?: string }) {
        const where: Prisma.UserWhereInput = {};
        if (params.role) where.role = params.role;
        if (params.schoolId) where.schoolId = params.schoolId;
        if (params.q?.trim()) {
            const q = params.q.trim();
            where.OR = [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
            ];
        }

        const users = await this.prisma.user.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 500,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                classBand: true,
                schoolId: true,
                isActive: true,
                invitedAt: true,
                activatedAt: true,
                createdAt: true,
                school: { select: { name: true, code: true } },
                _count: { select: { attempts: true, payments: true, bookings: true } },
            },
        });

        return users.map((u) => ({
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            role: u.role,
            classBand: u.classBand,
            schoolId: u.schoolId,
            schoolName: u.school?.name ?? null,
            schoolCode: u.school?.code ?? null,
            isActive: u.isActive,
            invitedAt: u.invitedAt,
            activatedAt: u.activatedAt,
            createdAt: u.createdAt,
            attempts: u._count.attempts,
            payments: u._count.payments,
            bookings: u._count.bookings,
        }));
    }

    /** Edit a user. Email uniqueness and a valid target school are enforced. */
    async updateUser(id: string, dto: UpdateUserDto, actor: Actor) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) throw new NotFoundException('User not found.');

        const data: Prisma.UserUpdateInput = {};
        if (dto.firstName !== undefined) data.firstName = dto.firstName;
        if (dto.lastName !== undefined) data.lastName = dto.lastName;
        if (dto.classBand !== undefined) data.classBand = dto.classBand;
        if (dto.isActive !== undefined) data.isActive = dto.isActive;

        if (dto.email !== undefined) {
            const email = dto.email.trim().toLowerCase();
            if (email !== user.email) {
                const clash = await this.prisma.user.findUnique({ where: { email } });
                if (clash) throw new ConflictException('That email is already in use.');
                data.email = email;
            }
        }

        if (dto.schoolId !== undefined) {
            if (dto.schoolId === null || dto.schoolId === '') {
                data.school = { disconnect: true };
            } else {
                const school = await this.prisma.school.findUnique({ where: { id: dto.schoolId } });
                if (!school) throw new BadRequestException('Target school not found.');
                data.school = { connect: { id: dto.schoolId } };
            }
        }

        const updated = await this.prisma.user.update({ where: { id }, data });

        await this.prisma.auditLog.create({
            data: {
                userId: actor.id,
                action: 'admin.user.updated',
                resource: 'user',
                details: { userId: id, changed: Object.keys(dto) },
            },
        });

        return { id: updated.id, email: updated.email };
    }

    // ── Permanent delete (archive first, then hard-delete) ────────────────────

    /**
     * Deleting a user cascades their attempts, bookings, payments, certificates
     * etc. — but Prisma's cascade does **not** decrement `ExamSlot.booked` (that
     * counter is only maintained by app code). So we note which slots the user
     * held active bookings in, delete the user, then recompute those slots'
     * `booked` from the surviving bookings. All in one transaction.
     */
    async deleteUser(id: string, actor: Actor, reason?: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: {
                bookings: { select: { slotId: true, status: true } },
                _count: { select: { attempts: true, payments: true } },
            },
        });
        if (!user) throw new NotFoundException('User not found.');

        const affectedSlotIds = [
            ...new Set(
                user.bookings
                    .filter(
                        (b) =>
                            b.status === BookingStatus.PENDING ||
                            b.status === BookingStatus.CONFIRMED,
                    )
                    .map((b) => b.slotId),
            ),
        ];

        await this.prisma.$transaction(async (tx) => {
            await this.archive(tx, {
                entityType: 'STUDENT',
                originalId: user.id,
                name: `${user.firstName} ${user.lastName}`.trim(),
                email: user.email,
                phone: null,
                snapshot: user as unknown as Prisma.InputJsonValue,
                reason,
                actor,
            });

            await tx.user.delete({ where: { id } });
            await this.recomputeSlotCounters(tx, affectedSlotIds);

            await tx.auditLog.create({
                data: {
                    userId: actor.id,
                    action: 'admin.user.deleted',
                    resource: 'user',
                    details: { userId: id, email: user.email, role: user.role, reason: reason ?? null },
                },
            });
        });

        return { deleted: true, id, recomputedSlots: affectedSlotIds.length };
    }

    /**
     * Deleting a school **detaches** its students (they remain as independent
     * accounts, keeping their attempts/results/bookings). The coordinator user
     * and the school's slot assignments are removed with it, and the linked
     * access request is detached. Everything removed is captured in the archive.
     */
    async deleteSchool(id: string, actor: Actor, reason?: string) {
        const school = await this.prisma.school.findUnique({
            where: { id },
            include: {
                accessRequest: true,
                slotAssignments: { select: { id: true } },
                _count: { select: { users: true } },
            },
        });
        if (!school) throw new NotFoundException('School not found.');

        const coordinatorUserId = school.accessRequest?.coordinatorUserId ?? null;
        const coordinator = coordinatorUserId
            ? await this.prisma.user.findUnique({ where: { id: coordinatorUserId } })
            : null;

        const studentCount = coordinator ? school._count.users - 1 : school._count.users;

        await this.prisma.$transaction(async (tx) => {
            await this.archive(tx, {
                entityType: 'SCHOOL',
                originalId: school.id,
                name: school.name,
                email: school.accessRequest?.coordinatorEmail ?? null,
                phone: school.accessRequest?.coordinatorPhone ?? null,
                snapshot: { school, coordinator } as unknown as Prisma.InputJsonValue,
                reason,
                actor,
            });

            // Students survive as independent accounts.
            await tx.user.updateMany({
                where: { schoolId: id, role: Role.STUDENT },
                data: { schoolId: null },
            });

            // Assignments reference the slot with Restrict, so remove them before
            // anything touches slots; they have no incoming FKs themselves.
            await tx.schoolSlotAssignment.deleteMany({ where: { schoolId: id } });

            // Detach the access request (schoolId is SetNull, but be explicit so
            // the request row doesn't dangle a pointer to a deleted school).
            if (school.accessRequest) {
                await tx.schoolRequest.update({
                    where: { id: school.accessRequest.id },
                    data: { schoolId: null },
                });
            }

            // The coordinator account exists only to run this school.
            if (coordinatorUserId) {
                await tx.user.delete({ where: { id: coordinatorUserId } });
            }

            await tx.school.delete({ where: { id } });

            await tx.auditLog.create({
                data: {
                    userId: actor.id,
                    action: 'admin.school.deleted',
                    resource: 'school',
                    details: {
                        schoolId: id,
                        name: school.name,
                        studentsDetached: studentCount,
                        coordinatorDeleted: Boolean(coordinatorUserId),
                        reason: reason ?? null,
                    },
                },
            });
        });

        return { deleted: true, id, studentsDetached: studentCount };
    }

    /**
     * Deletes a school by its access-request row (what the admin Access queue
     * lists), removing the provisioned `School` too when one exists — detaching
     * its students, removing its coordinator and slot assignments, exactly like
     * {@link deleteSchool}. A request that was never approved has no school, so
     * only the request row goes.
     */
    async deleteSchoolRequest(requestId: string, actor: Actor, reason?: string) {
        const request = await this.prisma.schoolRequest.findUnique({ where: { id: requestId } });
        if (!request) throw new NotFoundException('School request not found.');

        const school = request.schoolId
            ? await this.prisma.school.findUnique({ where: { id: request.schoolId } })
            : null;
        const coordinator = request.coordinatorUserId
            ? await this.prisma.user.findUnique({ where: { id: request.coordinatorUserId } })
            : null;

        let studentsDetached = 0;
        await this.prisma.$transaction(async (tx) => {
            await this.archive(tx, {
                entityType: 'SCHOOL',
                originalId: request.schoolId ?? request.id,
                name: request.schoolName,
                email: request.coordinatorEmail,
                phone: request.coordinatorPhone,
                snapshot: { request, school, coordinator } as unknown as Prisma.InputJsonValue,
                reason,
                actor,
            });

            if (school) {
                const detached = await tx.user.updateMany({
                    where: { schoolId: school.id, role: Role.STUDENT },
                    data: { schoolId: null },
                });
                studentsDetached = detached.count;
                await tx.schoolSlotAssignment.deleteMany({ where: { schoolId: school.id } });
            }
            if (coordinator) {
                await tx.user.delete({ where: { id: coordinator.id } });
            }
            // Delete the request first (its schoolId FK would block nothing, but
            // this keeps no row pointing at a school we're about to remove).
            await tx.schoolRequest.delete({ where: { id: requestId } });
            if (school) {
                await tx.school.delete({ where: { id: school.id } });
            }

            await tx.auditLog.create({
                data: {
                    userId: actor.id,
                    action: 'admin.school-request.deleted',
                    resource: 'school-request',
                    details: {
                        schoolRequestId: requestId,
                        schoolId: request.schoolId,
                        name: request.schoolName,
                        studentsDetached,
                        reason: reason ?? null,
                    },
                },
            });
        });

        return { deleted: true, id: requestId, studentsDetached };
    }

    /**
     * Deleting a partner removes the backend `PartnerRequest` (its credential +
     * review record). The admin-api engine rows (`Partner`, `Campaign`,
     * `AttributionRecord`) are referenced only by string id, not a Prisma FK, so
     * they are left in place and noted — a follow-up engine cleanup is optional.
     */
    async deletePartner(id: string, actor: Actor, reason?: string) {
        const request = await this.prisma.partnerRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Partner request not found.');

        await this.prisma.$transaction(async (tx) => {
            await this.archive(tx, {
                entityType: 'PARTNER',
                originalId: request.id,
                name: request.orgName,
                email: request.email,
                phone: request.phone,
                snapshot: request as unknown as Prisma.InputJsonValue,
                reason,
                actor,
            });

            await tx.partnerRequest.delete({ where: { id } });

            await tx.auditLog.create({
                data: {
                    userId: actor.id,
                    action: 'admin.partner.deleted',
                    resource: 'partner-request',
                    details: {
                        partnerRequestId: id,
                        orgName: request.orgName,
                        enginePartnerId: request.partnerId,
                        reason: reason ?? null,
                    },
                },
            });
        });

        return { deleted: true, id, enginePartnerId: request.partnerId };
    }

    async listArchive(params: { type?: 'STUDENT' | 'SCHOOL' | 'PARTNER'; q?: string }) {
        const where: Prisma.ArchivedEntityWhereInput = {};
        if (params.type) where.entityType = params.type;
        if (params.q?.trim()) {
            const q = params.q.trim();
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
            ];
        }

        return this.prisma.archivedEntity.findMany({
            where,
            orderBy: { deletedAt: 'desc' },
            take: 500,
            select: {
                id: true,
                entityType: true,
                originalId: true,
                name: true,
                email: true,
                phone: true,
                reason: true,
                deletedBy: true,
                deletedByEmail: true,
                deletedAt: true,
            },
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private archive(
        tx: Prisma.TransactionClient,
        input: {
            entityType: 'STUDENT' | 'SCHOOL' | 'PARTNER';
            originalId: string;
            name: string;
            email: string | null;
            phone: string | null;
            snapshot: Prisma.InputJsonValue;
            reason?: string;
            actor: Actor;
        },
    ) {
        return tx.archivedEntity.create({
            data: {
                entityType: input.entityType,
                originalId: input.originalId,
                name: input.name,
                email: input.email,
                phone: input.phone,
                snapshot: input.snapshot,
                reason: input.reason ?? null,
                deletedBy: input.actor.id,
                deletedByEmail: input.actor.email ?? null,
            },
        });
    }

    /** Set each slot's `booked` to its true count of active bookings. */
    private async recomputeSlotCounters(tx: Prisma.TransactionClient, slotIds: string[]) {
        for (const slotId of slotIds) {
            const booked = await tx.booking.count({
                where: {
                    slotId,
                    status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                },
            });
            await tx.examSlot.update({ where: { id: slotId }, data: { booked } });
        }
    }
}
