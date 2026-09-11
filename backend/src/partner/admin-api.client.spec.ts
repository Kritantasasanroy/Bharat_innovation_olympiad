import { InternalServerErrorException } from '@nestjs/common';

/**
 * The partner engine client, and the two failures an admin actually sees.
 *
 * On dev, "Grant access" failed for weeks with
 *
 *     Partner engine (admin-api) unreachable at http://localhost:4100
 *
 * because `ADMIN_API_URL` was never set in Parameter Store and the fallback
 * points at a port inside the API's own container. The engine was up the whole
 * time, one hop away, on the same box.
 *
 * These tests pin the *shape* of what the client does with each kind of
 * failure — a dead socket, a cold start, an error from the engine — because the
 * post-deploy pipeline check (`scripts/e2e/pipeline.mjs`) recognises those
 * failures by their message. If the wording here changes, that check goes blind,
 * so the two are pinned together on purpose.
 *
 * `ADMIN_API_URL` is read at module load, so it is set before the import.
 */
const ENGINE = 'http://engine.test:4100';
process.env.ADMIN_API_URL = ENGINE;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PartnerAdminApiClient } = require('./admin-api.client');

type Client = InstanceType<typeof PartnerAdminApiClient>;

const jwt = { sign: jest.fn().mockReturnValue('signed.staff.token') };

function client(): Client {
    jwt.sign.mockClear();
    return new PartnerAdminApiClient(jwt as never);
}

/** A successful admin-api envelope. */
const ok = (data: unknown) =>
    ({ status: 200, ok: true, json: async () => ({ success: true, data }) }) as unknown as Response;

/** admin-api's own error envelope. */
const engineError = (status: number, message: string) =>
    ({ status, ok: false, json: async () => ({ success: false, error: { message } }) }) as unknown as Response;

beforeEach(() => {
    jest.restoreAllMocks();
});

describe('PartnerAdminApiClient — the happy path', () => {
    it('PATCHes the access decision to the engine and returns its data', async () => {
        const fetchMock = jest
            .spyOn(global, 'fetch')
            .mockResolvedValue(ok({ id: 'p1', status: 'APPROVED' }));

        const result = await client().setAccess('p1', 'APPROVED', 'looks legitimate');

        expect(result).toEqual({ id: 'p1', status: 'APPROVED' });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${ENGINE}/partners/p1/access`);
        expect(init.method).toBe('PATCH');
        expect(JSON.parse(String(init.body))).toEqual({
            status: 'APPROVED',
            reason: 'looks legitimate',
        });
    });

    it('presents a staff token so admin-api accepts the call', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue(ok({ id: 'p1', status: 'APPROVED' }));
        const c = client();
        await c.setAccess('p1', 'APPROVED', 'ok');

        // admin-api's assertStaffRole reads `role`; SUPER_ADMIN is in its staff set.
        expect(jwt.sign).toHaveBeenCalledWith(
            expect.objectContaining({ role: 'SUPER_ADMIN' }),
            expect.objectContaining({ expiresIn: '5m' }),
        );
    });

    it('signs the acting admin into `sub`, so a bank-details reveal is audited against a person', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue(ok(null));
        await client().getBankDetails('p1', true, 'admin-42');

        expect(jwt.sign).toHaveBeenCalledWith(
            { sub: 'admin-42', role: 'SUPER_ADMIN' },
            expect.anything(),
        );
    });

    it('escapes a partner id rather than pasting it into the path', async () => {
        const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(ok({}));
        await client().getPartner('p 1/../admin');

        expect(fetchMock.mock.calls[0][0]).toBe(`${ENGINE}/partners/p%201%2F..%2Fadmin`);
    });
});

describe('PartnerAdminApiClient — when the engine cannot be reached', () => {
    // THE regression. A refused socket is not a 500 from the engine; it means
    // the address is wrong or nothing is listening on it. The message has to
    // name the address, because the address is the bug.
    it('names the address it tried, so a misconfigured URL is visible', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

        // `fast` never retries, so this resolves immediately.
        const err = await client()
            // eslint-disable-next-line @typescript-eslint/dot-notation
            ['call']('/campaigns/by-code/abc', { method: 'GET' }, 'fast')
            .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(InternalServerErrorException);
        expect((err as Error).message).toBe(`Partner engine (admin-api) unreachable at ${ENGINE}.`);
        expect((err as Error).message).toContain(ENGINE);
    });

    it('does not retry on the fast policy — a sleeping engine must cost milliseconds', async () => {
        const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

        await client()
            // eslint-disable-next-line @typescript-eslint/dot-notation
            ['call']('/campaigns/by-code/abc', { method: 'GET' }, 'fast')
            .catch(() => undefined);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // Render's edge answers 502/503/504 while the free-tier service boots. That
    // is a different situation from a wrong address and says so, because the
    // fix is "wait", not "check your config".
    it('tells a caller to wait when the engine is merely starting up', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue({ status: 503 } as Response);

        const err = await client()
            // eslint-disable-next-line @typescript-eslint/dot-notation
            ['call']('/campaigns/by-code/abc', { method: 'GET' }, 'fast')
            .catch((e: unknown) => e);

        expect((err as Error).message).toBe(
            'The partner engine is starting up. Please try again in a moment.',
        );
    });

    it('surfaces the engine’s own error message rather than a generic 500', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue(engineError(404, 'Partner not found'));

        const err = await client()
            .setAccess('nope', 'APPROVED', 'reason')
            .catch((e: unknown) => e);

        expect((err as Error).message).toBe('Partner not found');
    });
});

describe('PartnerAdminApiClient — attribution never breaks a student', () => {
    // A referral touch is best-effort: losing one while the engine is asleep is
    // the accepted trade, but a student's registration must not fail with it.
    it('swallows an unreachable engine when resolving a referral code', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(client().resolvePartnerIdByReferralCode('ref_abc')).resolves.toBeNull();
    });

    it('swallows an unreachable engine when capturing a signup', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(client().tryCaptureSignup('ref_abc', 'student-1')).resolves.toBeUndefined();
    });

    it('swallows an unreachable engine when crediting a paid conversion', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(
            client().tryCapturePaidConversion('ref_abc', 'student-1', 'reg-1', 100),
        ).resolves.toBeUndefined();
    });
});
