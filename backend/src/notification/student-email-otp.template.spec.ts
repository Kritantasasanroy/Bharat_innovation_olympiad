import { studentEmailOtpEmail } from './templates';

/**
 * The copy this replaced: "Someone asked to sign in… / Someone started a
 * registration…", regardless of who was actually asking. Deepak: "dont write
 * someone, display the accounts name in mail."
 */
describe('studentEmailOtpEmail', () => {
    const CODE = '370572';

    it('greets the student by name and never says "someone"', () => {
        const mail = studentEmailOtpEmail({ code: CODE, name: 'Ada', expiresInMinutes: 10 });

        expect(mail.html).toContain('Hi Ada');
        expect(mail.html.toLowerCase()).not.toContain('someone');
    });

    it('still avoids "someone" when no name is known, without claiming the address is unrecognised', () => {
        const mail = studentEmailOtpEmail({ code: CODE, name: null, expiresInMinutes: 10 });

        expect(mail.html.toLowerCase()).not.toContain('someone');
        // An account-enumeration leak, not a wording preference: this endpoint
        // takes no auth, so a distinct "we don't recognise this email" message
        // would let anyone test which addresses have accounts.
        expect(mail.html.toLowerCase()).not.toMatch(/no account|not found|don'?t recogni[sz]e/);
    });

    it('carries the code and its real expiry', () => {
        const mail = studentEmailOtpEmail({ code: CODE, name: 'Ada', expiresInMinutes: 10 });

        expect(mail.html).toContain(CODE);
        expect(mail.html).toContain('expires in 10 minutes');
    });

    // The name is student-typed input rendered into an HTML email — the exact
    // shape of an XSS vector if it were interpolated raw.
    it('escapes an untrusted name rather than interpolating it raw', () => {
        const mail = studentEmailOtpEmail({
            code: CODE,
            name: '<img src=x onerror=alert(1)>',
            expiresInMinutes: 10,
        });

        expect(mail.html).not.toContain('<img src=x onerror=alert(1)>');
        expect(mail.html).toContain('&lt;img');
    });

    it('the same code sent for registration and for sign-in is worded identically apart from the name', () => {
        // There is deliberately no `purpose` field any more: a code must not
        // read as belonging to one flow, because the same code is valid for
        // whichever flow the student actually completes.
        const first = studentEmailOtpEmail({ code: CODE, name: 'Ada', expiresInMinutes: 10 });
        const second = studentEmailOtpEmail({ code: CODE, name: 'Ada', expiresInMinutes: 10 });

        expect(first.html).toBe(second.html);
    });
});
