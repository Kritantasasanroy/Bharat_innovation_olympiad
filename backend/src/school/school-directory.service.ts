import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomCode } from '../common/access-token';
import { PincodeService } from '../geo/pincode.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddSchoolDto } from './dto/school.dto';
import { isValidPincode, normalizeSchoolCode, schoolNameKey } from './school-directory.helpers';

/** What a student sees when choosing their school. Never exposes the coordinator. */
export interface DirectoryEntry {
    id: string;
    code: string;
    name: string;
    city: string;
    state: string;
    pincode: string;
    /** True once staff approved a request for this school; it then has a portal. */
    onboarded: boolean;
}

const SEARCH_LIMIT = 25;

/** How long search results are kept in the in-process cache (ms). */
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
    results: DirectoryEntry[];
    expiresAt: number;
}

/** Tiny in-process LRU-free cache keyed by normalised query string. */
const searchCache = new Map<string, CacheEntry>();

const toEntry = (s: {
    id: string;
    code: string;
    name: string;
    city: string;
    state: string;
    pincode: string;
    onboardedAt: Date | null;
}): DirectoryEntry => ({
    id: s.id,
    code: s.code,
    name: s.name,
    city: s.city,
    state: s.state,
    pincode: s.pincode,
    onboarded: s.onboardedAt !== null,
});

/**
 * The school directory students pick from during registration.
 *
 * Before this existed, the student app shipped a hard-coded 25-school JSON file
 * whose codes (`SCH001`…) matched nothing in the database, so choosing a school
 * failed with "Invalid school code". The directory is now the `School` table:
 * every onboarded school appears the moment staff approve it, and a student
 * whose school is missing can add it themselves.
 */
@Injectable()
export class SchoolDirectoryService {
    constructor(
        private prisma: PrismaService,
        private pincode: PincodeService,
    ) {}

    /**
     * Search by name or pincode, case-insensitively. An empty query lists the
     * directory, onboarded schools first — those are the ones with a portal, and
     * the ones a student is most likely to want.
     */
    async search(query?: string): Promise<DirectoryEntry[]> {
        const q = (query ?? '').trim();

        // Fast path: serve from cache while the entry is fresh.
        const cached = searchCache.get(q);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.results;
        }

        const where: Prisma.SchoolWhereInput = q
            ? {
                  OR: [
                      { name: { contains: q, mode: 'insensitive' } },
                      { pincode: { startsWith: q } },
                      { city: { contains: q, mode: 'insensitive' } },
                  ],
              }
            : {};

        const schools = await this.prisma.school.findMany({
            where,
            orderBy: [{ onboardedAt: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
            take: SEARCH_LIMIT,
            select: {
                id: true,
                code: true,
                name: true,
                city: true,
                state: true,
                pincode: true,
                onboardedAt: true,
            },
        });
        const results = schools.map(toEntry);

        // Evict stale entries first to prevent the map growing unbounded.
        const now = Date.now();
        for (const [key, entry] of searchCache) {
            if (entry.expiresAt <= now) searchCache.delete(key);
        }
        searchCache.set(q, { results, expiresAt: now + CACHE_TTL_MS });

        return results;
    }

    /**
     * Resolve the code printed on a school's handover card. Forgiving about case,
     * spacing and a missing hyphen — a student is copying it out of a message.
     */
    async findByCode(rawCode: string): Promise<DirectoryEntry> {
        const code = normalizeSchoolCode(rawCode);
        const school = await this.prisma.school.findUnique({
            where: { code },
            select: {
                id: true,
                code: true,
                name: true,
                city: true,
                state: true,
                pincode: true,
                onboardedAt: true,
            },
        });
        if (!school) throw new NotFoundException('No school has that code.');
        return toEntry(school);
    }

    /** Invalidate cached results so a newly-added school appears immediately. */
    private invalidateCache() {
        searchCache.clear();
    }

    /**
     * A student's school is not listed, so they add it by name + pincode. City
     * and state come from the pincode, never from the student, so two people
     * adding the same school agree about where it is.
     *
     * Idempotent by `(nameKey, pincode)`: adding a school that already exists
     * returns the existing row rather than creating a second one. That holds even
     * under a race, because the same pair is a unique index.
     */
    async addToDirectory(dto: AddSchoolDto): Promise<DirectoryEntry> {
        const name = dto.name.trim();
        const nameKey = schoolNameKey(name);
        if (!nameKey) {
            throw new BadRequestException('Please enter the school name in English letters.');
        }
        if (!isValidPincode(dto.pincode)) {
            throw new BadRequestException('A pincode is six digits, e.g. 441108.');
        }
        const pincode = dto.pincode.trim();

        const existing = await this.prisma.school.findUnique({
            where: { nameKey_pincode: { nameKey, pincode } },
            select: {
                id: true,
                code: true,
                name: true,
                city: true,
                state: true,
                pincode: true,
                onboardedAt: true,
            },
        });
        if (existing) return toEntry(existing);

        const location = await this.pincode.lookup(pincode);

        try {
            const school = await this.prisma.school.create({
                data: {
                    name,
                    nameKey,
                    code: await this.allocateCode(),
                    city: location.city,
                    state: location.state,
                    pincode,
                    // No coordinator and no portal until staff approve a request.
                    onboardedAt: null,
                },
                select: {
                    id: true,
                    code: true,
                    name: true,
                    city: true,
                    state: true,
                    pincode: true,
                    onboardedAt: true,
                },
            });
            const entry = toEntry(school);
            this.invalidateCache();
            return entry;
        } catch (error) {
            // Someone added the same school between our read and our write. Only
            // the (nameKey, pincode) index means that — a clash on `code` is a
            // different bug and must not be swallowed, nor retried forever.
            const target = this.conflictTarget(error);
            if (target?.includes('nameKey')) {
                const raced = await this.prisma.school.findUnique({
                    where: { nameKey_pincode: { nameKey, pincode } },
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        city: true,
                        state: true,
                        pincode: true,
                        onboardedAt: true,
                    },
                });
                if (raced) return toEntry(raced);
            }
            throw error;
        }
    }

    /** The columns a P2002 unique violation names, or `null` for anything else. */
    private conflictTarget(error: unknown): string[] | null {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
            return null;
        }
        const target = error.meta?.target;
        if (Array.isArray(target)) return target as string[];
        return typeof target === 'string' ? [target] : null;
    }

    /** `SCH-XXXXXX` over the unambiguous alphabet; retried on the rare collision. */
    async allocateCode(): Promise<string> {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const code = `SCH-${randomCode(6)}`;
            const taken = await this.prisma.school.findUnique({ where: { code } });
            if (!taken) return code;
        }
        throw new BadRequestException('Could not allocate a unique school code. Try again.');
    }
}
