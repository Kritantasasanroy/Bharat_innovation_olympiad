import { studentEmailOtpEmail } from './templates';

/**
 * BIO-STU-001 — the approved verification-OTP copy. Deliberately impersonal:
 * the endpoint takes no auth, so naming the account holder on a sign-in code
 * would be an account-enumeration oracle.
 */
describe('studentEmailOtpEmail', () => {
    const CODE = '370572';

    it('carries the approved subject and the verification code', () => {
        const mail = studentEmailOtpEmail({ code: CODE, name: 'Ada', expiresInMinutes: 10 });

        expect(mail.subject).toBe('Verify your email for Bharat Innovation Olympiad 🔐');
        expect(mail.html).toContain('Your Verification Code is');
        expect(mail.html).toContain(CODE);
    });

    it('states the real validity window and the no-sharing line', () => {
        const mail = studentEmailOtpEmail({ code: CODE, name: 'Ada', expiresInMinutes: 10 });

        expect(mail.html).toContain('valid for 10 minutes');
        expect(mail.html).toContain('do not share this code with anyone');
    });

    it('never says "someone" and never leaks whether the address has an account', () => {
        for (const name of ['Ada', null] as const) {
            const mail = studentEmailOtpEmail({ code: CODE, name, expiresInMinutes: 10 });
            expect(mail.html.toLowerCase()).not.toContain('someone');
            // An account-enumeration leak, not a wording preference: this
            // endpoint takes no auth, so a distinct "we don't recognise this
            // email" message would let anyone test which addresses have
            // accounts.
            expect(mail.html.toLowerCase()).not.toMatch(/no account|not found|don'?t recogni[sz]e/);
        }
    });

    it('ignores the name entirely — a code reads identically for registration and sign-in', () => {
        // The same code is valid for whichever flow the student completes; the
        // approved copy has no greeting, so `name` must not leak into the body.
        const first = studentEmailOtpEmail({ code: CODE, name: 'Ada', expiresInMinutes: 10 });
        const second = studentEmailOtpEmail({ code: CODE, name: null, expiresInMinutes: 10 });
        const hostile = studentEmailOtpEmail({
            code: CODE,
            name: '<img src=x onerror=alert(1)>',
            expiresInMinutes: 10,
        });

        expect(first.html).toBe(second.html);
        expect(hostile.html).toBe(first.html);
    });
});
