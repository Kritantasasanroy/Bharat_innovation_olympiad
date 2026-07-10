import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterStudentsDto } from './dto/school.dto';

export type StudentStatus = 'INVITED' | 'REGISTERED' | 'PAID' | 'COMPLETED';

/**
 * An exam that ran to the end, however it ended. A student whose time expired is
 * auto-submitted and has just as much a completed attempt as one who pressed the
 * button — counting only `SUBMITTED` would quietly under-report every school.
 */
const FINISHED: AttemptStatus[] = [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED];
const isFinished = (status: AttemptStatus) => FINISHED.includes(status);

/**
 * Everything the school dashboard reads, plus the one thing it writes.
 *
 * A school coordinator **cannot modify platform data** — profile, slots, exam
 * windows and results are set by staff and by the exam itself, and every method
 * here except `registerStudents` is a read. Registering students is the single
 * write a school is trusted with, and even that only ever creates a `User` row
 * scoped to its own school.
 *
 * Every method takes the `schoolId` off the caller's JWT, so a coordinator can
 * never address another school's data.
 */
@Injectable()
export class SchoolPortalService {
    constructor(private prisma: PrismaService) {}

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
            /** Schools read; staff write. Surfaced so the UI need not guess. */
            readOnly: true,
        };
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

    /** Exam windows the school is slotted into. Read-only: staff allocate slots. */
    async slots(schoolId: string) {
        const assignments = await this.prisma.schoolSlotAssignment.findMany({
            where: { schoolId },
            include: {
                slot: true,
                examInstance: { include: { exam: { select: { title: true } } } },
            },
        });

        return assignments.map((a) => ({
            assignmentId: a.id,
            examTitle: a.examInstance.exam.title,
            slotId: a.slotId,
            label: a.slot.label,
            startsAt: a.slot.startsAt,
            endsAt: a.slot.endsAt,
            capacity: a.slot.capacity,
            booked: a.slot.booked,
            status: a.slot.booked >= a.slot.capacity ? ('FULL' as const) : ('OPEN' as const),
        }));
    }

    /** Released results only — a school must not see scores before students do. */
    async results(schoolId: string) {
        const attempts = await this.prisma.attempt.findMany({
            where: {
                user: { schoolId, role: Role.STUDENT },
                status: { in: FINISHED },
                examInstance: { resultsReleasedAt: { not: null } },
            },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, classBand: true } },
                examInstance: { include: { exam: { select: { title: true, totalMarks: true } } } },
            },
            orderBy: { normalizedScore: 'desc' },
        });

        return attempts.map((a) => ({
            studentId: a.user.id,
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
