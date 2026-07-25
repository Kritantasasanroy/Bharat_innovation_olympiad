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

    const prisma: any = {
        school: {
            findUnique: async ({ where }: any) => {
                const flat = flatten(where);
                return schools.find((s) => Object.entries(flat).every(([k, v]) => s[k] === v)) ?? null;
            },
            findMany: async ({ where }: any) => {
                const q: string | undefined = where?.OR?.[0]?.name?.contains;
                if (!q) return [...schools];
                const needle = q.toLowerCase();
                return schools.filter(
                    (s) =>
                        s.name.toLowerCase().includes(needle) ||
                        s.pincode.startsWith(q) ||
                        s.city.toLowerCase().includes(needle),
                );
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
    it('matches on name, city and pincode, case-insensitively', async () => {
        const { service } = setup();
        await service.addToDirectory({ name: 'Bright Future School', pincode: '441108' });

        for (const q of ['bright', 'BRIGHT FUTURE', 'nagpur', '441108', '4411']) {
            await expect(service.search(q)).resolves.toHaveLength(1);
        }
    });

    it('never exposes a coordinator', async () => {
        const { service } = setup();
        await service.addToDirectory({ name: 'Bright Future School', pincode: '441108' });

        const [entry] = await service.search();
        expect(Object.keys(entry).sort()).toEqual(
            ['city', 'code', 'id', 'name', 'onboarded', 'pincode', 'state'].sort(),
        );
    });
});
