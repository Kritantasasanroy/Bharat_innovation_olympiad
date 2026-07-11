import { NotFoundException } from '@nestjs/common';
import { SupportService } from './support.service';

function createFakeDb() {
    let seq = 0;
    const tickets: any[] = [];
    const prisma: any = {
        supportTicket: {
            create: async ({ data }: any) => {
                const row = { id: `t-${++seq}`, status: 'OPEN', createdAt: new Date(), ...data };
                tickets.push(row);
                return row;
            },
            findUnique: async ({ where }: any) => tickets.find((t) => t.id === where.id) ?? null,
            findMany: async ({ where }: any) =>
                tickets.filter(
                    (t) =>
                        (!where?.submitterId || t.submitterId === where.submitterId) &&
                        (!where?.status || t.status === where.status) &&
                        (!where?.source || t.source === where.source),
                ),
            update: async ({ where, data }: any) => {
                const t = tickets.find((x) => x.id === where.id);
                Object.assign(t, data);
                return t;
            },
        },
    };
    return { prisma, tickets };
}

function setup() {
    const db = createFakeDb();
    return { ...db, service: new SupportService(db.prisma) };
}

const partner = { id: 'partner-1', name: 'Acme', email: 'p@acme.test' };
const ticket = { category: 'CAMPAIGN', subject: 'Help', message: 'Please help' };

describe('SupportService', () => {
    it('a partner ticket is captured and visible to admin', async () => {
        const { service, tickets } = setup();

        const created = await service.create('PARTNER' as any, partner, ticket as any);

        expect(created).toMatchObject({ source: 'PARTNER', submitterId: 'partner-1', status: 'OPEN' });
        const adminView = await service.listAll();
        expect(adminView).toHaveLength(1);
        expect(adminView[0].submitterName).toBe('Acme');
        // tickets store confirms it persisted (unlike the old in-memory portal-api store)
        expect(tickets).toHaveLength(1);
    });

    it('lists a raiser only their own tickets', async () => {
        const { service } = setup();
        await service.create('PARTNER' as any, partner, ticket as any);
        await service.create('SCHOOL' as any, { id: 'coord-1', name: 'Anita', email: 'a@x.test' }, ticket as any);

        expect(await service.listForSubmitter('partner-1')).toHaveLength(1);
        expect(await service.listForSubmitter('coord-1')).toHaveLength(1);
    });

    it('admin filters by source and status', async () => {
        const { service } = setup();
        await service.create('PARTNER' as any, partner, ticket as any);
        await service.create('SCHOOL' as any, { id: 'c', name: 'C', email: 'c@x.test' }, ticket as any);

        expect(await service.listAll({ source: 'PARTNER' as any })).toHaveLength(1);
        expect(await service.listAll({ status: 'OPEN' as any })).toHaveLength(2);
        expect(await service.listAll({ status: 'RESOLVED' as any })).toHaveLength(0);
    });

    it('admin resolves a ticket with a response', async () => {
        const { service } = setup();
        const t = await service.create('PARTNER' as any, partner, ticket as any);

        const decided = await service.decide(t.id, { status: 'RESOLVED', response: 'Sorted' }, 'admin-1');

        expect(decided.status).toBe('RESOLVED');
        expect(decided.response).toBe('Sorted');
        expect(decided.decidedBy).toBe('admin-1');
    });

    it('throws for an unknown ticket', async () => {
        const { service } = setup();
        await expect(service.decide('nope', { status: 'RESOLVED' } as any, 'a')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});
