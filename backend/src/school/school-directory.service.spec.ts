import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SchoolDirectoryService } from './school-directory.service';

function createFakeDb() {
    let seq = 0;
    const schools: any[] = [];

    const flatten = (where: any) =>
        Object.entries(where).reduce<Record<string, unknown>>((acc, [key, value]) => {
            if (value && typeof value === 'object') Object.assign(acc, value);
            else acc[key] = value;
            return acc;
        }, {});

    const matchesWhere = (school: any, where: any): boolean => {
        if (!where) return true;

        // onboardedAt: { not: null }
        if (where.onboardedAt?.not === null) {
            if (school.onboardedAt === null || school.onboardedAt === undefined) return false;
        }

        // pincode exact / startsWith
        if (where.pincode) {
            if (typeof where.pincode === 'string') {
                if (school.pincode !== where.pincode) return false;
            } else if (where.pincode.startsWith) {
                if (!school.pincode.startsWith(where.pincode.startsWith)) return false;
            }
        }

        // OR
        if (where.OR) {
            return where.OR.some((clause: any) => matchesWhere(school, clause));
        }

        // AND
        if (where.AND) {
            return where.AND.every((clause: any) => matchesWhere(school, clause));
        }

        // name / city contains
        if (where.name?.contains) {
            const needle = where.name.contains.toLowerCase();
            if (!school.name.toLowerCase().includes(needle)) return false;
        }
        if (where.city?.contains) {
            const needle = where.city.contains.toLowerCase();
            if (!school.city.toLowerCase().includes(needle)) return false;
        }

        return true;
    };

    const prisma: any = {
        school: {
            findUnique: async ({ where }: any) => {
                const flat = flatten(where);
                return schools.find((s) => Object.entries(flat).every(([k, v]) => s[k] === v)) ?? null;
            },
            findMany: async ({ where }: any) => {
                return schools.filter((s) => matchesWhere(s, where));
            },
            create: async ({ data }: any) => {
                const clash = schools.find(
                    (s) => s.nameKey === data.nameKey && s.pincode === data.pincode,
                );
                if (clash) {
                    throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
                        code: 'P2002',
                        clientVersion: 'test',
                        meta: { target: ['nameKey', 'pincode'] },
                    });
                }
                const row = { id: `school-${++seq}`, onboardedAt: null, ...data };
                schools.push(row);
                return row;
            },
        },
    };
    return { prisma, schools };
}

const pincodeService: any = {
    lookup: jest.fn(async (pincode: string) => ({ pincode, city: 'Nagpur', state: 'Maharashtra' })),
};

function setup() {
    const db = createFakeDb();
    pincodeService.lookup.mockClear();
    return { ...db, service: new SchoolDirectoryService(db.prisma, pincodeService) };
}

describe('addToDirectory', () => {
    it('adds a school, filling city and state from the pincode', async () => {
        const { service, schools } = setup();

        const entry = await service.addToDirectory({ name: 'Bright Future School', pincode: '441108' });

        expect(entry).toMatchObject({
            name: 'Bright Future School',
            city: 'Nagpur',
            state: 'Maharashtra',
            pincode: '441108',
            onboarded: false,
        });
        expect(entry.code).toMatch(/^SCH-[0-9A-HJKMNP-TV-Z]{6}$/);
        expect(schools).toHaveLength(1);
    });

    it('never creates a duplicate, however the name was typed', async () => {
        const { service, schools } = setup();
        const first = await service.addToDirectory({ name: "St. Xavier's High School", pincode: '441108' });

        for (const variant of ['ST XAVIERS HIGH SCHOOL', 'st xavier’s  high-school', "St. Xavier's High School"]) {
            const again = await service.addToDirectory({ name: variant, pincode: '441108' });
            expect(again.id).toBe(first.id);
        }
        expect(schools).toHaveLength(1);
    });

    it('treats the same name in a different pincode as a different school', async () => {
        const { service, schools } = setup();
        await service.addToDirectory({ name: 'DPS', pincode: '441108' });
        await service.addToDirectory({ name: 'DPS', pincode: '110001' });

        expect(schools).toHaveLength(2);
    });

    it('does not spend a pincode lookup on a school it already knows', async () => {
        const { service } = setup();
        await service.addToDirectory({ name: 'Bright Future School', pincode: '441108' });
        expect(pincodeService.lookup).toHaveBeenCalledTimes(1);

        await service.addToDirectory({ name: 'bright future school', pincode: '441108' });
        expect(pincodeService.lookup).toHaveBeenCalledTimes(1);
    });

    it('returns the existing row when two people add the same school at once', async () => {
        const { service, prisma, schools } = setup();
        // Slip a row in between the read and the write, so `create` hits P2002.
        const realCreate = prisma.school.create;
        prisma.school.create = async (args: any) => {
            schools.push({ id: 'raced', onboardedAt: null, ...args.data });
            prisma.school.create = realCreate;
            return realCreate(args);
        };

        const entry = await service.addToDirectory({ name: 'Race School', pincode: '441108' });

        expect(entry.id).toBe('raced');
        expect(schools).toHaveLength(1);
    });

    it('rethrows a unique violation that is not the duplicate-school one', async () => {
        const { service, prisma } = setup();
        prisma.school.create = async () => {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
                code: 'P2002',
                clientVersion: 'test',
                meta: { target: ['code'] },
            });
        };

        // A code collision is a real bug — swallowing it (or retrying forever)
        // would hide it.
        await expect(
            service.addToDirectory({ name: 'Anything', pincode: '441108' }),
        ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    });

    it('rejects a bad pincode and a name that normalises to nothing', async () => {
        const { service } = setup();
        await expect(service.addToDirectory({ name: 'OK', pincode: '44' })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(
            service.addToDirectory({ name: '!!!', pincode: '441108' }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('findByCode', () => {
    it('resolves a code however the student typed it', async () => {
        const { service, schools } = setup();
        const added = await service.addToDirectory({ name: 'Bright Future', pincode: '441108' });
        const code = schools[0].code;

        for (const typed of [code, code.toLowerCase(), code.replace('-', ''), ` ${code} `]) {
            await expect(service.findByCode(typed)).resolves.toMatchObject({ id: added.id });
        }
    });

    it('reports an unknown code as not found', async () => {
        const { service } = setup();
        await expect(service.findByCode('SCH-ZZZZZZ')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not resolve the old hard-coded codes', async () => {
        const { service } = setup();
        await expect(service.findByCode('SCH001')).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('search', () => {
    it('returns onboarded schools only, not student-added schools', async () => {
        const { service, schools } = setup();
        await service.addToDirectory({ name: 'Bright Future School', pincode: '441108' });
        // Mark the school as onboarded, like a staff approval would.
        schools[0].onboardedAt = new Date();

        const results = await service.search({ name: 'Bright' });

        expect(results).toHaveLength(1);
        expect(results[0].onboarded).toBe(true);
    });

    it('excludes student-added schools from the directory', async () => {
        const { service } = setup();
        await service.addToDirectory({ name: 'Bright Future School', pincode: '441108' });

        const results = await service.search({ name: 'Bright' });

        expect(results).toHaveLength(0);
    });

    it('matches on name and city, case-insensitively', async () => {
        const { service, schools } = setup();
        await service.addToDirectory({ name: 'Bright Future School', pincode: '441108' });
        schools[0].onboardedAt = new Date();

        for (const q of ['bright', 'BRIGHT FUTURE', 'nagpur']) {
            await expect(service.search({ name: q })).resolves.toHaveLength(1);
        }
    });

    it('matches on pincode', async () => {
        const { service, schools } = setup();
        await service.addToDirectory({ name: 'Bright Future School', pincode: '441108' });
        schools[0].onboardedAt = new Date();

        await expect(service.search({ pincode: '441108' })).resolves.toHaveLength(1);
        await expect(service.search({ pincode: '4411' })).resolves.toHaveLength(0); // not valid
    });

    it('combines name and pincode with AND', async () => {
        const { service, schools } = setup();
        await service.addToDirectory({ name: 'Bright Future School', pincode: '441108' });
        schools[0].onboardedAt = new Date();

        await expect(
            service.search({ name: 'Bright', pincode: '441108' }),
        ).resolves.toHaveLength(1);
        await expect(
            service.search({ name: 'Bright', pincode: '110001' }),
        ).resolves.toHaveLength(0);
    });

    it('returns an empty list when no search term is provided', async () => {
        const { service, schools } = setup();
        await service.addToDirectory({ name: 'Bright Future School', pincode: '441108' });
        schools[0].onboardedAt = new Date();

        await expect(service.search({})).resolves.toHaveLength(0);
    });

    it('ignores name searches under 3 characters', async () => {
        const { service, schools } = setup();
        await service.addToDirectory({ name: 'Bright Future School', pincode: '441108' });
        schools[0].onboardedAt = new Date();

        await expect(service.search({ name: 'Br' })).resolves.toHaveLength(0);
    });

    it('never exposes a coordinator', async () => {
        const { service, schools } = setup();
        await service.addToDirectory({ name: 'Bright Future School', pincode: '441108' });
        schools[0].onboardedAt = new Date();

        const [entry] = await service.search({ name: 'Bright' });
        expect(Object.keys(entry).sort()).toEqual(
            ['city', 'code', 'id', 'name', 'onboarded', 'pincode', 'state'].sort(),
        );
    });
});
