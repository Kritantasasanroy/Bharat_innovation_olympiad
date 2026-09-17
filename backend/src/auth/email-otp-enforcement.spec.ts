import { UnauthorizedException } from '@nestjs/common';

/**
 * The hole this closes.
 *
 * `POST /auth/login-sync` used to take an email address and hand back a 24-hour
 * JWT for it, on the understanding that the browser had been through Neon Auth
 * first. Nothing enforced that. Anyone who could POST could sign in as anyone —
 * the end-to-end checks in `scripts/e2e` got a real student token that way,
 * with nothing but an address.
 *
 * `login-sync-phone` never had the hole; its comment names it exactly. These
 * tests pin the email side to the same rule, and pin the migration switch that
 * lets an environment still on Neon Auth keep working until its frontend sends
 * codes.
 *
 * `EMAIL_OTP_PROVIDER` is read at module load, so it is set before the import.
 */
process.env.EMAIL_OTP_PROVIDER = 'backend';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthController } = require('./auth.controller');

const USER = { id: 'u1', email: 'ada@example.com', role: 'STUDENT' };

function controller(overrides: { verifyOtp?: jest.Mock; sendOtp?: jest.Mock } = {}) {
    const verifyOtp = overrides.verifyOtp ?? jest.fn().mockResolvedValue('ada@example.com');
    const sendOtp = overrides.sendOtp ?? jest.fn().mockResolvedValue({ sent: true, expiresInSeconds: 600 });
    const authService = {
        getUserByEmail: jest.fn().mockResolvedValue(USER),
        syncUser: jest.fn().mockResolvedValue(USER),
        // Covered on its own in record-pending-applicant.spec.ts; here it only
        // needs to exist so the controller's fire-and-forget call has something
        // to await.
        recordPendingApplicant: jest.fn().mockResolvedValue(undefined),
    };
    const jwtService = { sign: jest.fn().mockReturnValue('signed.jwt') };
    const ctrl = new AuthController(
        authService as never,
        jwtService as never,
        { tryCaptureSignup: jest.fn() } as never,
        {} as never,
        { verifyOtp, sendOtp } as never,
    );
    return { ctrl, verifyOtp, sendOtp, authService, jwtService };
}

describe('email sign-in requires a code the server issued', () => {
    it('refuses login-sync with no code at all', async () => {
        const { ctrl, authService } = controller();

        await expect(ctrl.loginSync({ email: 'ada@example.com' })).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
        // The account is never even looked up — nothing leaks about who exists.
        expect(authService.getUserByEmail).not.toHaveBeenCalled();
    });

    it('refuses login-sync when the code does not check out', async () => {
        const verifyOtp = jest.fn().mockRejectedValue(new Error('This code is invalid or has expired.'));
        const { ctrl, jwtService } = controller({ verifyOtp });

        await expect(
            ctrl.loginSync({ email: 'ada@example.com', code: '000000' }),
        ).rejects.toThrow(/invalid or has expired/);
        expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('issues a token once the code checks out', async () => {
        const { ctrl, verifyOtp } = controller();

        const res = await ctrl.loginSync({ email: 'ada@example.com', code: '123456' });

        expect(verifyOtp).toHaveBeenCalledWith('STUDENT', 'ada@example.com', '123456');
        expect(res.accessToken).toBe('signed.jwt');
    });

    // Registration mints a token too, so it needs the same proof — otherwise the
    // check on login is bypassed by simply registering the address instead.
    it('refuses registration with no code', async () => {
        const { ctrl, authService } = controller();

        await expect(
            ctrl.syncUser({ email: 'ada@example.com', firstName: 'Ada', lastName: 'L', phone: '+919812345678' }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(authService.syncUser).not.toHaveBeenCalled();
    });

    it('registers once the code checks out', async () => {
        const { ctrl, verifyOtp } = controller();

        const res = await ctrl.syncUser({
            email: 'ada@example.com',
            firstName: 'Ada',
            lastName: 'L',
            phone: '+919812345678',
            code: '123456',
        });

        expect(verifyOtp).toHaveBeenCalledWith('STUDENT', 'ada@example.com', '123456');
        expect(res.accessToken).toBe('signed.jwt');
    });

    // The code is namespaced by kind, so one emailed for a school or partner
    // flow cannot be replayed to sign in as a student.
    it('only ever redeems a STUDENT-kind code', async () => {
        const { ctrl, verifyOtp } = controller();
        await ctrl.loginSync({ email: 'ada@example.com', code: '123456' });
        expect(verifyOtp.mock.calls[0][0]).toBe('STUDENT');
    });

    it('sends a STUDENT-kind code', async () => {
        const { ctrl, sendOtp } = controller();
        await ctrl.sendEmailOtp({ email: 'ada@example.com' });
        expect(sendOtp).toHaveBeenCalledWith('STUDENT', 'ada@example.com', undefined);
    });

    // Registration's details step validates a name before this endpoint is
    // ever called; it rides along so the emailed code can greet the student
    // by name instead of the endpoint having to resolve it itself.
    it('passes a typed name through to the OTP service', async () => {
        const { ctrl, sendOtp } = controller();
        await ctrl.sendEmailOtp({ email: 'ada@example.com', name: 'Ada' });
        expect(sendOtp).toHaveBeenCalledWith('STUDENT', 'ada@example.com', 'Ada');
    });
});
