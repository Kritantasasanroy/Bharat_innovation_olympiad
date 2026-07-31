import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
    formatRollNumber,
    resolveSeasonYear,
    sequenceKeyFor,
} from './roll-number';

/** Where a roll number is drawn from — a plain Prisma client or a transaction. */
type Db = Pick<PrismaService, '$queryRaw' | 'user'>;

/**
 * Allocates olympiad roll numbers.
 *
 * ## Why a raw upsert-and-return rather than read-then-write
 *
 * The obvious implementation — read `Sequence.next`, add one, write it back — is
 * a lost-update race: two registrations landing in the same millisecond both read
 * `5`, both write `6`, and both students are handed `…-00005`. The unique index on
 * `User.rollNumber` would then fail one of their registrations outright.
 *
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING` performs the read, the increment
 * and the claim as one atomic statement: Postgres takes a row lock on conflict,
 * so the second caller blocks until the first commits and then reads the updated
 * value. No transaction wrapper or retry loop is needed, and it works identically
 * on a pooled Neon connection.
 */
@Injectable()
export class RollNumberService {
    private readonly logger = new Logger(RollNumberService.name);

    constructor(private prisma: PrismaService) {}

    /**
     * Claims the next roll number for a grade.
     *
     * @param grade  The student's class band.
     * @param db     Optional transaction client, so a caller already inside a
     *               `$transaction` allocates within it rather than opening a
     *               second connection.
     */
    async allocate(grade: number, db: Db = this.prisma): Promise<string> {
        const seasonYear = resolveSeasonYear();
        const key = sequenceKeyFor(seasonYear, grade);
        const sequence = await this.claimNext(key, db);
        return formatRollNumber(seasonYear, grade, sequence);
    }

    /**
     * Allocates only if the student does not already have one.
     *
     * Registration can legitimately be retried — a student who closes the tab at
     * the OTP step and starts again hits `/auth/sync` twice — and the second run
     * must not burn a second number or overwrite the first.
     */
    async ensureFor(userId: string, grade: number | null | undefined): Promise<string | null> {
        // A roll number embeds the grade, so there is nothing to issue without
        // one. Staff and school accounts have no classBand and need no roll number.
        if (grade === null || grade === undefined) return null;

        const existing = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { rollNumber: true },
        });
        if (existing?.rollNumber) return existing.rollNumber;

        const rollNumber = await this.allocate(grade);
        try {
            await this.prisma.user.update({ where: { id: userId }, data: { rollNumber } });
            return rollNumber;
        } catch (error: any) {
            // P2002 = unique violation. Two concurrent calls for the *same* user
            // (double-submitted form): the other one won, so adopt its number
            // rather than failing the registration.
            if (error?.code === 'P2002') {
                const winner = await this.prisma.user.findUnique({
                    where: { id: userId },
                    select: { rollNumber: true },
                });
                if (winner?.rollNumber) return winner.rollNumber;
            }
            throw error;
        }
    }

    /** One atomic claim of the next value for `key`. */
    private async claimNext(key: string, db: Db): Promise<number> {
        const rows = await db.$queryRaw<{ next: number }[]>`
            INSERT INTO "Sequence" ("key", "next", "updatedAt")
            VALUES (${key}, 2, NOW())
            ON CONFLICT ("key") DO UPDATE
                SET "next" = "Sequence"."next" + 1, "updatedAt" = NOW()
            RETURNING "Sequence"."next" - 1 AS "next"
        `;

        const claimed = rows?.[0]?.next;
        if (typeof claimed !== 'number' || !Number.isFinite(claimed)) {
            throw new Error(`Sequence "${key}" returned no value`);
        }
        // Postgres returns bigint-ish values as numbers here, but be explicit —
        // a string would silently produce "BIO26-G8-0000undefined" downstream.
        return Number(claimed);
    }
}
