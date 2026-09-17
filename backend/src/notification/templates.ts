import { formatIstOrdinalDate, formatIstTime } from './whatsapp.templates';

/**
 * Transactional email bodies — the Phase 1 approved copy.
 *
 * Kept as plain functions rather than DB rows: these are system-critical mails
 * whose wording ships with the code and is reviewed with it. Admin-editable
 * marketing templates are a separate concern (PRD-PORTAL-05).
 *
 * Student lifecycle copy follows the approved Phase 1 set (BIO-STU-001…009);
 * each function's doc-comment carries the approved body so a wording drift is
 * visible in review.
 */

const BRAND = 'Bharat Innovation Olympiad';
const PORTAL = 'https://www.innovationolympiad.in';
const SUPPORT_URL = `${PORTAL}/support/`;
const LOGIN_URL = `${PORTAL}/login/`;
const PROFILE_URL = `${PORTAL}/profile/`;
const DASHBOARD_URL = `${PORTAL}/dashboard/`;
const TERMS_URL = `${PORTAL}/terms/`;

/** Preparation links — env-overridable, defaulting to portal pages until the real URLs exist. */
const PREP_LINKS = {
    orientationVideo: process.env.BIO_ORIENTATION_VIDEO_URL ?? DASHBOARD_URL,
    preparatoryGuide: process.env.BIO_PREPARATORY_GUIDE_URL ?? DASHBOARD_URL,
    part1: process.env.BIO_PREP_PART1_URL ?? DASHBOARD_URL,
    part2: process.env.BIO_PREP_PART2_URL ?? DASHBOARD_URL,
    part3: process.env.BIO_PREP_PART3_URL ?? DASHBOARD_URL,
    part4: process.env.BIO_PREP_PART4_URL ?? DASHBOARD_URL,
    part5: process.env.BIO_PREP_PART5_URL ?? DASHBOARD_URL,
};

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

/** The approved sign-off shared by every Phase 1 student mail. */
function signoff(extra = ''): string {
    return `${extra}<p style="margin:24px 0 0;">Warm regards,<br/>
Bharat Innovation Olympiad - Become future ready.<br/>
Lemon Ideas</p>`;
}

/** The Innopreneurs Next Gen footer block carried by the approved student mails. */
function innopreneursBlock(): string {
    return `<div style="margin:28px 0 0;padding-top:20px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.6;color:#6b7280;">
  <p style="margin:0 0 8px;"><strong>Innopreneurs Next Gen Idea &amp; Innovation Contest.</strong> — a platform where young minds explore innovation, entrepreneurship and future-ready ideas.</p>
  <p style="margin:0 0 8px;">👉 Register: <a href="https://www.innopreneurs.in/juniors" style="color:#2563eb;">https://www.innopreneurs.in/juniors</a></p>
  <p style="margin:0 0 8px;">Join Innopreneurs Next Gen Community – Junior Playground:<br/>
  <a href="https://chat.whatsapp.com/KS12TeM47vv3gyoerqW6HU?s=cl&amp;p=a&amp;ilr=0" style="color:#2563eb;">https://chat.whatsapp.com/KS12TeM47vv3gyoerqW6HU</a></p>
  <p style="margin:0;">Read &amp; Explore:
    <a href="https://www.innopreneurs.in/post/young-minds-big-ideas" style="color:#2563eb;">Young Minds, Big Ideas</a> •
    <a href="https://www.innopreneurs.in/post/empowering-juniors-students-to-shape-the-future-through-innovation" style="color:#2563eb;">Innovation for Juniors</a> •
    <a href="https://www.innopreneurs.in/post/teen-entrepreneurs" style="color:#2563eb;">Teen Entrepreneurs</a></p>
</div>`;
}

/** `Saturday` — the exam_day column of the approved schedule blocks. */
function istWeekday(when: Date): string {
    return when.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long' });
}

/**
 * BIO-STU-003 — Registration Confirmation (Part 1).
 *
 * Fires the moment payment confirms and the roll number exists. Carries the
 * registration details, the exam schedule when a sitting is already confirmed
 * ("To be announced" when it is not — autoscheduling can lag payment by a
 * sweep), and the verification checklist so a student knows what still blocks
 * eligibility.
 */
export function welcomeEmail(vars: {
    firstName: string;
    appUrl: string;
    rollNumber?: string | null;
    grade?: number | null;
    schoolName?: string | null;
    examStartsAt?: Date | null;
    faceScanDone: boolean;
    idDocumentDone: boolean;
}): RenderedEmail {
    const exam = vars.examStartsAt;
    return build(
        '🎉 Welcome to Bharat Innovation Olympiad — Your registration is complete!',
        `Dear ${escapeHtml(vars.firstName)},`,
        `<p style="margin:0 0 12px;">🎉 Welcome to the Bharat Innovation Olympiad!</p>
     <p style="margin:0 0 12px;">Your payment has been successfully processed!</p>
     <p style="margin:0 0 12px;">Your registration is now successfully completed. You are officially part of Bharat Innovation Olympiad - Become future ready. 🚀 Please refer to accepted <a href="${TERMS_URL}" style="color:#2563eb;">Terms and conditions</a> for the program.</p>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">📌 Your Registration Details</p>
     ${factTable([
         ...(vars.rollNumber ? [factRow('Roll Number', vars.rollNumber)] : []),
         ...(vars.grade ? [factRow('Grade', `Class ${vars.grade}`)] : []),
         ...(vars.schoolName ? [factRow('School', vars.schoolName)] : []),
     ])}
     <p style="margin:16px 0 12px;">Please keep your roll number safely. You may need it for future Bharat Innovation Olympiad examination-related communication.</p>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">📅 Your Examination Schedule</p>
     ${exam
         ? `<p style="margin:0 0 8px;">Your examination has been scheduled as follows:</p>${factTable([
               factRow('Date', formatIstOrdinalDate(exam)),
               factRow('Day', istWeekday(exam)),
               factRow('Time', `${formatIstTime(exam)} IST`),
           ])}<p style="margin:8px 0 0;">Please save these details and make sure you are available at the scheduled time.</p>`
         : '<p style="margin:0;">Your examination schedule will be confirmed shortly — watch this space and your dashboard.</p>'}
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">🔐 Complete Your Verification</p>
     <p style="margin:0 0 8px;">Before appearing for the examination, please make sure your required verification steps are complete.</p>
     ${factTable([
         factRow('Face Scan', vars.faceScanDone ? 'Completed' : 'Pending'),
         factRow('ID Document Upload', vars.idDocumentDone ? 'Completed' : 'Pending'),
     ])}
     <p style="margin:8px 0 0;">If any step is pending, please complete it here: <a href="${PROFILE_URL}" style="color:#2563eb;">${PROFILE_URL}</a></p>
     <p style="margin:8px 0 0;color:#6b7280;font-size:14px;">Your face scan will be used for identity verification during the examination and during the result verification process.</p>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">💻 Prerequisites for the Online Bharat Innovation Olympiad Exam</p>
     <p style="margin:0 0 8px;">The Bharat Innovation Olympiad examination will be conducted online. Please make sure that:</p>
     <ul style="margin:0 0 8px;padding-left:20px;font-size:15px;line-height:1.7;color:#374151;">
       <li>You have a laptop or desktop computer.</li>
       <li>Your camera is working properly.</li>
       <li>Your microphone/audio access is available, if applicable.</li>
       <li>Your system has Windows 10+ or macOS 10.14+.</li>
       <li>You have an internet connection with a minimum speed of 2 Mbps.</li>
       <li>You have completed the practice test.</li>
       <li>You have gone through the preparation resources.</li>
     </ul>
     <p style="margin:8px 0 0;color:#b45309;">⚠️ The examination cannot be taken on a mobile phone or tablet.</p>
     <p style="margin:8px 0 0;">Please check your device well before the examination.</p>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">❓ Need Help?</p>
     <p style="margin:0 0 12px;">If you face any issue with your registration, verification or examination schedule, please raise a support request: <a href="${SUPPORT_URL}" style="color:#2563eb;">${SUPPORT_URL}</a></p>
     <p style="margin:0;">We're looking forward to seeing you at the Bharat Innovation Olympiad!</p>
     <p style="margin:8px 0 0;">All the best! 🚀</p>
     ${signoff()}
     ${innopreneursBlock()}`,
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
        // Query-param route: the student portal is a static export and cannot
        // carry a dynamic /admit-card/<id> segment. See frontend/next.config.ts.
        { label: 'View your admit card', url: `${vars.appUrl}/admit-card/?bookingId=${encodeURIComponent(vars.bookingId)}` },
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

/**
 * BIO-STU-002 — Payment Not Completed.
 *
 * Fires an hour after an OTP-verified registration with no payment (the
 * payment-pending sweep), and points at the login portal for a retry plus the
 * support path for a deducted amount.
 */
export function paymentPendingEmail(vars: { firstName: string }): RenderedEmail {
    return build(
        'Your Bharat Innovation Olympiad registration is almost complete!',
        `Dear ${escapeHtml(vars.firstName)},`,
        `<p style="margin:0 0 12px;">You're almost there! 🚀</p>
     <p style="margin:0 0 12px;">We noticed that you recently attempted to make the payment for your Bharat Innovation Olympiad registration, but the payment was not completed successfully.</p>
     <p style="margin:0 0 12px;">Your registration will be complete once the payment is successfully processed.</p>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">Payment Status</p>
     ${factTable([factRow('Status', 'Payment pending')])}
     <p style="margin:16px 0 12px;">If the payment failed, you can return to the registration process and try again: <a href="${LOGIN_URL}" style="color:#2563eb;">${LOGIN_URL}</a></p>
     <p style="margin:0 0 12px;">If the amount has already been deducted from your account, please do not make another payment immediately. Contact our support team so that the transaction can be verified.</p>
     <p style="margin:0 0 12px;">For payment-related assistance, please raise a support request: <a href="${SUPPORT_URL}" style="color:#2563eb;">${SUPPORT_URL}</a></p>
     <p style="margin:0 0 12px;">WhatsApp Support: +918421411142</p>
     <p style="margin:0;">We'll be happy to help you complete your registration!</p>
     ${signoff()}`,
    );
}

/**
 * BIO-STU-004 — Registration Confirmation Part 2 (preparation resources).
 *
 * Sent T+1 day after registration completes — the orientation video, the
 * preparatory guide, the five-part preparation series, and the practice test.
 */
export function prepResourcesEmail(vars: { firstName: string }): RenderedEmail {
    return build(
        'Welcome to Bharat Innovation Olympiad — Get Ready for the Bharat Innovation Olympiad!',
        `Dear ${escapeHtml(vars.firstName)},`,
        `<p style="margin:0 0 12px;">🚀 Your Bharat Innovation Olympiad journey has begun!</p>
     <p style="margin:0 0 12px;">Now it's time to prepare, explore and get ready for the Olympiad. The preparation resources have been designed to help you understand the key areas covered in the program and build your future-ready skills.</p>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">📚 Get Ready for Your Olympiad!</p>
     <p style="margin:0 0 12px;">We recommend going through all the resources before your examination.</p>
     ${factTable([
         factRow('🎥 Orientation Video', PREP_LINKS.orientationVideo),
         factRow('📖 Preparatory Guide', PREP_LINKS.preparatoryGuide),
         factRow('💡 Part 1 — Problem Solving & Innovation', PREP_LINKS.part1),
         factRow('🚀 Part 2 — Entrepreneurship Mindset', PREP_LINKS.part2),
         factRow('🌐 Part 3 — Emerging Technologies & Digital Readiness', PREP_LINKS.part3),
         factRow('🌍 Part 4 — Future Readiness & Global Awareness', PREP_LINKS.part4),
         factRow('💰 Part 5 — Financial Readiness', PREP_LINKS.part5),
     ])}
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">📝 Try the Practice Test</p>
     <p style="margin:0 0 12px;">Before the actual examination, we strongly recommend attempting the practice test. It will help you become familiar with the online examination environment.</p>
     <p style="margin:0 0 12px;">Practice Test: <a href="${DASHBOARD_URL}" style="color:#2563eb;">${DASHBOARD_URL}</a></p>
     <p style="margin:0 0 12px;">✨ Learn. Practice. Innovate. Become Future Ready.</p>
     <p style="margin:0;">We wish you the very best for your preparation and look forward to seeing you at the Bharat Innovation Olympiad! 🚀</p>
     ${signoff()}
     ${innopreneursBlock()}`,
    );
}

/**
 * BIO-STU-005 — Parent Consent Received (to the parent's address).
 *
 * Sent T+2 days after the consent was recorded. Restates what the consent
 * covers under the DPDP Act 2023 and how to withdraw it.
 */
export function parentConsentReceivedEmail(vars: {
    parentName: string;
    studentName: string;
    rollNumber?: string | null;
    grade?: number | null;
    schoolName?: string | null;
}): RenderedEmail {
    return build(
        '🎉 Parent consent received — Bharat Innovation Olympiad',
        `Dear ${escapeHtml(vars.parentName)},`,
        `<p style="margin:0 0 12px;">Thank you for providing consent for ${escapeHtml(vars.studentName)} to participate in the Bharat Innovation Olympiad - Become future ready. 🚀</p>
     <p style="margin:0 0 12px;">We have successfully received and recorded the required consent and information. Please refer to accepted <a href="${TERMS_URL}" style="color:#2563eb;">Terms and conditions</a> for the program.</p>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">📌 Participant Details</p>
     ${factTable([
         factRow('Student', vars.studentName),
         ...(vars.rollNumber ? [factRow('Roll Number', vars.rollNumber)] : []),
         ...(vars.grade ? [factRow('Grade', `Class ${vars.grade}`)] : []),
         ...(vars.schoolName ? [factRow('School', vars.schoolName)] : []),
     ])}
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">🔐 Consent &amp; Personal Data</p>
     <p style="margin:0 0 12px;">Every participant in the Bharat Innovation Olympiad is a minor or may be a minor. In accordance with the Digital Personal Data Protection Act, 2023, we obtain verifiable consent from a parent or legal guardian before a participant sits for the examination.</p>
     <p style="margin:0 0 8px;">The consent provided by you covers:</p>
     <ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.7;color:#374151;">
       <li>${escapeHtml(vars.studentName)}'s participation in the Bharat Innovation Olympiad.</li>
       <li>The collection and processing of personal data required for participation, examination administration, verification and related purposes explained during the consent process.</li>
       <li>The use of the student's face scan for identity verification during the examination and the result verification process.</li>
     </ul>
     <p style="margin:0 0 12px;">The information provided during the consent process will be handled and processed for the purposes communicated during consent and as required to administer and verify the student's participation in the Olympiad.</p>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">↩️ Withdrawal of Consent</p>
     <p style="margin:0 0 12px;">A parent or legal guardian may withdraw consent at any time by contacting us through the support channel below.<br/><a href="${SUPPORT_URL}" style="color:#2563eb;">${SUPPORT_URL}</a></p>
     <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">Please note that if consent is withdrawn after the examination has already been taken, such withdrawal does not require us to delete examination results that have already been published. However, no further processing based on that consent will take place, subject to any processing that may otherwise be required or permitted by applicable law.</p>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">❓ Need Help or Have a Grievance?</p>
     <p style="margin:0 0 12px;">If you have any questions, concerns or grievances regarding the consent, examination schedule, registration or participation, please raise a support request: <a href="${SUPPORT_URL}" style="color:#2563eb;">${SUPPORT_URL}</a></p>
     <p style="margin:0;">Thank you for your trust and support.</p>
     ${signoff()}
     ${innopreneursBlock()}`,
    );
}

/**
 * BIO-STU-006 — Face Scan / ID Upload Pending.
 *
 * The T-3 nudge — 72 hours before a confirmed exam, only while a required
 * verification step is still incomplete.
 */
export function verificationPendingEmail(vars: {
    firstName: string;
    faceScanDone: boolean;
    idDocumentDone: boolean;
}): RenderedEmail {
    return build(
        'Action required: Complete your Bharat Innovation Olympiad verification 🔐',
        `Dear ${escapeHtml(vars.firstName)},`,
        `<p style="margin:0 0 12px;">You're one step closer to being ready for the Bharat Innovation Olympiad! 🚀</p>
     <p style="margin:0 0 12px;">Our records show that one or more required verification steps are still pending.</p>
     ${factTable([
         factRow('Face Scan', vars.faceScanDone ? 'Completed' : 'Pending'),
         factRow('ID Document Upload', vars.idDocumentDone ? 'Completed' : 'Pending'),
     ])}
     <p style="margin:8px 0 12px;">To be eligible for your Bharat Innovation Olympiad onboarding, please complete the pending step here: <a href="${PROFILE_URL}" style="color:#2563eb;">${PROFILE_URL}</a></p>
     <p style="margin:0 0 12px;font-weight:600;color:#111827;">Why are the face scan &amp; ID required?</p>
     <p style="margin:0 0 12px;">Your face scan and uploaded ID will be used to verify your identity during the examination and during the result verification process.</p>
     <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">If you have already completed the steps, please allow some time for your status to be updated.</p>
     <p style="margin:0;">For any assistance, please raise a support request: <a href="${SUPPORT_URL}" style="color:#2563eb;">${SUPPORT_URL}</a></p>
     ${signoff()}`,
    );
}

/**
 * BIO-STU-007 — Face Scan / ID Upload Completed.
 *
 * Fires the moment student identification goes complete (consent + ID +
 * face scan recorded).
 */
export function verificationCompleteEmail(vars: {
    firstName: string;
    rollNumber?: string | null;
}): RenderedEmail {
    return build(
        '✅ Your Bharat Innovation Olympiad verification is complete!',
        `Dear ${escapeHtml(vars.firstName)},`,
        `<p style="margin:0 0 12px;">Great news! 🎉</p>
     <p style="margin:0 0 12px;">Your required face scan and ID document verification for the Bharat Innovation Olympiad have been successfully completed.</p>
     ${factTable([...(vars.rollNumber ? [factRow('Roll Number', vars.rollNumber)] : [])])}
     <p style="margin:8px 0 12px;">Please note that your face scan will be used to verify your identity during the examination and during the result verification process.</p>
     <p style="margin:0 0 12px;">You're now one step closer to the big day! 🚀</p>
     <p style="margin:0 0 12px;">Continue preparing through the resources available on the Bharat Innovation Olympiad portal.</p>
     <p style="margin:0 0 12px;">📚 Your preparation resources, orientation video, preparatory guide and practice test are available on the portal.</p>
     <p style="margin:0 0 8px;">💻 Important: The exam must be taken on a laptop/desktop with a working camera and good internet connection.</p>
     <p style="margin:0 0 12px;color:#b45309;">Please Note: Mobile phones and tablets cannot be used.</p>
     <p style="margin:0;">If you need any assistance, please contact: <a href="${SUPPORT_URL}" style="color:#2563eb;">${SUPPORT_URL}</a></p>
     ${signoff()}
     ${innopreneursBlock()}`,
    );
}

/**
 * BIO-STU-008 — T-1 Exam Reminder.
 *
 * The email twin of the reminder SMS/WhatsApp — fires for every confirmed
 * booking whose exam falls on tomorrow's IST date.
 */
export function examReminderEmail(vars: {
    firstName: string;
    examStartsAt: Date;
}): RenderedEmail {
    return build(
        '⏰ Reminder for Your Bharat Innovation Olympiad exam !',
        `Dear ${escapeHtml(vars.firstName)},`,
        `<p style="margin:0 0 12px;">The big day is almost here! 🚀</p>
     <p style="margin:0 0 8px;">This is a reminder that your Bharat Innovation Olympiad examination is scheduled for</p>
     ${factTable([
         factRow('Date', formatIstOrdinalDate(vars.examStartsAt)),
         factRow('Day', istWeekday(vars.examStartsAt)),
         factRow('Time', `${formatIstTime(vars.examStartsAt)} IST`),
     ])}
     <p style="margin:8px 0 12px;">Please make sure you are ready and available before your scheduled examination time.</p>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">📚 Final Preparation Checklist</p>
     <p style="margin:0 0 4px;">Before the exam, please make sure you have:</p>
     <ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.7;color:#374151;">
       <li>✅ Attempted the practice test</li>
       <li>✅ Watched the training videos</li>
       <li>✅ Watched the orientation video</li>
       <li>✅ Read the preparatory guide</li>
       <li>✅ Checked your camera</li>
       <li>✅ Checked your internet connection</li>
       <li>✅ Kept your laptop/desktop ready</li>
     </ul>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">💻 One Important Reminder</p>
     <p style="margin:0 0 8px;">The Bharat Innovation Olympiad examination must be taken on a laptop or desktop computer.</p>
     <p style="margin:0 0 12px;color:#b45309;">⚠️ Mobile phones and tablets cannot be used for the examination.</p>
     <p style="margin:0 0 12px;">If you face any issue before the examination, please contact: <a href="${SUPPORT_URL}" style="color:#2563eb;">${SUPPORT_URL}</a></p>
     <p style="margin:0 0 4px;">You've prepared for this — now it's time to show what you know! 🌟</p>
     <p style="margin:0;">All the very best!</p>
     ${signoff()}
     ${innopreneursBlock()}`,
    );
}

/**
 * BIO-STU-009 — Examination Submitted.
 *
 * Replaces the old "submission is in" mail — now carries the roll number and
 * the submission timestamp in IST, plus the Innopreneurs next-step.
 */
export function examSubmittedEmail(vars: {
    firstName: string;
    examTitle: string;
    appUrl: string;
    rollNumber?: string | null;
    submittedAt?: Date;
}): RenderedEmail {
    const submittedAt = vars.submittedAt ?? new Date();
    return build(
        '🎉 You did it! Your Bharat Innovation Olympiad exam has been submitted',
        `Dear ${escapeHtml(vars.firstName)},`,
        `<p style="margin:0 0 12px;">🎉 Congratulations on completing your Bharat Innovation Olympiad examination!</p>
     <p style="margin:0 0 12px;">Your examination attempt has been successfully submitted.</p>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">📌 Submission Details</p>
     ${factTable([
         ...(vars.rollNumber ? [factRow('Roll Number', vars.rollNumber)] : []),
         factRow('Submission Date', formatIstOrdinalDate(submittedAt)),
         factRow('Submission Time', `${formatIstTime(submittedAt)} IST`),
     ])}
     <p style="margin:8px 0 12px;">You've taken an important step towards becoming a future-ready innovator. 🚀</p>
     <p style="margin:0 0 12px;">Your submission will now go through the applicable evaluation and verification process. Please refer to accepted <a href="${TERMS_URL}" style="color:#2563eb;">Terms and conditions</a> for the program.</p>
     <p style="margin:0 0 8px;font-weight:600;color:#111827;">What happens next?</p>
     <p style="margin:0 0 12px;">Your official result will be communicated separately after the evaluation and verification process is completed.</p>
     <p style="margin:0 0 8px;">But your journey doesn't have to stop here!</p>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">🚀 Continue Your Innovation Journey</p>
     <p style="margin:0 0 12px;">Register at Innopreneurs-Next Gen and start your journey with Innovation presentation contest &amp; challenge. Completing the Bharat Innovation Olympiad is only one step in your innovation journey — you can continue exploring ideas, innovation and entrepreneurship through the Innopreneurs Next Gen Idea &amp; Innovation Contest.</p>
     <p style="margin:0 0 12px;">👉 Register: <a href="https://www.innopreneurs.in/juniors" style="color:#2563eb;">https://www.innopreneurs.in/juniors</a></p>
     <p style="margin:0;">Keep exploring. Keep learning. Keep innovating. 🚀</p>
     ${signoff()}
     ${innopreneursBlock()}`,
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
        'Confirm your Innovation Olympiad partner application email',
        `Confirm your email, ${escapeHtml(vars.contactPerson)}`,
        `<p style="margin:0 0 12px;">Someone requested partner access for <strong>${escapeHtml(vars.orgName)}</strong> on the Bharat Innovation Olympiad.</p>
     <p style="margin:0 0 12px;">Confirm that you own this email address. After confirmation, the application will enter the Innovation Olympiad staff review queue.</p>
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
/**
 * The student's sign-in / registration code.
 *
 * `name` is deliberately not part of what a code is valid for, so the same
 * code works whether a student registers or signs in instead — only the
 * greeting changes, never the code's validity.
 *
 * `name` is `null` only when none is knowable yet: a sign-in code requested
 * for an email with no account. That must not be worded as if the address
 * were rejected — a code-entry box that also announces "we don't recognise
 * you" is an account-enumeration oracle — so the fallback line addresses the
 * address itself rather than a person, without claiming "someone" did it.
 */
/**
 * BIO-STU-001 — Email Verification OTP.
 *
 * `name` is deliberately not part of what a code is valid for, so the same
 * code works whether a student registers or signs in instead — only the
 * greeting changes, never the code's validity. The copy stays generic on
 * purpose: naming a person on a sign-in code would be an account-enumeration
 * oracle.
 */
export function studentEmailOtpEmail(vars: {
    code: string;
    name: string | null;
    expiresInMinutes: number;
}): RenderedEmail {
    return build(
        'Verify your email for Bharat Innovation Olympiad 🔐',
        'Welcome to Bharat Innovation Olympiad - Become future ready. 🚀',
        `<p style="margin:0 0 12px;">Your Verification Code is :</p>
     <p style="margin:0 0 12px;font-size:28px;font-weight:700;letter-spacing:.35em;color:#111827;">${escapeHtml(vars.code)}</p>
     <p style="margin:0 0 12px;">This code is valid for ${vars.expiresInMinutes} minutes.</p>
     <p style="margin:0;color:#6b7280;font-size:14px;">For your security, please do not share this code with anyone.</p>
     ${signoff()}`,
    );
}

export function partnerStartVerificationEmail(vars: { code: string }): RenderedEmail {
    return build(
        'Your Innovation Olympiad partner application code',
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
        'Reset your Innovation Olympiad partner password',
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
        'Your Innovation Olympiad partner password was changed',
        `Hi ${escapeHtml(vars.contactPerson)}`,
        `<p style="margin:0 0 12px;">The password on <strong>${escapeHtml(vars.orgName)}</strong>'s Bharat Innovation Olympiad partner account was just changed.</p>
     <p style="margin:0;color:#6b7280;font-size:14px;">If this wasn't you, contact Innovation Olympiad support right away.</p>`,
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
        'Your Innovation Olympiad partner access is approved',
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
        'Update on your Innovation Olympiad partner application',
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
        'Your Innovation Olympiad partner access has been revoked',
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
        'Your Innovation Olympiad partner access token has been renewed',
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
        'Your Innovation Olympiad partner access details',
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
        'Your Innovation Olympiad payout bank details were updated',
        `Hi ${escapeHtml(vars.contactPerson)}`,
        `<p style="margin:0 0 12px;">Bank details for your payouts were just saved: account number <strong>${escapeHtml(vars.accountNumberLast4)}</strong>.</p>
     <p style="margin:0;color:#6b7280;font-size:14px;">If this wasn't you, contact Innovation Olympiad support right away — someone else may have access to your account.</p>`,
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
        "Confirm your school's Innovation Olympiad application email and create your password",
        `Confirm your email, ${escapeHtml(vars.coordinatorName)}`,
        `<p style="margin:0 0 12px;">Someone requested school portal access for <strong>${escapeHtml(vars.schoolName)}</strong> on the Bharat Innovation Olympiad.</p>
     <p style="margin:0 0 12px;">Confirm that you own this coordinator email and choose a password. After that, the application will enter the Innovation Olympiad staff review queue.</p>
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
        'Your Innovation Olympiad school activation code',
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
        'Reset your Innovation Olympiad school password',
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
        'Your Innovation Olympiad school password was changed',
        `Hi ${escapeHtml(vars.coordinatorName)}`,
        `<p style="margin:0 0 12px;">The password on <strong>${escapeHtml(vars.schoolName)}</strong>'s Bharat Innovation Olympiad coordinator account was just changed.</p>
     <p style="margin:0;color:#6b7280;font-size:14px;">If this wasn't you, contact Innovation Olympiad support right away.</p>`,
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

/**
 * School onboarding — the approved Phase 1 copy.
 *
 * `password` carries the access token: it is a working sign-in credential, and
 * the coordinator's chosen password (when one exists) is never recoverable
 * anyway — bcrypt hashes cannot be mailed back.
 */
export function schoolApprovedEmail(vars: {
    coordinatorName: string;
    schoolName: string;
    schoolCode: string | null;
    accessToken: string;
    portalUrl: string;
    schoolBoard?: string | null;
    schoolPincode?: string | null;
    contactNumber?: string | null;
    coordinatorEmail?: string | null;
}): RenderedEmail {
    const referralUrl = vars.schoolCode
        ? `https://www.innovationolympiad.in/register?school=${encodeURIComponent(vars.schoolCode)}`
        : null;
    return build(
        '🎉 Welcome to Bharat Innovation Olympiad — School Onboarding Confirmed!',
        `Dear ${escapeHtml(vars.coordinatorName)},`,
        `<p style="margin:0 0 12px;">We are delighted to confirm the successful onboarding of <strong>${escapeHtml(vars.schoolName)}</strong> for the Bharat Innovation Olympiad! 🎉</p>
     <p style="margin:0 0 12px;">Thank you for taking the initiative to be a part of this journey. We look forward to working together to create an engaging and impactful experience for your students.</p>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">🏫 School Onboarding Details</p>
     ${factTable([
         ...(vars.schoolCode ? [factRow('School Code', vars.schoolCode)] : []),
         factRow('School Name', vars.schoolName),
         ...(vars.schoolBoard ? [factRow('School Board', vars.schoolBoard)] : []),
         ...(vars.schoolPincode ? [factRow('School Pincode', vars.schoolPincode)] : []),
         factRow('School Coordinator/Trainer', vars.coordinatorName),
         ...(vars.contactNumber ? [factRow('Contact Number', vars.contactNumber)] : []),
         ...(vars.coordinatorEmail ? [factRow('Email ID/Log in', vars.coordinatorEmail)] : []),
         factRow('Password', vars.accessToken),
     ])}
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">🚀 Access Your Dashboard</p>
     <p style="margin:0 0 12px;">You can access your school dashboard using the link below:<br/><a href="${vars.portalUrl}/login" style="color:#2563eb;">${vars.portalUrl}/login</a></p>
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">📌 Next Steps</p>
     ${steps([
         referralUrl
             ? `Share the Student Referral Link — after logging in to your dashboard you can forward this link to students so they can register and participate in the program: <a href="${referralUrl}" style="color:#2563eb;">${referralUrl}</a>`
             : 'Share the Student Referral Link — after logging in to your dashboard you can access and forward your referral link to students so they can register and participate in the program.',
         'Share the WhatsApp Message — we will share a ready-to-forward WhatsApp message on your registered phone number. You can forward this message to the relevant students/parents to help them with the registration process.',
         'Keep Checking for Updates — please regularly check your email and registered WhatsApp number for important updates, reminders, and further instructions from our team.',
     ])}
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">🌟 What Do Students Gain?</p>
     <p style="margin:0 0 8px;">BIO goes beyond an examination — helping students learn, participate, achieve and grow.</p>
     ${steps([
         '<strong>E-Certificates 🏅</strong> — recognition for examination and training participation.',
         '<strong>Medals for Top 3 🥇</strong> — top 3 students from each grade of participating schools can earn medals, subject to 15+ registrations per grade.',
         '<strong>Direct Entry to Top 100 🚀</strong> — top 2% of Olympiad students can advance directly to the Innopreneurs Next Gen Top 100.',
         '<strong>₹5 Lakh Awards 🏆</strong> — Innopreneurs Next Gen winners can receive awards and benefits from a ₹5 lakh total award pool.',
     ])}
     <p style="margin:16px 0 4px;font-weight:600;color:#111827;">📌 Important</p>
     <p style="margin:0 0 12px;">Please ensure that all the information submitted during onboarding is accurate. If any details need to be updated or corrected, kindly get in touch with our team.</p>
     <p style="margin:0;">We are excited to have ${escapeHtml(vars.schoolName)} on board and look forward to building an innovative and enriching journey together! 🌟</p>
     <p style="margin:24px 0 0;">Warm regards,<br/>Team Lemon Ideas</p>`,
    );
}

export function schoolRejectedEmail(vars: {
    coordinatorName: string;
    schoolName: string;
    reason: string;
}): RenderedEmail {
    return build(
        "Update on your school's Innovation Olympiad application",
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
        'Your Innovation Olympiad school portal access has been revoked',
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
        'Your Innovation Olympiad school access token has been renewed',
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
        'Your Innovation Olympiad school access details',
        `Hi ${escapeHtml(vars.coordinatorName)}`,
        `<p style="margin:0;">As requested, here are ${escapeHtml(vars.schoolName)}'s current Bharat Innovation Olympiad school portal access details.</p>
     ${factTable([factRow('Access token', vars.accessToken)])}`,
        { label: 'Sign in to your dashboard', url: `${vars.portalUrl}/login` },
    );
}
