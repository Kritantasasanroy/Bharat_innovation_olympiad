import { AuthService } from './auth.service';

/**
 * `recordPendingApplicant` — the write behind the admin "pending applicants"
 * list. Backs `POST /auth/email/send-otp`, so every assertion here is really
 * "what does an admin see about someone who started registering."
 */
function setup() {
    const rows = new Map<string, any>();
    const prisma: any = {
        pendingApplicant: {
            upsert: async ({ where, create, update }: any) => {
                const existing = rows.get(where.email);
                const row = existing ? { ...existing, ...update } : { id: `pa-${rows.size + 1}`, ...create };
                rows.set(where.email, row);
                return row;
            },
        },
    };
    const service = new AuthService(prisma, {} as never, {} as never, {} as never, {} as never);
    return { service, rows };
}

describe('AuthService.recordPendingApplicant', () => {
    it('does nothing for a sign-in request — no name means nothing to snapshot', async () => {
        const { service, rows } = setup();

        await service.recordPendingApplicant({ email: 'ada@example.com' } as any);

        expect(rows.size).toBe(0);
    });

    it('snapshots every field the details step can supply', async () => {
        const { service, rows } = setup();

        await service.recordPendingApplicant({
            email: 'Ada@Example.com',
            name: 'Ada',
            lastName: 'Lovelace',
            phone: '+919900011122',
            classBand: 9,
            schoolId: 'school-1',
            schoolName: 'DPS',
            section: 'B2',
        } as any);

        const row = rows.get('ada@example.com');
        expect(row).toMatchObject({
            firstName: 'Ada',
            lastName: 'Lovelace',
            phone: '+919900011122',
            classBand: 9,
            schoolId: 'school-1',
            schoolName: 'DPS',
            section: 'B2',
        });
    });

    it('normalises the email so a resend and the original attempt are one row', async () => {
        const { service, rows } = setup();

        await service.recordPendingApplicant({ email: 'Ada@Example.com', name: 'Ada' } as any);
        await service.recordPendingApplicant({ email: 'ADA@EXAMPLE.COM', name: 'Ada' } as any);

        expect(rows.size).toBe(1);
    });

    // A resend after fixing a typo must show the correction, not the first
    // (wrong) attempt — updatedAt, not createdAt, is what an admin should trust.
    it('a later send overwrites the earlier snapshot rather than keeping the first one', async () => {
        const { service, rows } = setup();

        await service.recordPendingApplicant({ email: 'ada@example.com', name: 'Ada', phone: '+91000' } as any);
        await service.recordPendingApplicant({ email: 'ada@example.com', name: 'Ada', phone: '+91999' } as any);

        expect(rows.get('ada@example.com').phone).toBe('+91999');
    });

    it('never throws — a write failure here must not block the OTP send', async () => {
        const prisma: any = {
            pendingApplicant: { upsert: async () => { throw new Error('db is down'); } },
        };
        const service = new AuthService(prisma, {} as never, {} as never, {} as never, {} as never);

        await expect(
            service.recordPendingApplicant({ email: 'ada@example.com', name: 'Ada' } as any),
        ).resolves.toBeUndefined();
    });
});
