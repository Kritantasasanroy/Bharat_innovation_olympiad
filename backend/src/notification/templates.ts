/**
 * Transactional email bodies.
 *
 * Kept as plain functions rather than DB rows: these are the few
 * system-critical mails (account created, payment confirmed) whose wording
 * ships with the code and is reviewed with it. Admin-editable marketing
 * templates are a separate concern (PRD-PORTAL-05).
 */

const BRAND = 'Bharat Innovation Olympiad';

/** Inlined because most email clients strip <style> blocks and all external CSS. */
function layout(heading: string, bodyHtml: string, cta?: { label: string; url: string }): string {
    return `
<div style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <p style="margin:0 0 24px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a8f98;">${BRAND}</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111827;">${escapeHtml(heading)}</h1>
    <div style="font-size:15px;line-height:1.6;color:#374151;">${bodyHtml}</div>
    ${cta
            ? `<p style="margin:28px 0 0;">
             <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#ffcb05;color:#111827;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">${escapeHtml(cta.label)}</a>
           </p>`
            : ''
        }
    <p style="margin:32px 0 0;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
      You received this because you have an account with ${BRAND}.
    </p>
  </div>
</div>`.trim();
}

/** Strip tags for the text/plain alternative — improves deliverability. */
function toText(html: string): string {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

function build(subject: string, heading: string, body: string, cta?: { label: string; url: string }): RenderedEmail {
    const html = layout(heading, body, cta);
    return { subject, html, text: toText(html) };
}

/** A labelled fact block — roll number, slot, that sort of thing. */
function factRow(label: string, value: string): string {
    return `<tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;white-space:nowrap;">${escapeHtml(label)}</td>
      <td style="padding:6px 0 6px 16px;font-size:15px;font-weight:600;color:#111827;">${escapeHtml(value)}</td>
    </tr>`;
}

function factTable(rows: string[]): string {
    if (rows.length === 0) return '';
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;padding:14px 18px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
      ${rows.join('')}
    </table>`;
}

/** A numbered "what happens next" list — the orientation content, reused across mails. */
function steps(items: string[]): string {
    return `<ol style="margin:8px 0 0;padding-left:20px;font-size:15px;line-height:1.7;color:#374151;">
      ${items.map((i) => `<li style="margin-bottom:6px;">${i}</li>`).join('')}
    </ol>`;
}

/**
 * Milestone 1 of 4 — registration complete.
 *
 * Carries the orientation content ("Thank you and detailed messages for
 * acclamatization, orientation"): what the student now has, what happens next,
 * and what to have ready. The roll number is here because this is the email a
 * parent searches for months later when support asks for it.
 */
export function welcomeEmail(vars: {
    firstName: string;
    appUrl: string;
    rollNumber?: string | null;
}): RenderedEmail {
    return build(
        `Welcome to ${BRAND}`,
        `Welcome, ${escapeHtml(vars.firstName)}!`,
        `<p style="margin:0 0 12px;">Your registration is complete. Keep this email — it has your roll number.</p>
     ${factTable([
         ...(vars.rollNumber ? [factRow('Your roll number', vars.rollNumber)] : []),
     ])}
     <p style="margin:16px 0 0;font-weight:600;color:#111827;">What happens next</p>
     ${steps([
         'Pick your exam schedule — places in each sitting are limited, and once confirmed a schedule cannot be changed.',
         'Take the free practice Innovation Olympiad exam. It runs in exactly the same environment as the real exam, so nothing on the day is a surprise.',
         'Check your device ahead of time: a laptop, desktop or tablet with a working webcam, on Chrome or Edge, and at least 2 Mbps of internet.',
         'On exam day, sit somewhere quiet and well-lit with a plain background, and keep a school or photo ID nearby.',
     ])}
     <p style="margin:16px 0 0;">Good luck — we're glad to have you competing.</p>`,
        { label: 'Go to your dashboard', url: `${vars.appUrl}/dashboard` },
    );
}

/**
 * Milestone 2 of 4 — the exam is really happening.
 *
 * Sent when a booking is confirmed. It is the closest thing to an admit card a
 * student will read on a phone, so the slot and the device checklist are in the
 * body rather than only behind a link.
 */
export function slotConfirmedEmail(vars: {
    firstName: string;
    examTitle: string;
    slotLabel?: string | null;
    startsAt: Date;
    endsAt: Date;
    rollNumber?: string | null;
    bookingId: string;
    appUrl: string;
}): RenderedEmail {
    const when = formatSlot(vars.startsAt, vars.endsAt);
    return build(
        `Your schedule for ${escapeHtml(vars.examTitle)} is confirmed`,
        'Your exam schedule is confirmed',
        `<p style="margin:0 0 12px;">Hi ${escapeHtml(vars.firstName)}, your sitting is booked. Please be signed in and ready 15 minutes before it starts.</p>
     ${factTable([
         factRow('Exam', vars.examTitle),
         ...(vars.rollNumber ? [factRow('Roll number', vars.rollNumber)] : []),
         factRow('When', when),
         ...(vars.slotLabel ? [factRow('Schedule', vars.slotLabel)] : []),
     ])}
     <p style="margin:16px 0 0;font-weight:600;color:#111827;">Before the day</p>
     ${steps([
         'Finish the practice Innovation Olympiad exam if you have not already — it is required before the real exam will start.',
         'Test your webcam and microphone on the device you will actually use.',
         'Use Google Chrome or Microsoft Edge, updated to the latest version.',
         'Find a quiet, well-lit spot with a plain background behind you.',
     ])}
     <p style="margin:16px 0 0;color:#6b7280;font-size:14px;">This schedule is confirmed and cannot be changed from your account. If you genuinely cannot make it, contact support as early as possible.</p>`,
        { label: 'View your admit card', url: `${vars.appUrl}/admit-card/${vars.bookingId}` },
    );
}

/**
 * Milestone 4 of 4 — the final report is out.
 *
 * Distinct from `examSubmittedEmail`, which only confirms receipt. This one is
 * sent when an admin publishes the final report, i.e. when the score stops being
 * provisional and the rank, analysis and answer key become visible.
 */
export function resultsPublishedEmail(vars: {
    firstName: string;
    examTitle: string;
    appUrl: string;
}): RenderedEmail {
    return build(
        `Your ${escapeHtml(vars.examTitle)} result is ready`,
        'Your final result is published',
        `<p style="margin:0 0 12px;">Hi ${escapeHtml(vars.firstName)}, marking and verification for <strong>${escapeHtml(vars.examTitle)}</strong> are complete.</p>
     <p style="margin:0 0 12px;">Your report now shows your final score, your rank and percentile, a breakdown across the five dimensions, and the answer key with explanations for every question.</p>
     <p style="margin:0;color:#6b7280;font-size:14px;">If something in your report looks wrong, you can raise it with us from the results page.</p>`,
        { label: 'See your full report', url: `${vars.appUrl}/results` },
    );
}

/** "Sat 12 Sep, 10:00 – 11:30" in IST, the timezone every recipient is in. */
function formatSlot(startsAt: Date, endsAt: Date): string {
    const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata' };
    const date = startsAt.toLocaleDateString('en-IN', {
        ...opts,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    });
    const time = (d: Date) =>
        d.toLocaleTimeString('en-IN', { ...opts, hour: '2-digit', minute: '2-digit', hour12: false });
    return `${date}, ${time(startsAt)} – ${time(endsAt)} IST`;
}

export function accessPassActivatedEmail(vars: {
    firstName: string;
    amountPaise: number;
    appUrl: string;
}): RenderedEmail {
    const rupees = (vars.amountPaise / 100).toLocaleString('en-IN');
    return build(
        'Your exam access is unlocked',
        'Payment confirmed',
        `<p style="margin:0 0 12px;">Hi ${escapeHtml(vars.firstName)}, we've received your payment of <strong>₹${rupees}</strong>.</p>
     <p style="margin:0 0 12px;">Every olympiad exam is now unlocked on your account for the current season. This is a one-time payment for the season, there is nothing further to pay.</p>
     <p style="margin:0;">Keep this email as your receipt.</p>`,
        { label: 'Browse exams', url: `${vars.appUrl}/exams` },
    );
}

export function examSubmittedEmail(vars: {
    firstName: string;
    examTitle: string;
    appUrl: string;
}): RenderedEmail {
    return build(
        `Your ${escapeHtml(vars.examTitle)} submission is in`,
        'Exam submitted',
        `<p style="margin:0 0 12px;">Hi ${escapeHtml(vars.firstName)}, your attempt at <strong>${escapeHtml(vars.examTitle)}</strong> has been submitted successfully.</p>
     <p style="margin:0;">Results are published once marking is complete — we'll let you know as soon as yours is available.</p>`,
        { label: 'View your results', url: `${vars.appUrl}/results` },
    );
}

/** Escape admin-typed text before it goes into an HTML email body. */
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * An admin-composed message to students, sent from the admin portal.
 *
 * The body is treated as plain text — escaped, with blank lines becoming
 * paragraphs and single newlines becoming line breaks — so an admin can never
 * (accidentally or otherwise) inject markup that breaks the mail or the
 * recipient's inbox. The subject doubles as the heading.
 */
export function adminBroadcastEmail(vars: { subject: string; message: string; appUrl: string }): RenderedEmail {
    const body = vars.message
        .split(/\n{2,}/)
        .map((block) => `<p style="margin:0 0 12px;">${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
        .join('');
    return build(vars.subject, vars.subject, body);
}

export function parentApprovalEmail(vars: {
    guardianName: string;
    studentName: string;
    approvalLink: string;
}): RenderedEmail {
    const body = `
        <p style="margin:0 0 12px;">Dear ${escapeHtml(vars.guardianName)},</p>
        <p style="margin:0 0 12px;">Your details and consent were submitted for <strong>${escapeHtml(vars.studentName)}</strong>'s participation in the <strong>Bharat Innovation Olympiad</strong>.</p>
        <p style="margin:0 0 12px;">Please review and confirm your parental approval by clicking the link below.</p>
    `;
    return build(
        'Parental Consent Confirmation — Bharat Innovation Olympiad',
        'Parental Approval Required',
        body,
        { label: 'Review & Confirm Approval', url: vars.approvalLink },
    );
}

// ── Partner lifecycle ────────────────────────────────────────────────────
//
// A partner's own login is email + password (chosen at apply time); the
// access token is a second, staff-issued path. Both are worth surfacing by
// mail, because today the only handover mechanism is a human copying a card.

export function partnerEmailVerificationEmail(vars: {
    contactPerson: string;
    orgName: string;
    verificationUrl: string;
}): RenderedEmail {
    return build(
        'Confirm your BIO partner application email',
        `Confirm your email, ${escapeHtml(vars.contactPerson)}`,
        `<p style="margin:0 0 12px;">Someone requested partner access for <strong>${escapeHtml(vars.orgName)}</strong> on the Bharat Innovation Olympiad.</p>
     <p style="margin:0 0 12px;">Confirm that you own this email address. After confirmation, the application will enter the BIO staff review queue.</p>
     <p style="margin:0;color:#6b7280;font-size:14px;">This link expires in 24 hours. If you did not make this request, you can ignore this email.</p>`,
        { label: 'Confirm email address', url: vars.verificationUrl },
    );
}

/**
 * The very first step of partner onboarding, before any org details exist —
 * so unlike `partnerEmailVerificationEmail` above, there is no contact name or
 * org name to greet the reader with yet. A 6-digit code entered on the
 * application page itself, not a link — the same OTP shape as student
 * registration.
 */
export function partnerStartVerificationEmail(vars: { code: string }): RenderedEmail {
    return build(
        'Your BIO partner application code',
        'Confirm your email',
        `<p style="margin:0 0 12px;">Someone started a Bharat Innovation Olympiad partner application with this email address.</p>
     <p style="margin:0 0 12px;">Enter this code on the application page to continue — you'll fill in your organisation's details right after.</p>
     ${factTable([factRow('Verification code', vars.code)])}
     <p style="margin:16px 0 0;color:#6b7280;font-size:14px;">This code expires in 10 minutes. If you did not make this request, you can ignore this email.</p>`,
    );
}

/** Forgot-password step 1: the 6-digit code to prove control of the address before a new password is accepted. */
export function partnerPasswordResetCodeEmail(vars: { code: string }): RenderedEmail {
    return build(
        'Reset your BIO partner password',
        'Reset your password',
        `<p style="margin:0 0 12px;">Someone asked to reset the password on this Bharat Innovation Olympiad partner account.</p>
     <p style="margin:0 0 12px;">Enter this code on the reset page to choose a new password.</p>
     ${factTable([factRow('Reset code', vars.code)])}
     <p style="margin:16px 0 0;color:#6b7280;font-size:14px;">This code expires in 10 minutes. If you did not make this request, your password is safe — you can ignore this email.</p>`,
    );
}

/** Confirms a password change actually happened, so an account holder who didn't request it finds out. */
export function partnerPasswordChangedEmail(vars: { contactPerson: string; orgName: string }): RenderedEmail {
    return build(
        'Your BIO partner password was changed',
        `Hi ${escapeHtml(vars.contactPerson)}`,
        `<p style="margin:0 0 12px;">The password on <strong>${escapeHtml(vars.orgName)}</strong>'s Bharat Innovation Olympiad partner account was just changed.</p>
     <p style="margin:0;color:#6b7280;font-size:14px;">If this wasn't you, contact BIO support right away.</p>`,
    );
}

export function partnerApplicationReceivedEmail(vars: {
    contactPerson: string;
    orgName: string;
}): RenderedEmail {
    return build(
        "We've received your partner application",
        `Thanks, ${escapeHtml(vars.contactPerson)}`,
        `<p style="margin:0 0 12px;">We've received <strong>${escapeHtml(vars.orgName)}</strong>'s application for Bharat Innovation Olympiad partner access.</p>
     <p style="margin:0;">Our team reviews every application by hand. We'll email you as soon as a decision is made — there's nothing further to do right now.</p>`,
    );
}

export function partnerApprovedEmail(vars: {
    contactPerson: string;
    orgName: string;
    accessToken: string;
    portalUrl: string;
}): RenderedEmail {
    return build(
        'Your BIO partner access is approved',
        `Welcome aboard, ${escapeHtml(vars.contactPerson)}`,
        `<p style="margin:0 0 12px;"><strong>${escapeHtml(vars.orgName)}</strong> is now an approved Bharat Innovation Olympiad partner.</p>
     <p style="margin:0 0 12px;">Sign in with the email and password you chose when applying, or with the access token below.</p>
     ${factTable([factRow('Access token', vars.accessToken)])}
     <p style="margin:16px 0 0;color:#6b7280;font-size:14px;">Keep this token private — anyone who has it can sign in as your organisation. Contact us if it ever needs to be rotated.</p>`,
        { label: 'Sign in to your dashboard', url: `${vars.portalUrl}/login` },
    );
}

export function partnerRejectedEmail(vars: {
    contactPerson: string;
    orgName: string;
    reason: string;
}): RenderedEmail {
    return build(
        'Update on your BIO partner application',
        `Hi ${escapeHtml(vars.contactPerson)}`,
        `<p style="margin:0 0 12px;">We've reviewed <strong>${escapeHtml(vars.orgName)}</strong>'s application for partner access, and are not able to approve it at this time.</p>
     ${factTable([factRow('Reason', vars.reason)])}
     <p style="margin:0;color:#6b7280;font-size:14px;">If you believe this is a mistake or your circumstances have changed, you're welcome to get in touch or reapply.</p>`,
    );
}

export function partnerRevokedEmail(vars: {
    contactPerson: string;
    orgName: string;
    reason: string;
}): RenderedEmail {
    return build(
        'Your BIO partner access has been revoked',
        `Hi ${escapeHtml(vars.contactPerson)}`,
        `<p style="margin:0 0 12px;"><strong>${escapeHtml(vars.orgName)}</strong>'s Bharat Innovation Olympiad partner portal access has been revoked, effective immediately.</p>
     ${factTable([factRow('Reason', vars.reason)])}
     <p style="margin:0;color:#6b7280;font-size:14px;">Your existing access token no longer works. Contact us if you have questions about this decision.</p>`,
    );
}

export function partnerAccessTokenRotatedEmail(vars: {
    contactPerson: string;
    orgName: string;
    accessToken: string;
    portalUrl: string;
}): RenderedEmail {
    return build(
        'Your BIO partner access token has been renewed',
        `Hi ${escapeHtml(vars.contactPerson)}`,
        `<p style="margin:0 0 12px;">A new access token has been issued for <strong>${escapeHtml(vars.orgName)}</strong>. Your previous token no longer works.</p>
     ${factTable([factRow('New access token', vars.accessToken)])}
     <p style="margin:16px 0 0;color:#6b7280;font-size:14px;">If you didn't request this, contact us right away.</p>`,
        { label: 'Sign in to your dashboard', url: `${vars.portalUrl}/login` },
    );
}

/** Re-sent on request, not framed as a fresh decision. */
export function partnerAccessResentEmail(vars: {
    contactPerson: string;
    orgName: string;
    accessToken: string;
    portalUrl: string;
}): RenderedEmail {
    return build(
        'Your BIO partner access details',
        `Hi ${escapeHtml(vars.contactPerson)}`,
        `<p style="margin:0;">As requested, here are ${escapeHtml(vars.orgName)}'s current Bharat Innovation Olympiad partner portal access details.</p>
     ${factTable([factRow('Access token', vars.accessToken)])}`,
        { label: 'Sign in to your dashboard', url: `${vars.portalUrl}/login` },
    );
}

/** Notifies the onboarding partner when a school it submitted is decided. Never sent for a self-applied school. */
export function partnerSchoolStatusChangedEmail(vars: {
    contactPerson: string;
    schoolName: string;
    status: 'APPROVED' | 'REJECTED';
    portalUrl: string;
}): RenderedEmail {
    const approved = vars.status === 'APPROVED';
    return build(
        approved ? `${escapeHtml(vars.schoolName)} is now approved` : `Update on ${escapeHtml(vars.schoolName)}'s application`,
        `Hi ${escapeHtml(vars.contactPerson)}`,
        approved
            ? `<p style="margin:0;">The school you onboarded, <strong>${escapeHtml(vars.schoolName)}</strong>, has been approved. Its coordinator has been sent their own access details, and it now appears in your Schools list.</p>`
            : `<p style="margin:0;">The school you onboarded, <strong>${escapeHtml(vars.schoolName)}</strong>, was not approved this time. You're welcome to onboard it again once its details are corrected.</p>`,
        approved ? { label: 'View your schools', url: `${vars.portalUrl}/dashboard/schools` } : undefined,
    );
}

/**
 * Confirms a bank-details submission — masked, never the account number or
 * PAN themselves, so a submission the partner didn't make gets noticed
 * without the email itself becoming something worth stealing.
 */
export function partnerBankDetailsSubmittedEmail(vars: {
    contactPerson: string;
    accountNumberLast4: string;
    portalUrl: string;
}): RenderedEmail {
    return build(
        'Your BIO payout bank details were updated',
        `Hi ${escapeHtml(vars.contactPerson)}`,
        `<p style="margin:0 0 12px;">Bank details for your payouts were just saved: account number <strong>${escapeHtml(vars.accountNumberLast4)}</strong>.</p>
     <p style="margin:0;color:#6b7280;font-size:14px;">If this wasn't you, contact BIO support right away — someone else may have access to your account.</p>`,
        { label: 'View payouts', url: `${vars.portalUrl}/dashboard/payouts` },
    );
}

// ── School lifecycle ─────────────────────────────────────────────────────
//
// Every approved school can sign in with either the access token or the
// coordinator email + password. Partner-submitted schools create that password
// when they confirm their email; self-applying coordinators choose one during
// activation. Both paths can also reset the password through the forgot flow.

export function schoolEmailVerificationEmail(vars: {
    coordinatorName: string;
    schoolName: string;
    verificationUrl: string;
}): RenderedEmail {
    return build(
        "Confirm your school's BIO application email and create your password",
        `Confirm your email, ${escapeHtml(vars.coordinatorName)}`,
        `<p style="margin:0 0 12px;">Someone requested school portal access for <strong>${escapeHtml(vars.schoolName)}</strong> on the Bharat Innovation Olympiad.</p>
     <p style="margin:0 0 12px;">Confirm that you own this coordinator email and choose a password. After that, the application will enter the BIO staff review queue.</p>
     <p style="margin:0;color:#6b7280;font-size:14px;">This link expires in 24 hours. If you did not make this request, you can ignore this email.</p>`,
        { label: 'Confirm email and create password', url: vars.verificationUrl },
    );
}

/**
 * The very first step of school activation, before any school or coordinator
 * details exist yet — so unlike `schoolEmailVerificationEmail` above, there is
 * no coordinator name or school name to greet the reader with. A 6-digit code
 * entered on the activation page itself, not a link — the same OTP shape as
 * student registration.
 */
export function schoolStartVerificationEmail(vars: { code: string }): RenderedEmail {
    return build(
        'Your BIO school activation code',
        'Confirm your email',
        `<p style="margin:0 0 12px;">Someone started a school activation on the Bharat Innovation Olympiad with this coordinator email address.</p>
     <p style="margin:0 0 12px;">Enter this code on the activation page to continue — you'll fill in your school's details right after.</p>
     ${factTable([factRow('Verification code', vars.code)])}
     <p style="margin:16px 0 0;color:#6b7280;font-size:14px;">This code expires in 10 minutes. If you did not make this request, you can ignore this email.</p>`,
    );
}

/** Forgot-password step 1: the 6-digit code to prove control of the address before a new password is accepted. */
export function schoolPasswordResetCodeEmail(vars: { code: string }): RenderedEmail {
    return build(
        'Reset your BIO school password',
        'Reset your password',
        `<p style="margin:0 0 12px;">Someone asked to reset the password on this Bharat Innovation Olympiad school coordinator account.</p>
     <p style="margin:0 0 12px;">Enter this code on the reset page to choose a new password.</p>
     ${factTable([factRow('Reset code', vars.code)])}
     <p style="margin:16px 0 0;color:#6b7280;font-size:14px;">This code expires in 10 minutes. If you did not make this request, your password is safe — you can ignore this email.</p>`,
    );
}

/** Confirms a password change actually happened, so an account holder who didn't request it finds out. */
export function schoolPasswordChangedEmail(vars: { coordinatorName: string; schoolName: string }): RenderedEmail {
    return build(
        'Your BIO school password was changed',
        `Hi ${escapeHtml(vars.coordinatorName)}`,
        `<p style="margin:0 0 12px;">The password on <strong>${escapeHtml(vars.schoolName)}</strong>'s Bharat Innovation Olympiad coordinator account was just changed.</p>
     <p style="margin:0;color:#6b7280;font-size:14px;">If this wasn't you, contact BIO support right away.</p>`,
    );
}

export function schoolApplicationReceivedEmail(vars: {
    coordinatorName: string;
    schoolName: string;
}): RenderedEmail {
    return build(
        "We've received your school's application",
        `Thanks, ${escapeHtml(vars.coordinatorName)}`,
        `<p style="margin:0 0 12px;">We've received <strong>${escapeHtml(vars.schoolName)}</strong>'s application for Bharat Innovation Olympiad school portal access.</p>
     <p style="margin:0;">Our team reviews every application by hand. We'll email you as soon as a decision is made, with your access token if approved.</p>`,
    );
}

export function schoolApprovedEmail(vars: {
    coordinatorName: string;
    schoolName: string;
    schoolCode: string | null;
    accessToken: string;
    portalUrl: string;
}): RenderedEmail {
    return build(
        'Your BIO school portal access is ready',
        `Welcome, ${escapeHtml(vars.coordinatorName)}`,
        `<p style="margin:0 0 12px;"><strong>${escapeHtml(vars.schoolName)}</strong> is now approved on the Bharat Innovation Olympiad. You can sign in with either your coordinator email + password or the access token below.</p>
     ${factTable([
         ...(vars.schoolCode ? [factRow('School code', vars.schoolCode)] : []),
         factRow('Access token', vars.accessToken),
     ])}
     <p style="margin:16px 0 0;font-weight:600;color:#111827;">What happens next</p>
     ${steps([
         'Sign in with your email and password or the access token above.',
         'Add your students to the school — they claim their own account by registering with the same email.',
         'Pick an exam slot; your whole school sits together in it.',
     ])}
     <p style="margin:16px 0 0;color:#6b7280;font-size:14px;">Keep this token private — anyone who has it can sign in as your school. Contact us if it ever needs to be rotated.</p>`,
        { label: 'Sign in to your dashboard', url: `${vars.portalUrl}/login` },
    );
}

export function schoolRejectedEmail(vars: {
    coordinatorName: string;
    schoolName: string;
    reason: string;
}): RenderedEmail {
    return build(
        "Update on your school's BIO application",
        `Hi ${escapeHtml(vars.coordinatorName)}`,
        `<p style="margin:0 0 12px;">We've reviewed <strong>${escapeHtml(vars.schoolName)}</strong>'s application for school portal access, and are not able to approve it at this time.</p>
     ${factTable([factRow('Reason', vars.reason)])}
     <p style="margin:0;color:#6b7280;font-size:14px;">If you believe this is a mistake or your circumstances have changed, you're welcome to get in touch or reapply.</p>`,
    );
}

export function schoolRevokedEmail(vars: {
    coordinatorName: string;
    schoolName: string;
    reason: string;
}): RenderedEmail {
    return build(
        'Your BIO school portal access has been revoked',
        `Hi ${escapeHtml(vars.coordinatorName)}`,
        `<p style="margin:0 0 12px;"><strong>${escapeHtml(vars.schoolName)}</strong>'s Bharat Innovation Olympiad school portal access has been revoked, effective immediately.</p>
     ${factTable([factRow('Reason', vars.reason)])}
     <p style="margin:0;color:#6b7280;font-size:14px;">Your existing access token no longer works, and coordinator sign-in has been disabled. Contact us if you have questions about this decision.</p>`,
    );
}

export function schoolAccessTokenRotatedEmail(vars: {
    coordinatorName: string;
    schoolName: string;
    accessToken: string;
    portalUrl: string;
}): RenderedEmail {
    return build(
        'Your BIO school access token has been renewed',
        `Hi ${escapeHtml(vars.coordinatorName)}`,
        `<p style="margin:0 0 12px;">A new access token has been issued for <strong>${escapeHtml(vars.schoolName)}</strong>. Your previous token no longer works.</p>
     ${factTable([factRow('New access token', vars.accessToken)])}
     <p style="margin:16px 0 0;color:#6b7280;font-size:14px;">If you didn't request this, contact us right away.</p>`,
        { label: 'Sign in to your dashboard', url: `${vars.portalUrl}/login` },
    );
}

/** Re-sent on request, not framed as a fresh decision. */
export function schoolAccessResentEmail(vars: {
    coordinatorName: string;
    schoolName: string;
    accessToken: string;
    portalUrl: string;
}): RenderedEmail {
    return build(
        'Your BIO school access details',
        `Hi ${escapeHtml(vars.coordinatorName)}`,
        `<p style="margin:0;">As requested, here are ${escapeHtml(vars.schoolName)}'s current Bharat Innovation Olympiad school portal access details.</p>
     ${factTable([factRow('Access token', vars.accessToken)])}`,
        { label: 'Sign in to your dashboard', url: `${vars.portalUrl}/login` },
    );
}
