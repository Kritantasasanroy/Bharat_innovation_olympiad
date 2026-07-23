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
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111827;">${heading}</h1>
    <div style="font-size:15px;line-height:1.6;color:#374151;">${bodyHtml}</div>
    ${cta
            ? `<p style="margin:28px 0 0;">
             <a href="${cta.url}" style="display:inline-block;background:#ffcb05;color:#111827;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">${cta.label}</a>
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

export function welcomeEmail(vars: { firstName: string; appUrl: string }): RenderedEmail {
    return build(
        `Welcome to ${BRAND}`,
        `Welcome, ${vars.firstName}!`,
        `<p style="margin:0 0 12px;">Your account is ready. You can complete your profile, book an exam slot and take the free practice paper right away.</p>
     <p style="margin:0;">Good luck — we're glad to have you competing.</p>`,
        { label: 'Go to your dashboard', url: `${vars.appUrl}/dashboard` },
    );
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
        `<p style="margin:0 0 12px;">Hi ${vars.firstName}, we've received your payment of <strong>₹${rupees}</strong>.</p>
     <p style="margin:0 0 12px;">Every olympiad exam is now unlocked on your account. This is a one-time payment — there is nothing further to pay.</p>
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
        `Your ${vars.examTitle} submission is in`,
        'Exam submitted',
        `<p style="margin:0 0 12px;">Hi ${vars.firstName}, your attempt at <strong>${vars.examTitle}</strong> has been submitted successfully.</p>
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
        .replace(/"/g, '&quot;');
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
