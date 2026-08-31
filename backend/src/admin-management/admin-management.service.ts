import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { schoolNameKey } from '../school/school-directory.helpers';
import {
    UpdatePartnerDto,
    UpdateSchoolDto,
    UpdateUserDto,
} from './dto/admin-management.dto';

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
                school: { select: { name: true, code: true, partnerId: true } },
                _count: { select: { attempts: true, payments: true, bookings: true } },
            },
        });

        const userIds = users.map((u) => u.id);
        const [attributions, partners] = await Promise.all([
            this.prisma.attributionRecord.findMany({
                where: { studentId: { in: userIds } },
                select: { studentId: true, partnerId: true },
            }),
            this.prisma.partnerRequest.findMany({
                where: { partnerId: { not: null } },
                select: { partnerId: true, orgName: true },
            }),
        ]);

        const partnerNameById = new Map<string, string>();
        for (const p of partners) {
            if (p.partnerId) partnerNameById.set(p.partnerId, p.orgName);
        }

        const attributionByStudentId = new Map<string, string>();
        for (const a of attributions) {
            attributionByStudentId.set(a.studentId, a.partnerId);
        }

        return users.map((u) => {
            const directPartnerId = attributionByStudentId.get(u.id);
            const schoolPartnerId = u.school?.partnerId ?? null;
            const effectivePartnerId = directPartnerId ?? schoolPartnerId;
            const partnerName = effectivePartnerId ? (partnerNameById.get(effectivePartnerId) ?? null) : null;

            let onboardedBy: 'PARTNER' | 'SCHOOL' | 'SELF' = 'SELF';
            if (directPartnerId) {
                onboardedBy = 'PARTNER';
            } else if (u.schoolId || u.school) {
                onboardedBy = 'SCHOOL';
            }

            return {
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
                onboardedBy,
                partnerName,
            };
        });
    }

    /** Edit a user. Email uniqueness and a valid target school are enforced. */
    async updateUser(id: string, dto: UpdateUserDto, actor: Actor) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) throw new NotFoundException('User not found.');

        const data: Prisma.UserUpdateInput = {};
        if (dto.firstName !== undefined) data.firstName = dto.firstName;
        if (dto.lastName !== undefined) data.lastName = dto.lastName;
        if (dto.phone !== undefined) data.phone = dto.phone.trim() || null;
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

    /**
     * Moves several students to a school (or detaches them) in one call — the
     * "student shuffling" of item 20.
     *
     * Doing it one PATCH at a time is not equivalent: a partial failure halfway
     * through a class list leaves the roster split across two schools with no
     * record of intent. This runs as one transaction and one audit entry.
     *
     * Moving a student does **not** move their bookings. Their old school's slot
     * assignment no longer applies to them, and the new school's may differ — so
     * their slot is re-derived by auto-allocation rather than silently carried
     * over into a slot the new school does not hold.
     */
    async moveStudents(
        userIds: string[],
        schoolId: string | null,
        actor: Actor,
    ): Promise<{ moved: number; schoolId: string | null }> {
        if (!userIds.length) throw new BadRequestException('Pick at least one student.');

        if (schoolId) {
            const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
            if (!school) throw new BadRequestException('Target school not found.');
        }

        const students = await this.prisma.user.findMany({
            where: { id: { in: userIds }, role: Role.STUDENT },
            select: { id: true },
        });
        if (students.length !== userIds.length) {
            throw new BadRequestException(
                'Some of those ids are not students, or do not exist. Nothing was moved.',
            );
        }

        await this.prisma.$transaction([
            this.prisma.user.updateMany({
                where: { id: { in: userIds } },
                data: { schoolId },
            }),
            this.prisma.auditLog.create({
                data: {
                    userId: actor.id,
                    action: 'admin.students.moved',
                    resource: 'user',
                    details: { userIds, schoolId, count: userIds.length },
                },
            }),
        ]);

        return { moved: userIds.length, schoolId };
    }

    // ── Schools ──────────────────────────────────────────────────────────────

    /** Every school, with its partner and roster size. Powers the admin schools page. */
    async listSchools(params: { q?: string; partnerId?: string } = {}) {
        const where: Prisma.SchoolWhereInput = {};
        if (params.partnerId) where.partnerId = params.partnerId;
        if (params.q?.trim()) {
            const q = params.q.trim();
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { code: { contains: q, mode: 'insensitive' } },
                { city: { contains: q, mode: 'insensitive' } },
                { pincode: { contains: q } },
            ];
        }

        const schools = await this.prisma.school.findMany({
            where,
            orderBy: { name: 'asc' },
            take: 500,
            include: {
                _count: { select: { users: true } },
                accessRequest: {
                    select: {
                        coordinatorName: true,
                        coordinatorEmail: true,
                        coordinatorPhone: true,
                        status: true,
                    },
                },
            },
        });

        // One lookup for the partner names, rather than N.
        const partnerIds = [...new Set(schools.map((s) => s.partnerId).filter(Boolean))] as string[];
        const partners = await this.prisma.partnerRequest.findMany({
            where: { partnerId: { in: partnerIds } },
            select: { partnerId: true, orgName: true },
        });
        const partnerName = new Map(partners.map((p) => [p.partnerId, p.orgName]));

        return schools.map((s) => ({
            id: s.id,
            name: s.name,
            code: s.code,
            city: s.city,
            state: s.state,
            pincode: s.pincode,
            board: s.board,
            udiseCode: s.udiseCode,
            partnerId: s.partnerId,
            partnerName: s.partnerId ? (partnerName.get(s.partnerId) ?? null) : null,
            onboardedAt: s.onboardedAt,
            status: s.onboardedAt ? 'ACTIVE' : 'STUDENT_ADDED',
            members: s._count.users,
            coordinator: s.accessRequest,
        }));
    }

    /**
     * Schools that students have added themselves, but which have not yet been
     * onboarded by staff or a partner. Shown in the admin "Student-onboarded schools"
     * section with the students who selected them.
     */
    async listStudentSchools(params: { q?: string } = {}) {
        const where: Prisma.SchoolWhereInput = { onboardedAt: null };
        if (params.q?.trim()) {
            const q = params.q.trim();
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { code: { contains: q, mode: 'insensitive' } },
                { city: { contains: q, mode: 'insensitive' } },
                { pincode: { contains: q } },
            ];
        }

        const schools = await this.prisma.school.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 500,
            include: {
                users: {
                    where: { role: Role.STUDENT },
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phoneRaw: true,
                        phone: true,
                        classBand: true,
                        section: true,
                        createdAt: true,
                    },
                },
                _count: { select: { users: { where: { role: Role.STUDENT } } } },
            },
        });

        return schools.map((s) => ({
            id: s.id,
            name: s.name,
            code: s.code,
            city: s.city,
            state: s.state,
            pincode: s.pincode,
            members: s._count.users,
            createdAt: s.createdAt,
            students: s.users.map((u) => ({
                id: u.id,
                firstName: u.firstName,
                lastName: u.lastName,
                email: u.email,
                phone: u.phoneRaw || u.phone || null,
                classBand: u.classBand,
                section: u.section,
                createdAt: u.createdAt,
            })),
        }));
    }

    /**
     * Edit a school, including **reassigning it to a different partner** (item 20).
     *
     * Renaming or re-pincoding a school rewrites `nameKey`, which is half of the
     * `(nameKey, pincode)` uniqueness key — so a rename can collide with a school
     * that already exists. We check first and refuse, rather than letting the
     * database throw a P2002 that the UI would have to decode.
     */
    async updateSchool(id: string, dto: UpdateSchoolDto, actor: Actor) {
        const school = await this.prisma.school.findUnique({ where: { id } });
        if (!school) throw new NotFoundException('School not found.');

        const data: Prisma.SchoolUpdateInput = {};
        if (dto.city !== undefined) data.city = dto.city;
        if (dto.state !== undefined) data.state = dto.state;
        if (dto.board !== undefined) data.board = dto.board || null;
        if (dto.udiseCode !== undefined) data.udiseCode = dto.udiseCode || null;

        // `null` deliberately means "no partner" — the school then falls back to
        // the house partner at read time.
        if (dto.partnerId !== undefined) {
            data.partnerId = dto.partnerId?.trim() || null;
        }

        const nextName = dto.name ?? school.name;
        const nextPincode = dto.pincode ?? school.pincode;

        if (dto.name !== undefined || dto.pincode !== undefined) {
            const nameKey = schoolNameKey(nextName);
            const clash = await this.prisma.school.findUnique({
                where: { nameKey_pincode: { nameKey, pincode: nextPincode } },
            });
            if (clash && clash.id !== id) {
                throw new ConflictException(
                    `Another school ("${clash.name}"${clash.code ? `, ${clash.code}` : ''}) already exists at pincode ${nextPincode}. Merge them instead of renaming.`,
                );
            }
            data.name = nextName;
            data.nameKey = nameKey;
            data.pincode = nextPincode;
        }

        const updated = await this.prisma.school.update({ where: { id }, data });

        await this.prisma.auditLog.create({
            data: {
                userId: actor.id,
                action: 'admin.school.updated',
                resource: 'school',
                details: { schoolId: id, changed: Object.keys(dto) },
            },
        });

        return { id: updated.id, name: updated.name, code: updated.code };
    }

    // ── Partners ─────────────────────────────────────────────────────────────

    /** Every partner, for the admin console and the school→partner assignment picker. */
    async listPartners() {
        const requests = await this.prisma.partnerRequest.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                partnerId: true,
                orgName: true,
                contactPerson: true,
                email: true,
                phone: true,
                status: true,
                createdAt: true,
                decidedAt: true,
            },
        });

        const partnerIds = requests.map((r) => r.partnerId).filter(Boolean) as string[];
        const counts = await this.prisma.school.groupBy({
            by: ['partnerId'],
            where: { partnerId: { in: partnerIds } },
            _count: { _all: true },
        });
        const schoolCount = new Map(counts.map((c) => [c.partnerId, c._count._all]));

        return requests.map((r) => ({
            ...r,
            schools: r.partnerId ? (schoolCount.get(r.partnerId) ?? 0) : 0,
        }));
    }

    /**
     * Edit a partner's details (item 20). Staff *can* change the email here — it is
     * the partner's login identity, and only staff should be able to move it.
     * The password and access token are untouched; use the existing rotate-token
     * route to reissue the credential.
     */
    async updatePartner(id: string, dto: UpdatePartnerDto, actor: Actor) {
        const request = await this.prisma.partnerRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Partner not found.');

        const data: Prisma.PartnerRequestUpdateInput = {};
        if (dto.orgName !== undefined) data.orgName = dto.orgName.trim();
        if (dto.contactPerson !== undefined) data.contactPerson = dto.contactPerson.trim();
        if (dto.phone !== undefined) data.phone = dto.phone.trim();

        if (dto.email !== undefined) {
            const email = dto.email.trim().toLowerCase();
            if (email !== request.email) {
                const clash = await this.prisma.partnerRequest.findUnique({ where: { email } });
                if (clash) throw new ConflictException('That email is already used by a partner.');
                data.email = email;
            }
        }

        const updated = await this.prisma.partnerRequest.update({ where: { id }, data });

        await this.prisma.auditLog.create({
            data: {
                userId: actor.id,
                action: 'admin.partner.updated',
                resource: 'partner-request',
                details: { partnerRequestId: id, changed: Object.keys(dto) },
            },
        });

        return { id: updated.id, orgName: updated.orgName, email: updated.email };
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
