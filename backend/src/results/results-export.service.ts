import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, Role } from '@prisma/client';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIENCE_FIELD, ResultAudience, SUBMITTED_STATUSES } from './results.service';

export interface ResultRow {
    studentName: string;
    email: string;
    classBand: number | null;
    schoolName: string;
    schoolCode: string;
    examTitle: string;
    status: AttemptStatus;
    rawScore: number | null;
    maxScore: number | null;
    normalizedScore: number | null;
    percentile: number | null;
    rank: number | null;
    startedAt: Date | null;
    submittedAt: Date | null;
}

/**
 * Builds the result sheets the three audiences download (items 16/17/18).
 *
 * One query shape serves all three; the only difference is the **scope** each
 * caller is allowed to ask for, and that scope is derived from the caller's own
 * identity — never from a parameter they send. A school gets its own students, a
 * partner gets the students of the schools assigned to it, and an admin gets
 * everyone.
 *
 * Every read goes through {@link assertReleased}, so an audience cannot download
 * a sheet for an instance it has not been released to — the Excel export is not
 * a side door around the release gate.
 */
@Injectable()
export class ResultsExportService {
    constructor(private prisma: PrismaService) {}

    /**
     * Refuses the read unless results for this instance have been released to
     * this audience. Admins are exempt — the release gate exists to control what
     * *others* see, and staff need the sheet in order to decide whether to
     * release it in the first place.
     */
    private async assertReleased(examInstanceId: string, audience: ResultAudience | 'ADMIN') {
        if (audience === 'ADMIN') return;

        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            select: { [AUDIENCE_FIELD[audience]]: true } as Record<string, true>,
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        if (!instance[AUDIENCE_FIELD[audience]]) {
            throw new ForbiddenException(
                'Results for this exam have not been released to you yet.',
            );
        }
    }

    /** The schools a partner is allowed to see. Empty means the partner has none. */
    async schoolIdsForPartner(partnerId: string): Promise<string[]> {
        const schools = await this.prisma.school.findMany({
            where: { partnerId },
            select: { id: true },
        });
        return schools.map((s) => s.id);
    }

    /**
     * The result rows for one exam instance, scoped to a set of schools.
     * `schoolIds === null` means no school filter at all (admin).
     */
    async rows(examInstanceId: string, schoolIds: string[] | null): Promise<ResultRow[]> {
        // An empty (not null) school list means "this caller owns no schools" — it
        // must return nothing, not everything. Guarding here rather than letting
        // `{ in: [] }` do it keeps the intent explicit.
        if (schoolIds !== null && schoolIds.length === 0) return [];

        const attempts = await this.prisma.attempt.findMany({
            where: {
                examInstanceId,
                status: { in: SUBMITTED_STATUSES },
                user: {
                    role: Role.STUDENT,
                    ...(schoolIds !== null ? { schoolId: { in: schoolIds } } : {}),
                },
            },
            include: {
                user: {
                    select: {
                        firstName: true,
                        lastName: true,
                        email: true,
                        classBand: true,
                        school: { select: { name: true, code: true } },
                    },
                },
                examInstance: { select: { exam: { select: { title: true } } } },
            },
            orderBy: [{ rank: 'asc' }, { totalScore: 'desc' }],
        });

        return attempts.map((a) => ({
            studentName: `${a.user.firstName} ${a.user.lastName}`.trim(),
            email: a.user.email,
            classBand: a.user.classBand,
            schoolName: a.user.school?.name ?? 'Independent',
            schoolCode: a.user.school?.code ?? '—',
            examTitle: a.examInstance.exam.title,
            status: a.status,
            rawScore: a.totalScore,
            maxScore: a.maxScore,
            normalizedScore: a.normalizedScore,
            percentile: a.percentile,
            rank: a.rank,
            startedAt: a.startedAt,
            submittedAt: a.submittedAt,
        }));
    }

    /** Admin: every student on the instance. */
    async adminRows(examInstanceId: string) {
        await this.assertReleased(examInstanceId, 'ADMIN');
        return this.rows(examInstanceId, null);
    }

    /** School coordinator: only their own students, only once released to schools. */
    async schoolRows(examInstanceId: string, schoolId: string) {
        await this.assertReleased(examInstanceId, 'SCHOOLS');
        return this.rows(examInstanceId, [schoolId]);
    }

    /** Partner: the students of every school assigned to them, once released to partners. */
    async partnerRows(examInstanceId: string, partnerId: string) {
        await this.assertReleased(examInstanceId, 'PARTNERS');
        return this.rows(examInstanceId, await this.schoolIdsForPartner(partnerId));
    }

    /**
     * Renders rows into a real `.xlsx` workbook (not a CSV with an Excel name) —
     * schools and partners open these in Excel and expect column widths, a frozen
     * header and typed number cells to sort correctly.
     */
    async workbook(title: string, rows: ResultRow[]): Promise<Buffer> {
        const wb = new Workbook();
        wb.creator = 'Bharat Innovation Olympiad';
        wb.created = new Date();

        const sheet = wb.addWorksheet('Results', {
            views: [{ state: 'frozen', ySplit: 1 }],
        });

        sheet.columns = [
            { header: 'Rank', key: 'rank', width: 8 },
            { header: 'Student', key: 'studentName', width: 28 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Class', key: 'classBand', width: 8 },
            { header: 'School', key: 'schoolName', width: 30 },
            { header: 'School code', key: 'schoolCode', width: 14 },
            { header: 'Exam', key: 'examTitle', width: 28 },
            { header: 'Score', key: 'rawScore', width: 10 },
            { header: 'Out of', key: 'maxScore', width: 10 },
            { header: 'Normalized', key: 'normalizedScore', width: 12 },
            { header: 'Percentile', key: 'percentile', width: 12 },
            { header: 'Started at', key: 'startedAt', width: 22 },
            { header: 'Submitted at', key: 'submittedAt', width: 22 },
            { header: 'Time taken', key: 'timeTaken', width: 14 },
        ];

        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF4E04D' },
        };

        for (const row of rows) {
            sheet.addRow({
                ...row,
                // Two decimals is the precision normalization actually carries;
                // writing the raw float would show 63.99999999999999 in Excel.
                normalizedScore: round2(row.normalizedScore),
                percentile: round2(row.percentile),
                startedAt: row.startedAt ? row.startedAt.toISOString() : '',
                submittedAt: row.submittedAt ? row.submittedAt.toISOString() : '',
                timeTaken: formatTimeTaken(row.startedAt, row.submittedAt),
            });
        }

        sheet.addRow([]);
        sheet.addRow([`${title} — ${rows.length} student(s), generated ${new Date().toISOString()}`]);

        // exceljs types this as its own Buffer-alike; the Node Buffer is what Nest
        // needs to stream back.
        return Buffer.from(await wb.xlsx.writeBuffer());
    }

    /** A filesystem-safe filename for the download. */
    static filename(examTitle: string, scope: string): string {
        const slug = examTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 48);
        const date = new Date().toISOString().slice(0, 10);
        return `bio-results-${slug || 'exam'}-${scope}-${date}.xlsx`;
    }
}

const round2 = (n: number | null): number | null =>
    n === null ? null : Math.round(n * 100) / 100;

/** `mm:ss` between start and submission, or '' if either timestamp is missing. */
function formatTimeTaken(startedAt: Date | null, submittedAt: Date | null): string {
    if (!startedAt || !submittedAt) return '';
    const totalSeconds = Math.max(0, Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
