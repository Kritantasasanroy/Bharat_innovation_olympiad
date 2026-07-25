import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, Role } from '@prisma/client';
import { PartnerDirectoryService } from '../partner/partner-directory.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResultsExportService } from '../results/results-export.service';
import { SchoolSlotService } from '../slot/school-slot.service';
import { RegisterStudentsDto, UpdateSchoolProfileDto } from './dto/school.dto';

export type StudentStatus = 'INVITED' | 'REGISTERED' | 'PAID' | 'COMPLETED';

/**
 * An exam that ran to the end, however it ended. A student whose time expired is
 * auto-submitted and has just as much a completed attempt as one who pressed the
 * button — counting only `SUBMITTED` would quietly under-report every school.
 */
const FINISHED: AttemptStatus[] = [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED];
const isFinished = (status: AttemptStatus) => FINISHED.includes(status);

/**
 * Everything the school dashboard reads, and the handful of things it writes.
 *
 * A school coordinator is trusted with exactly three writes — its own contact
 * details, its student roster, and picking one of the exam slots offered to it.
 * Everything else (exam windows, capacities, scores) is set by staff or by the
 * exam itself and is read-only here.
 *
 * Every method takes the `schoolId` off the caller's JWT, so a coordinator can
 * never address another school's data.
 */
@Injectable()
export class SchoolPortalService {
    constructor(
        private prisma: PrismaService,
        private partners: PartnerDirectoryService,
        private schoolSlots: SchoolSlotService,
        private exportService: ResultsExportService,
    ) {}

    /** The profile, built from what the school filled in when requesting access. */
    async profile(schoolId: string) {
        const school = await this.prisma.school.findUnique({
            where: { id: schoolId },
            include: { accessRequest: true },
        });
        if (!school) throw new NotFoundException('School not found.');

        const request = school.accessRequest;
        return {
            id: school.id,
            name: school.name,
            code: school.code,
            board: school.board,
            udiseCode: school.udiseCode,
            city: school.city,
            state: school.state,
            pincode: school.pincode,
            onboardedAt: school.onboardedAt,
            status: school.onboardedAt ? ('ACTIVE' as const) : ('PENDING' as const),
            coordinator: request
                ? {
                      name: request.coordinatorName,
                      email: request.coordinatorEmail,
                      phone: request.coordinatorPhone,
                  }
                : null,
            /** Which fields the coordinator may change (item 14). */
            editable: ['board', 'udiseCode', 'coordinatorName', 'coordinatorPhone'],
        };
    }

    /**
     * A school edits its own contact details (item 14).
     *
     * The school's **name, pincode and code are not editable**: `(nameKey, pincode)`
     * is the directory's uniqueness key and the code is what students type at
     * registration. Letting a coordinator rewrite either would either collide with
     * another school or silently break every student already pointing at this one.
     * Staff can change those from the admin console, where the collision is visible.
     *
     * The coordinator's **email is not editable** either — it is the identity the
     * access token was issued against.
     */
    async updateProfile(schoolId: string, dto: UpdateSchoolProfileDto) {
        const school = await this.prisma.school.findUnique({
            where: { id: schoolId },
            include: { accessRequest: { select: { id: true } } },
        });
        if (!school) throw new NotFoundException('School not found.');

        const schoolData = {
            ...(dto.board !== undefined ? { board: dto.board.trim() || null } : {}),
            ...(dto.udiseCode !== undefined ? { udiseCode: dto.udiseCode.trim() || null } : {}),
            ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
            ...(dto.state !== undefined ? { state: dto.state.trim() } : {}),
        };

        const requestData = {
            ...(dto.coordinatorName !== undefined
                ? { coordinatorName: dto.coordinatorName.trim() }
                : {}),
            ...(dto.coordinatorPhone !== undefined
                ? { coordinatorPhone: dto.coordinatorPhone.trim() }
                : {}),
        };

        await this.prisma.$transaction([
            ...(Object.keys(schoolData).length
                ? [this.prisma.school.update({ where: { id: schoolId }, data: schoolData })]
                : []),
            ...(Object.keys(requestData).length && school.accessRequest
                ? [
                      this.prisma.schoolRequest.update({
                          where: { id: school.accessRequest.id },
                          data: requestData,
                      }),
                  ]
                : []),
        ]);

        return this.profile(schoolId);
    }

    /**
     * The school's partner (item 10). Always resolves to something: a school with
     * no partner of its own reports to the house partner, so the portal never has
     * to render an empty card.
     */
    async partner(schoolId: string) {
        return this.partners.forSchool(schoolId);
    }

    /**
     * A student's furthest milestone. `invitedAt` without `activatedAt` is the
     * roster entry a coordinator created that nobody has claimed yet.
     */
    private statusOf(student: {
        activatedAt: Date | null;
        payments: { id: string }[];
        attempts: { status: AttemptStatus }[];
    }): StudentStatus {
        if (student.attempts.some((a) => isFinished(a.status))) return 'COMPLETED';
        if (student.payments.length > 0) return 'PAID';
        if (student.activatedAt) return 'REGISTERED';
        return 'INVITED';
    }

    async students(schoolId: string) {
        const rows = await this.prisma.user.findMany({
            where: { schoolId, role: Role.STUDENT },
            orderBy: [{ classBand: 'asc' }, { firstName: 'asc' }],
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                classBand: true,
                invitedAt: true,
                activatedAt: true,
                createdAt: true,
                payments: { where: { status: 'PAID' }, select: { id: true } },
                attempts: { select: { status: true, totalScore: true } },
            },
        });

        return rows.map((s) => ({
            id: s.id,
            name: `${s.firstName} ${s.lastName}`.trim(),
            email: s.email,
            classBand: s.classBand,
            status: this.statusOf(s),
            score: s.attempts.find((a) => isFinished(a.status))?.totalScore ?? null,
            invitedAt: s.invitedAt,
            activatedAt: s.activatedAt,
        }));
    }

    /** Headline counts for the overview, derived from the same rows as the roster. */
    async overview(schoolId: string) {
        const students = await this.students(schoolId);
        const count = (status: StudentStatus) => students.filter((s) => s.status === status).length;

        return {
            invited: students.length,
            // Every later milestone implies the earlier ones.
            registered: students.length - count('INVITED'),
            paid: count('PAID') + count('COMPLETED'),
            completed: count('COMPLETED'),
        };
    }

    /**
     * Every published exam this school's students are eligible for, with **all**
     * its slots — how full each one is, and which one (if any) this school holds
     * (item 15).
     *
     * The school portal previously showed only the slot staff had already assigned,
     * so a coordinator with no assignment saw an empty page and had no way to ask
     * for one. Now they see the whole board and can pick from it.
     */
    async slots(schoolId: string) {
        const now = new Date();

        const instances = await this.prisma.examInstance.findMany({
            where: {
                exam: { isPublished: true },
                endsAt: { gte: now },
            },
            orderBy: { startsAt: 'asc' },
            include: {
                exam: { select: { id: true, title: true, classBands: true, durationMinutes: true } },
                slots: { orderBy: { startsAt: 'asc' } },
            },
        });

        const assignments = await this.prisma.schoolSlotAssignment.findMany({
            where: { schoolId },
        });
        const assignedSlotByInstance = new Map(
            assignments.map((a) => [a.examInstanceId, a.slotId]),
        );

        // How many of this school's students each exam actually applies to — the
        // number the coordinator needs in order to pick a slot big enough.
        const students = await this.prisma.user.findMany({
            where: { schoolId, role: Role.STUDENT },
            select: { classBand: true },
        });

        return instances.map((instance) => {
            const eligible = students.filter(
                (s) => s.classBand !== null && instance.exam.classBands.includes(s.classBand),
            ).length;
            const assignedSlotId = assignedSlotByInstance.get(instance.id) ?? null;

            return {
                examInstanceId: instance.id,
                examId: instance.exam.id,
                examTitle: instance.exam.title,
                classBands: instance.exam.classBands,
                durationMinutes: instance.exam.durationMinutes,
                startsAt: instance.startsAt,
                endsAt: instance.endsAt,
                eligibleStudents: eligible,
                assignedSlotId,
                slots: instance.slots.map((slot) => {
                    const remaining = slot.capacity - slot.booked;
                    return {
                        slotId: slot.id,
                        label: slot.label,
                        startsAt: slot.startsAt,
                        endsAt: slot.endsAt,
                        capacity: slot.capacity,
                        booked: slot.booked,
                        remaining,
                        /** Percentage full, so the UI can draw a fill bar. */
                        fillPct:
                            slot.capacity > 0
                                ? Math.round((slot.booked / slot.capacity) * 100)
                                : 100,
                        isAssignedToUs: slot.id === assignedSlotId,
                        hasEnded: slot.endsAt < now,
                        /** A school can only pick a slot that is open and fits its cohort. */
                        selectable:
                            slot.endsAt >= now && remaining > 0 && slot.id !== assignedSlotId,
                        /** Whether the whole eligible cohort fits — a warning, not a block. */
                        fitsAllStudents: remaining >= eligible,
                    };
                }),
            };
        });
    }

    /**
     * The coordinator picks a slot for one exam (item 15).
     *
     * This is a real write, so it is bounded: the slot must belong to the exam
     * instance named, and the school may only set **its own** assignment. Once set,
     * `SchoolSlotService` books the school's eligible students into it and pins
     * future registrations there — the same path staff use, so a school-picked slot
     * and a staff-assigned one behave identically.
     *
     * Capacity is enforced by the same atomic guard as everywhere else, so two
     * schools racing for the last places in a slot cannot oversell it.
     */
    async pickSlot(schoolId: string, examInstanceId: string, slotId: string) {
        const slot = await this.prisma.examSlot.findUnique({
            where: { id: slotId },
            select: { id: true, examInstanceId: true, capacity: true, booked: true, endsAt: true },
        });
        if (!slot) throw new NotFoundException('Slot not found.');
        if (slot.examInstanceId !== examInstanceId) {
            throw new BadRequestException('That slot does not belong to this exam.');
        }
        if (slot.endsAt < new Date()) {
            throw new BadRequestException('That slot has already ended.');
        }
        if (slot.booked >= slot.capacity) {
            throw new BadRequestException('That slot is full. Pick another.');
        }

        const existing = await this.prisma.schoolSlotAssignment.findUnique({
            where: { schoolId_examInstanceId: { schoolId, examInstanceId } },
        });

        // Changing an existing pick must move the students who are already booked,
        // or the school ends up split across two slots.
        if (existing && existing.slotId !== slotId) {
            await this.schoolSlots.reassignSchool(schoolId, examInstanceId, slotId, schoolId);
            return { changed: true, ...(await this.slotSummary(schoolId, examInstanceId)) };
        }

        const result = await this.schoolSlots.setSchoolSlotAssignment(
            schoolId,
            examInstanceId,
            slotId,
            schoolId,
        );
        return { changed: false, summary: result.summary };
    }

    private async slotSummary(schoolId: string, examInstanceId: string) {
        const booked = await this.prisma.booking.count({
            where: {
                status: { in: ['PENDING', 'CONFIRMED'] },
                slot: { examInstanceId },
                user: { schoolId },
            },
        });
        return { booked };
    }

    /**
     * Released results only, and only once released **to schools** (item 18).
     *
     * The audience gate matters: an admin may want to hand a school its results a
     * day early to sanity-check them, or hold them back from schools entirely while
     * students see them. Reading `resultsReleasedAt` (any release) would have
     * collapsed that distinction.
     */
    async results(schoolId: string) {
        const attempts = await this.prisma.attempt.findMany({
            where: {
                user: { schoolId, role: Role.STUDENT },
                status: { in: FINISHED },
                examInstance: { resultsReleasedToSchoolsAt: { not: null } },
            },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, classBand: true } },
                examInstance: { include: { exam: { select: { title: true, totalMarks: true } } } },
            },
            orderBy: { normalizedScore: 'desc' },
        });

        return attempts.map((a) => ({
            studentId: a.user.id,
            examInstanceId: a.examInstanceId,
            name: `${a.user.firstName} ${a.user.lastName}`.trim(),
            classBand: a.user.classBand,
            examTitle: a.examInstance.exam.title,
            totalMarks: a.examInstance.exam.totalMarks,
            score: a.totalScore,
            normalizedScore: a.normalizedScore,
            percentile: a.percentile,
            rank: a.rank,
        }));
    }

    /** Exam instances whose results this school may see, for the download picker. */
    async releasedInstances(schoolId: string) {
        const instances = await this.prisma.examInstance.findMany({
            where: {
                resultsReleasedToSchoolsAt: { not: null },
                attempts: { some: { user: { schoolId } } },
            },
            orderBy: { startsAt: 'desc' },
            include: { exam: { select: { title: true, totalMarks: true } } },
        });

        return Promise.all(
            instances.map(async (instance) => ({
                examInstanceId: instance.id,
                examTitle: instance.exam.title,
                totalMarks: instance.exam.totalMarks,
                startsAt: instance.startsAt,
                endsAt: instance.endsAt,
                releasedAt: instance.resultsReleasedToSchoolsAt,
                students: await this.prisma.attempt.count({
                    where: {
                        examInstanceId: instance.id,
                        status: { in: FINISHED },
                        user: { schoolId },
                    },
                }),
            })),
        );
    }

    /** The school's own results for one instance, as a downloadable Excel workbook. */
    async resultsWorkbook(schoolId: string, examInstanceId: string) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            include: { exam: { select: { title: true } } },
        });
        if (!instance) throw new NotFoundException('Exam instance not found.');

        // `schoolRows` enforces the SCHOOLS release gate.
        const rows = await this.exportService.schoolRows(examInstanceId, schoolId);
        const buffer = await this.exportService.workbook(instance.exam.title, rows);

        return {
            buffer,
            filename: ResultsExportService.filename(instance.exam.title, 'school'),
        };
    }

    /** Exam-day snapshot: who is sitting the exam right now. */
    async monitoring(schoolId: string) {
        const attempts = await this.prisma.attempt.findMany({
            where: { user: { schoolId, role: Role.STUDENT } },
            select: {
                id: true,
                status: true,
                startedAt: true,
                user: { select: { firstName: true, lastName: true, classBand: true } },
            },
        });

        const byStatus = (status: AttemptStatus) => attempts.filter((a) => a.status === status);
        return {
            inProgress: byStatus(AttemptStatus.IN_PROGRESS).length,
            submitted: attempts.filter((a) => isFinished(a.status)).length,
            notStarted: byStatus(AttemptStatus.NOT_STARTED).length,
            live: byStatus(AttemptStatus.IN_PROGRESS).map((a) => ({
                attemptId: a.id,
                name: `${a.user.firstName} ${a.user.lastName}`.trim(),
                classBand: a.user.classBand,
                startedAt: a.startedAt,
            })),
        };
    }

    /**
     * THE ONLY WRITE. A coordinator adds students to their roster; each becomes a
     * `User` marked `invitedAt`, with no account until the student registers with
     * that email and claims it.
     *
     * An email already on the platform is reported, not overwritten — a school
     * must never be able to seize a student's existing account, nor move a
     * student who belongs to another school.
     */
    async registerStudents(schoolId: string, dto: RegisterStudentsDto) {
        if (!dto.students?.length) {
            throw new BadRequestException('Add at least one student.');
        }

        const added: { email: string; name: string }[] = [];
        const skipped: { email: string; reason: string }[] = [];
        const seen = new Set<string>();

        for (const entry of dto.students) {
            const email = entry.email.trim().toLowerCase();

            if (seen.has(email)) {
                skipped.push({ email, reason: 'Duplicated in this upload.' });
                continue;
            }
            seen.add(email);

            const existing = await this.prisma.user.findUnique({
                where: { email },
                select: { id: true, schoolId: true },
            });
            if (existing) {
                skipped.push({
                    email,
                    reason:
                        existing.schoolId === schoolId
                            ? 'Already on your roster.'
                            : 'Already registered on the platform.',
                });
                continue;
            }

            const [firstName, ...rest] = entry.name.trim().split(/\s+/);
            await this.prisma.user.create({
                data: {
                    email,
                    firstName: firstName || entry.name.trim(),
                    lastName: rest.join(' '),
                    role: Role.STUDENT,
                    classBand: entry.classBand,
                    schoolId,
                    invitedAt: new Date(),
                    isActive: true,
                },
            });
            added.push({ email, name: entry.name.trim() });
        }

        return { added: added.length, skipped, addedStudents: added };
    }
}
