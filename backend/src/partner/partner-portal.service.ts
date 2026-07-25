import { Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResultsExportService } from '../results/results-export.service';
import { PartnerDirectoryService } from './partner-directory.service';

const FINISHED: AttemptStatus[] = [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED];

/**
 * What a partner can see across the schools assigned to it (items 9 and 17).
 *
 * Every read is scoped by `schoolIdsForPartner(partnerId)`, and `partnerId` comes
 * off the caller's JWT — never off a query parameter. A partner therefore cannot
 * address another partner's schools by guessing an id, and the scope collapses to
 * an empty list (not to "everything") when a partner has no schools.
 *
 * Results are additionally gated on the **PARTNERS** release audience: a partner
 * sees scores only for exam instances an admin has explicitly released to
 * partners, which may be never.
 */
@Injectable()
export class PartnerPortalService {
    constructor(
        private prisma: PrismaService,
        private directory: PartnerDirectoryService,
        private exportService: ResultsExportService,
    ) {}

    /** The schools this partner is responsible for, with roster sizes. */
    async schools(partnerId: string) {
        const schools = await this.directory.schoolsForPartner(partnerId);

        return schools.map((s) => ({
            id: s.id,
            name: s.name,
            code: s.code,
            city: s.city,
            state: s.state,
            pincode: s.pincode,
            board: s.board,
            status: s.onboardedAt ? ('ACTIVE' as const) : ('PENDING' as const),
            onboardedAt: s.onboardedAt,
            /** Includes the coordinator; the students figure is on the students view. */
            memberCount: s._count.users,
        }));
    }

    /**
     * Every student across every school assigned to this partner (item 9).
     * Optionally narrowed to one school — but only one the partner already owns,
     * so the filter can never widen the scope.
     */
    async students(partnerId: string, schoolId?: string) {
        const allowed = await this.directory.schoolIdsForPartner(partnerId);
        if (allowed.length === 0) return [];

        const scope = schoolId
            ? allowed.filter((id) => id === schoolId)
            : allowed;
        if (scope.length === 0) {
            throw new NotFoundException('That school is not assigned to you.');
        }

        const rows = await this.prisma.user.findMany({
            where: { schoolId: { in: scope }, role: Role.STUDENT },
            orderBy: [{ schoolId: 'asc' }, { classBand: 'asc' }, { firstName: 'asc' }],
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                classBand: true,
                invitedAt: true,
                activatedAt: true,
                createdAt: true,
                school: { select: { id: true, name: true, code: true } },
                payments: { where: { status: 'PAID' }, select: { id: true } },
                attempts: { select: { status: true } },
            },
        });

        return rows.map((s) => ({
            id: s.id,
            name: `${s.firstName} ${s.lastName}`.trim(),
            email: s.email,
            phone: s.phone,
            classBand: s.classBand,
            schoolId: s.school?.id ?? null,
            schoolName: s.school?.name ?? 'Independent',
            schoolCode: s.school?.code ?? null,
            status: statusOf(s),
            invitedAt: s.invitedAt,
            activatedAt: s.activatedAt,
        }));
    }

    /** Headline counts across the partner's whole footprint. */
    async overview(partnerId: string) {
        const [schools, students] = await Promise.all([
            this.schools(partnerId),
            this.students(partnerId),
        ]);

        const count = (status: string) => students.filter((s) => s.status === status).length;

        return {
            schools: schools.length,
            activeSchools: schools.filter((s) => s.status === 'ACTIVE').length,
            students: students.length,
            invited: count('INVITED'),
            registered: students.length - count('INVITED'),
            paid: count('PAID') + count('COMPLETED'),
            completed: count('COMPLETED'),
        };
    }

    /**
     * Exam instances whose results have been released **to partners**, so the
     * portal can offer a download per exam rather than one undifferentiated dump.
     */
    async releasedInstances(partnerId: string) {
        const schoolIds = await this.directory.schoolIdsForPartner(partnerId);
        if (schoolIds.length === 0) return [];

        const instances = await this.prisma.examInstance.findMany({
            where: {
                resultsReleasedToPartnersAt: { not: null },
                attempts: { some: { user: { schoolId: { in: schoolIds } } } },
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
                releasedAt: instance.resultsReleasedToPartnersAt,
                students: await this.prisma.attempt.count({
                    where: {
                        examInstanceId: instance.id,
                        status: { in: FINISHED },
                        user: { schoolId: { in: schoolIds } },
                    },
                }),
            })),
        );
    }

    /** The student-level result rows for one released instance (item 17). */
    async results(partnerId: string, examInstanceId: string) {
        return this.exportService.partnerRows(examInstanceId, partnerId);
    }

    /** The same rows as a downloadable `.xlsx` (item 16). */
    async resultsWorkbook(partnerId: string, examInstanceId: string) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            include: { exam: { select: { title: true } } },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        // `partnerRows` enforces the PARTNERS release gate, so this cannot be used
        // to download a sheet the partner has not been released.
        const rows = await this.exportService.partnerRows(examInstanceId, partnerId);
        const buffer = await this.exportService.workbook(instance.exam.title, rows);

        return {
            buffer,
            filename: ResultsExportService.filename(instance.exam.title, 'partner'),
        };
    }
}

function statusOf(student: {
    activatedAt: Date | null;
    payments: { id: string }[];
    attempts: { status: AttemptStatus }[];
}): 'INVITED' | 'REGISTERED' | 'PAID' | 'COMPLETED' {
    if (student.attempts.some((a) => FINISHED.includes(a.status))) return 'COMPLETED';
    if (student.payments.length > 0) return 'PAID';
    if (student.activatedAt) return 'REGISTERED';
    return 'INVITED';
}
