import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
    ConsoleEmailProvider,
    EmailProvider,
    ResendEmailProvider,
} from './email.provider';
import {
    RenderedEmail,
    accessPassActivatedEmail,
    adminBroadcastEmail,
    examSubmittedEmail,
    partnerAccessResentEmail,
    partnerAccessTokenRotatedEmail,
    partnerApplicationReceivedEmail,
    partnerEmailVerificationEmail,
    partnerApprovedEmail,
    partnerRejectedEmail,
    partnerRevokedEmail,
    partnerSchoolStatusChangedEmail,
    partnerStartVerificationEmail,
    resultsPublishedEmail,
    schoolAccessResentEmail,
    schoolAccessTokenRotatedEmail,
    schoolApplicationReceivedEmail,
    schoolEmailVerificationEmail,
    schoolStartVerificationEmail,
    schoolApprovedEmail,
    schoolRejectedEmail,
    schoolRevokedEmail,
    slotConfirmedEmail,
    welcomeEmail,
    parentApprovalEmail,
} from './templates';
import {
    ConsoleSmsProvider,
    SmsDiagnostics,
    SmsProvider,
    TwoFactorSmsProvider,
    toIndianLocal,
} from './sms.provider';

@Injectable()
export class NotificationService implements OnModuleInit {
    private readonly logger = new Logger(NotificationService.name);
    private email: EmailProvider = new ConsoleEmailProvider();
    /**
     * 2Factor is the only SMS gateway.
     *
     * A Fast2SMS path used to sit alongside it as an escape hatch for the
     * "reports Success but nothing arrives" problem. That turned out not to be a
     * gateway problem at all — the same 2Factor account delivers *voice* OTPs
     * perfectly, which is the signature of an unverified account rather than a
     * broken API — so a second gateway added a configuration surface and a whole
     * second set of failure modes while fixing nothing. The real fix is KYC on the
     * 2Factor account; see `docs/2FACTOR-KYC-SETUP.md`.
     *
     * SMS and voice are still separate fields: they are different 2Factor routes
     * with different failure modes, and voice working while SMS does not is
     * precisely the diagnostic that matters.
     */
    private sms: SmsProvider = new ConsoleSmsProvider();
    private voice: SmsProvider = new ConsoleSmsProvider();

    onModuleInit() {
        const apiKey = process.env.RESEND_API_KEY?.trim();
        // Resend requires the sender domain to be verified; the shared
        // onboarding address works untouched for first-run testing.
        const from = process.env.EMAIL_FROM?.trim() || 'onboarding@resend.dev';

        if (apiKey) {
            this.email = new ResendEmailProvider(apiKey, from);
            this.logger.log(`Email provider: resend (from ${from})`);
        } else {
            this.logger.warn(
                'RESEND_API_KEY not set — emails will be logged, not delivered.',
            );
        }

        // 2Factor sends under its own DLT-registered header, so OTP delivery to
        // Indian numbers works without the 2–4 week TRAI/DLT registration a
        // self-registered sender ID would require.
        const twoFactorKey = process.env.TWOFACTOR_API_KEY?.trim();

        const twoFactor = twoFactorKey
            ? new TwoFactorSmsProvider(
                  twoFactorKey,
                  process.env.TWOFACTOR_OTP_TEMPLATE?.trim() || 'AUTOGEN',
                  // Delivery reports cost nothing and are the only way to see a
                  // carrier drop. Opt out with TWOFACTOR_VERIFY_DELIVERY=false.
                  process.env.TWOFACTOR_VERIFY_DELIVERY?.trim().toLowerCase() !== 'false',
              )
            : null;

        if (twoFactor) {
            this.sms = twoFactor;
            this.voice = twoFactor;
        }

        // A leftover SMS_PROVIDER=fast2sms on a deployed environment would
        // silently do nothing now that there is one gateway. Say so, loudly,
        // rather than letting someone believe they switched gateway.
        const legacyProvider = process.env.SMS_PROVIDER?.trim().toLowerCase();
        if (legacyProvider && legacyProvider !== '2factor') {
            this.logger.warn(
                `SMS_PROVIDER="${legacyProvider}" is ignored — 2Factor is now the only SMS ` +
                    'gateway. Remove the variable to avoid confusion.',
            );
        }

        this.logger.log(`SMS provider: ${this.sms.name} · voice provider: ${this.voice.name}`);
        if (twoFactor) {
            if (twoFactor.activeTemplate) {
                this.logger.log(`2Factor OTP template: "${twoFactor.activeTemplate}"`);
            } else {
                // The single most likely cause of "2Factor says Success but no
                // SMS arrives": the account-default template is not DLT-approved,
                // so the carrier drops every message while the API reports fine.
                this.logger.warn(
                    'TWOFACTOR_OTP_TEMPLATE is unset/AUTOGEN — sending under the 2Factor ' +
                        'account-default template. If SMS OTPs are accepted but never arrive, ' +
                        'the account almost certainly needs KYC / business verification — ' +
                        'see docs/2FACTOR-KYC-SETUP.md. ' +
                        'Check balances with GET /api/admin/notifications/sms-health.',
                );
            }
        }
        if (this.sms.name === 'console') {
            this.logger.warn('No SMS gateway configured — OTPs will be logged, not delivered.');
        }
    }

    /**
     * Deliver a login OTP by SMS.
     *
     * Unlike the transactional mails above, failures here DO propagate: the
     * student is waiting on this code, and silently swallowing the error would
     * leave them staring at a code-entry box that can never be satisfied.
     */
    /**
     * Send an OTP SMS and return the code that was delivered.
     *
     * 2Factor mints the code (custom-value SMS no-ops on a DLT-sender account),
     * so the caller adopts and verifies the returned code.
     */
    async sendOtpSms(toE164: string): Promise<string> {
        try {
            return await this.sms.sendSmsOtp(toE164);
        } catch (err) {
            // Deliberately rethrown, not swallowed: the student is staring at a
            // code box. The provider has already logged which of its send
            // variants were tried and how each was rejected.
            this.logger.error(`SMS OTP via ${this.sms.name} failed: ${(err as Error).message}`);
            throw err;
        }
    }

    /** Read a caller-supplied code out as an automated voice call. Failures propagate. */
    async sendOtpVoice(toE164: string, code: string): Promise<void> {
        await this.voice.sendOtpVoice(toE164, code);
    }

    /**
     * Gateway health for the admin diagnostics screen.
     *
     * Exists because a 2Factor send that returns `Status: Success` is *not*
     * proof of delivery — an unapproved DLT template or an exhausted SMS
     * balance both look identical to a good send from inside this process. The
     * balances are the fastest way to tell those apart.
     */
    async smsDiagnostics(): Promise<SmsDiagnostics & { voice: string }> {
        const base = this.sms.diagnostics
            ? await this.sms.diagnostics()
            : { provider: this.sms.name };
        return { ...base, voice: this.voice.name };
    }

    /** Send a real OTP and report the gateway's tracking handle. Admin-only. */
    async smsProbe(toE164: string): Promise<{ provider: string; sessionId?: string }> {
        const traced = this.sms.sendSmsOtpTraced
            ? await this.sms.sendSmsOtpTraced(toE164)
            : { code: await this.sms.sendSmsOtp(toE164), sessionId: undefined };
        // The code itself is never returned — this endpoint proves delivery
        // works, it does not hand an admin a way to sign in as someone else.
        return { provider: this.sms.name, sessionId: traced.sessionId };
    }

    /** Carrier delivery status for a session id returned by `smsProbe`. */
    async smsDeliveryReport(sessionId: string): Promise<string> {
        if (!this.sms.deliveryReport) {
            return `Provider "${this.sms.name}" does not expose delivery reports.`;
        }
        return this.sms.deliveryReport(sessionId);
    }

    private get appUrl(): string {
        return process.env.FRONTEND_URL?.replace(/\/$/, '') || 'http://localhost:3000';
    }

    private get partnerPortalUrl(): string {
        return (
            process.env.PARTNER_PORTAL_URL?.replace(/\/$/, '') ||
            'https://bio-partner-portal.vercel.app'
        );
    }

    private get schoolPortalUrl(): string {
        return (
            process.env.SCHOOL_PORTAL_URL?.replace(/\/$/, '') ||
            'https://bio-school-portal.vercel.app'
        );
    }

    /**
     * Send and swallow failures.
     *
     * Every caller is a business action that already succeeded — the account
     * exists, the money is taken. Rethrowing here would fail the request and
     * roll the user's experience back over a mail problem, so failures are
     * logged for follow-up instead.
     */
    /**
     * Reports whether the mail actually went out.
     *
     * Still never throws — a mail outage must not fail the business action that
     * triggered it, which is the whole reason this wrapper exists. The boolean
     * is for callers that record *that* a message was sent (parent consent
     * stamps `approvalEmailSentAt` from it); everything else ignores it, and a
     * `false` reads exactly as the old silent failure did.
     */
    private async deliver(to: string | null | undefined, mail: RenderedEmail): Promise<boolean> {
        if (!to) return false;
        try {
            await this.email.send({ to, subject: mail.subject, html: mail.html, text: mail.text });
            this.logger.log(`Sent "${mail.subject}" to ${to}`);
            return true;
        } catch (err) {
            this.logger.error(
                `Failed to send "${mail.subject}" to ${to}: ${(err as Error).message}`,
            );
            return false;
        }
    }

    // ── The four milestone mails ──────────────────────────────────────────────
    // Registration → exam start → (during exam: in-product, no mail) → post exam.
    // All of them go through `deliver`, so a mail outage can never fail the
    // business action that triggered it.

    /** Milestone 1 — registration complete. */
    async sendWelcome(to: string, firstName: string, rollNumber?: string | null): Promise<void> {
        await this.deliver(to, welcomeEmail({ firstName, rollNumber, appUrl: this.appUrl }));
    }

    async sendAccessPassActivated(to: string, firstName: string, amountPaise: number): Promise<void> {
        await this.deliver(
            to,
            accessPassActivatedEmail({ firstName, amountPaise, appUrl: this.appUrl }),
        );
    }

    /** Milestone 2 — a confirmed slot means the exam is really happening. */
    async sendSlotConfirmed(
        to: string,
        vars: {
            firstName: string;
            examTitle: string;
            slotLabel?: string | null;
            startsAt: Date;
            endsAt: Date;
            rollNumber?: string | null;
            bookingId: string;
        },
    ): Promise<void> {
        await this.deliver(to, slotConfirmedEmail({ ...vars, appUrl: this.appUrl }));
    }

    /** Milestone 4a — receipt of the submission (score still provisional). */
    async sendExamSubmitted(to: string, firstName: string, examTitle: string): Promise<void> {
        await this.deliver(to, examSubmittedEmail({ firstName, examTitle, appUrl: this.appUrl }));
    }

    /** Milestone 4b — the final report is published and the score is no longer provisional. */
    async sendResultsPublished(to: string, firstName: string, examTitle: string): Promise<void> {
        await this.deliver(to, resultsPublishedEmail({ firstName, examTitle, appUrl: this.appUrl }));
    }

    /** Returns whether the mail was actually delivered, so the consent record can stamp it. */
    async sendParentApprovalEmail(
        to: string,
        guardianName: string,
        studentName: string,
    ): Promise<boolean> {
        const approvalLink = `${this.appUrl}/consent`;
        return this.deliver(
            to,
            parentApprovalEmail({ guardianName, studentName, approvalLink }),
        );
    }

    // ── Partner lifecycle ──────────────────────────────────────────────────
    // Applying, approval, rejection, revocation and token rotation previously
    // sent nothing — staff hand-copied a card into an email or WhatsApp. These
    // replace that manual step; every one returns whether it actually sent, so
    // the admin access queue can show a real "email sent" confirmation instead
    // of assuming one went out.

    async sendPartnerEmailVerification(
        to: string,
        vars: { contactPerson: string; orgName: string; token: string },
    ): Promise<boolean> {
        const url = `${this.partnerPortalUrl}/verify?token=${encodeURIComponent(vars.token)}`;
        return this.deliver(
            to,
            partnerEmailVerificationEmail({
                contactPerson: vars.contactPerson,
                orgName: vars.orgName,
                verificationUrl: url,
            }),
        );
    }

    /** The email-verify-first step, before any org details exist to greet the reader with. */
    async sendPartnerStartVerification(to: string, vars: { token: string }): Promise<boolean> {
        const url = `${this.partnerPortalUrl}/verify?token=${encodeURIComponent(vars.token)}`;
        return this.deliver(to, partnerStartVerificationEmail({ verificationUrl: url }));
    }

    async sendPartnerApplicationReceived(to: string, contactPerson: string, orgName: string): Promise<boolean> {
        return this.deliver(to, partnerApplicationReceivedEmail({ contactPerson, orgName }));
    }

    async sendPartnerApproved(
        to: string,
        vars: { contactPerson: string; orgName: string; accessToken: string },
    ): Promise<boolean> {
        return this.deliver(
            to,
            partnerApprovedEmail({ ...vars, portalUrl: this.partnerPortalUrl }),
        );
    }

    async sendPartnerRejected(
        to: string,
        vars: { contactPerson: string; orgName: string; reason: string },
    ): Promise<boolean> {
        return this.deliver(to, partnerRejectedEmail(vars));
    }

    async sendPartnerRevoked(
        to: string,
        vars: { contactPerson: string; orgName: string; reason: string },
    ): Promise<boolean> {
        return this.deliver(to, partnerRevokedEmail(vars));
    }

    async sendPartnerTokenRotated(
        to: string,
        vars: { contactPerson: string; orgName: string; accessToken: string },
    ): Promise<boolean> {
        return this.deliver(
            to,
            partnerAccessTokenRotatedEmail({ ...vars, portalUrl: this.partnerPortalUrl }),
        );
    }

    /** Same details as an approval mail, framed as a resend rather than a new decision. */
    async sendPartnerAccessResent(
        to: string,
        vars: { contactPerson: string; orgName: string; accessToken: string },
    ): Promise<boolean> {
        return this.deliver(
            to,
            partnerAccessResentEmail({ ...vars, portalUrl: this.partnerPortalUrl }),
        );
    }

    /** Tells the onboarding partner what happened to a school it submitted. */
    async sendPartnerSchoolStatusChanged(
        to: string,
        vars: { contactPerson: string; schoolName: string; status: 'APPROVED' | 'REJECTED' },
    ): Promise<boolean> {
        return this.deliver(
            to,
            partnerSchoolStatusChangedEmail({ ...vars, portalUrl: this.partnerPortalUrl }),
        );
    }

    // ── School lifecycle ───────────────────────────────────────────────────
    // A school has no password — the access token in the approval/rotation/
    // resend mails below is the only way a coordinator ever signs in.

    async sendSchoolEmailVerification(
        to: string,
        vars: { coordinatorName: string; schoolName: string; token: string },
    ): Promise<boolean> {
        const url = `${this.schoolPortalUrl}/verify?token=${encodeURIComponent(vars.token)}`;
        return this.deliver(
            to,
            schoolEmailVerificationEmail({
                coordinatorName: vars.coordinatorName,
                schoolName: vars.schoolName,
                verificationUrl: url,
            }),
        );
    }

    /** The email-verify-first step, before any school/coordinator details exist to greet the reader with. */
    async sendSchoolStartVerification(to: string, vars: { token: string }): Promise<boolean> {
        const url = `${this.schoolPortalUrl}/verify?token=${encodeURIComponent(vars.token)}`;
        return this.deliver(to, schoolStartVerificationEmail({ verificationUrl: url }));
    }

    async sendSchoolApplicationReceived(to: string, coordinatorName: string, schoolName: string): Promise<boolean> {
        return this.deliver(to, schoolApplicationReceivedEmail({ coordinatorName, schoolName }));
    }

    async sendSchoolApproved(
        to: string,
        vars: {
            coordinatorName: string;
            schoolName: string;
            schoolCode: string | null;
            accessToken: string;
        },
    ): Promise<boolean> {
        return this.deliver(to, schoolApprovedEmail({ ...vars, portalUrl: this.schoolPortalUrl }));
    }

    async sendSchoolRejected(
        to: string,
        vars: { coordinatorName: string; schoolName: string; reason: string },
    ): Promise<boolean> {
        return this.deliver(to, schoolRejectedEmail(vars));
    }

    async sendSchoolRevoked(
        to: string,
        vars: { coordinatorName: string; schoolName: string; reason: string },
    ): Promise<boolean> {
        return this.deliver(to, schoolRevokedEmail(vars));
    }

    async sendSchoolTokenRotated(
        to: string,
        vars: { coordinatorName: string; schoolName: string; accessToken: string },
    ): Promise<boolean> {
        return this.deliver(
            to,
            schoolAccessTokenRotatedEmail({ ...vars, portalUrl: this.schoolPortalUrl }),
        );
    }

    /** Same details as an approval mail, framed as a resend rather than a new decision. */
    async sendSchoolAccessResent(
        to: string,
        vars: { coordinatorName: string; schoolName: string; accessToken: string },
    ): Promise<boolean> {
        return this.deliver(to, schoolAccessResentEmail({ ...vars, portalUrl: this.schoolPortalUrl }));
    }

    /**
     * Deliver an admin-composed message to one recipient.
     *
     * Unlike the transactional mails above, the caller (an admin broadcast) needs
     * a per-recipient success/failure count, so this returns a boolean instead of
     * swallowing to void.
     */
    async sendAdminBroadcast(to: string, subject: string, message: string): Promise<boolean> {
        const mail = adminBroadcastEmail({ subject, message, appUrl: this.appUrl });
        try {
            await this.email.send({ to, subject: mail.subject, html: mail.html, text: mail.text });
            return true;
        } catch (err) {
            this.logger.error(`Admin mail to ${to} failed: ${(err as Error).message}`);
            return false;
        }
    }

    /**
     * Whether admin free-text SMS can be sent at all.
     *
     * Free-text (non-OTP) SMS to Indian numbers is a DLT-regulated route: it needs
     * the account's own registered sender id AND an approved template. The OTP
     * template can't carry arbitrary text. If either env var is missing there is
     * nothing to send through, so callers should skip the blast and tell the admin
     * exactly what to configure instead of firing doomed requests.
     */
    isAdminSmsConfigured(): boolean {
        return Boolean(
            process.env.TWOFACTOR_API_KEY?.trim() &&
                process.env.TWOFACTOR_SENDER_ID?.trim() &&
                process.env.TWOFACTOR_SMS_TEMPLATE?.trim(),
        );
    }

    /**
     * Send an admin-composed SMS to one number via 2Factor's transactional route.
     *
     * The admin's typed message is dropped verbatim into the template's single
     * variable, so a catch-all `{#var#}` template sends whatever was written. On
     * failure it returns the reason (not just `false`) so the caller can show the
     * admin *why* a send failed rather than a bare count.
     */
    async sendAdminSms(
        toE164: string,
        message: string,
    ): Promise<{ ok: boolean; error?: string }> {
        const apiKey = process.env.TWOFACTOR_API_KEY?.trim();
        const sender = process.env.TWOFACTOR_SENDER_ID?.trim();
        const template = process.env.TWOFACTOR_SMS_TEMPLATE?.trim();

        if (!apiKey || !sender || !template) {
            const reason =
                'SMS sender ID / template not configured (TWOFACTOR_SENDER_ID, TWOFACTOR_SMS_TEMPLATE).';
            this.logger.warn(`SMS to ${toE164} not sent — ${reason}`);
            return { ok: false, error: reason };
        }

        const number = toIndianLocal(toE164);
        const url =
            `https://2factor.in/API/R1/?module=TRANS_SMS&apikey=${encodeURIComponent(apiKey)}` +
            `&to=${encodeURIComponent(number)}&from=${encodeURIComponent(sender)}` +
            `&templatename=${encodeURIComponent(template)}&var1=${encodeURIComponent(message)}`;

        try {
            const res = await fetch(url, { method: 'GET' });
            const body = await res.text().catch(() => '');
            // A 200 can still carry Status:"Error" (bad template, DLT mismatch…).
            if (!res.ok || /"Status"\s*:\s*"Error"/i.test(body)) {
                const reason = `2Factor ${res.status}: ${body.slice(0, 200)}`;
                this.logger.error(`Admin SMS to ${toE164} failed: ${reason}`);
                return { ok: false, error: reason };
            }
            return { ok: true };
        } catch (err) {
            const reason = (err as Error).message;
            this.logger.error(`Admin SMS to ${toE164} failed: ${reason}`);
            return { ok: false, error: reason };
        }
    }
}
