/**
 * The timings catalogue, against a fake database.
 *
 * The overlap guard that used to live in `create`/`update` is gone — two
 * overlapping same-tier sittings are now a legitimate configuration, not an
 * error — so what is pinned here is what replaced it and what was always
 * independent of it: same-tier overlap is accepted, cross-tier overlap always
 * was, and a zero-length sitting is still refused by the window parser.
 */
import { BadRequestException } from '@nestjs/common';
import { SlotTimingService } from './slot-timing.service';

interface FakeTimingRow {
    id: string;
    examInstanceId: string;
    label: string | null;
    startMinute: number;
    endMinute: number;
    capacity: number;
    weekdays: number[];
    priority: number;
    isActive: boolean;
    sortOrder: number;
}

function createFakePrisma(existing: FakeTimingRow[] = []) {
    const timings = [...existing];
    const client = {
        examInstance: {
            findUnique: async ({ where }: any) =>
                where.id === 'inst-1' ? { id: 'inst-1' } : null,
        },
        slotTiming: {
            findUnique: async ({ where }: any) =>
                timings.find((t) => t.id === where.id) ?? null,
            findMany: async () => timings,
            create: async ({ data }: any) => {
                const row: FakeTimingRow = { id: `t-${timings.length + 1}`, ...data };
                timings.push(row);
                return row;
            },
            update: async ({ where, data }: any) => {
                const row = timings.find((t) => t.id === where.id)!;
                Object.assign(row, data);
                return row;
            },
        },
        examSlot: {
            count: async () => 0,
            aggregate: async () => ({ _sum: { booked: 0 } }),
            deleteMany: async () => ({ count: 0 }),
        },
    };
    return { client, timings };
}

const EXISTING_MORNING: FakeTimingRow = {
    id: 't-existing',
    examInstanceId: 'inst-1',
    label: 'Morning',
    startMinute: 600, // 10:00
    endMinute: 720, // 12:00
    capacity: 50,
    weekdays: [0],
    priority: 1,
    isActive: true,
    sortOrder: 0,
};

function setup(existing: FakeTimingRow[] = []) {
    const db = createFakePrisma(existing);
    return { ...db, service: new SlotTimingService(db.client as never) };
}

describe('SlotTimingService.create', () => {
    it('allows two overlapping sittings of the same tier', async () => {
        const db = setup([EXISTING_MORNING]);

        // 10:00–12:30 runs straight into the existing 10:00–12:00 sitting on
        // the same tier. One slot can start while another is still running —
        // that is the admin's call now, not the catalogue's.
        const created = await db.service.create({
            examInstanceId: 'inst-1',
            startTime: '10:00',
            endTime: '12:30',
            priority: 1,
        } as never);

        expect(created.startMinute).toBe(600);
        expect(created.endMinute).toBe(750);
        expect(db.timings).toHaveLength(2);
    });

    it('still accepts an overlapping sitting of a different tier', async () => {
        const db = setup([EXISTING_MORNING]);

        const created = await db.service.create({
            examInstanceId: 'inst-1',
            startTime: '10:00',
            endTime: '12:30',
            priority: 2,
        } as never);

        expect(created.priority).toBe(2);
        expect(db.timings).toHaveLength(2);
    });

    it('still refuses a zero-length sitting', async () => {
        const db = setup();

        await expect(
            db.service.create({
                examInstanceId: 'inst-1',
                startTime: '10:00',
                endTime: '10:00',
            } as never),
        ).rejects.toThrow(BadRequestException);
    });

    it('still rejects times that are not HH:mm', async () => {
        const db = setup();

        await expect(
            db.service.create({ examInstanceId: 'inst-1', startTime: '10am', endTime: '12:00' } as never),
        ).rejects.toThrow(BadRequestException);
    });
});

describe('SlotTimingService.update', () => {
    it('accepts an overlapping rewrite of an existing timing', async () => {
        const db = setup([EXISTING_MORNING]);

        const updated = await db.service.update('t-existing', {
            endTime: '13:00',
        } as never);

        expect(updated.endMinute).toBe(780);
    });
});
