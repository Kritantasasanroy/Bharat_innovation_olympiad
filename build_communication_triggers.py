from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = Workbook()

# Remove default sheet
wb.remove(wb.active)

# Styles
header_font = Font(bold=True, color="FFFFFF")
header_fill = PatternFill("solid", fgColor="2563EB")
thin_border = Border(
    left=Side(style="thin"), right=Side(style="thin"),
    top=Side(style="thin"), bottom=Side(style="thin"),
)
wrap_alignment = Alignment(wrap_text=True, vertical="top")


def add_headers(ws, headers):
    ws.append(headers)
    for col in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        cell.border = thin_border


def add_row(ws, row):
    ws.append(row)
    r = ws.max_row
    for c, val in enumerate(row, start=1):
        cell = ws.cell(row=r, column=c)
        cell.alignment = wrap_alignment
        cell.border = thin_border
        if c == 3 and val == "Email":
            cell.fill = PatternFill("solid", fgColor="DBEAFE")
        elif c == 3 and val == "Wati (WhatsApp)":
            cell.fill = PatternFill("solid", fgColor="DCFCE7")
        elif c == 3 and val == "SMS":
            cell.fill = PatternFill("solid", fgColor="FEF3C7")


def autosize(ws):
    for col in ws.columns:
        max_length = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            try:
                if cell.value:
                    max_length = max(max_length, min(len(str(cell.value)), 80))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max_length + 2, 80)


# ===== Sheet 1: All communications =====
ws_all = wb.create_sheet("All communications")
add_headers(ws_all, [
    "Category", "Trigger / Template", "Channel", "When triggered",
    "Subject / Template summary", "Content / Body", "Status",
])

communications = [
    (
        "Student",
        "Registration complete",
        "Email",
        "After account is created in /auth/sync (backend/src/auth/auth.service.ts)",
        "Welcome to Bharat Innovation Olympiad",
        "Registration complete. Roll number included. Next steps: pick schedule, practice exam, device check, exam day instructions.",
        "Implemented",
    ),
    (
        "Student",
        "Payment confirmed",
        "Email",
        "When access pass transitions to ACTIVE (backend/src/payment/access-pass.service.ts)",
        "Your exam access is unlocked",
        "Payment of ₹{amount} received. Every olympiad exam unlocked for the season.",
        "Implemented",
    ),
    (
        "Student",
        "Slot confirmed",
        "Email",
        "When booking is confirmed (backend/src/slot/slot.service.ts)",
        "Your schedule for {examTitle} is confirmed",
        "Sitting booked. Exam, roll number, date/time, schedule label. Pre-exam checklist.",
        "Implemented",
    ),
    (
        "Student",
        "Exam submitted",
        "Email",
        "When exam attempt is submitted (backend/src/attempt/attempt.service.ts)",
        "Your {examTitle} submission is in",
        "Attempt submitted. Results will be published once marking is complete.",
        "Implemented",
    ),
    (
        "Student",
        "Results published",
        "Email",
        "When final report is published (backend/src/results/results.service.ts)",
        "Your {examTitle} result is ready",
        "Marking complete. Final score, rank, percentile, breakdown, answer key available.",
        "Implemented",
    ),
    (
        "Student",
        "Parent approval request",
        "Email",
        "When guardian details are saved (backend/src/guardian/guardian.service.ts)",
        "Parental Consent Confirmation — Bharat Innovation Olympiad",
        "Review and confirm parental approval via link.",
        "Implemented",
    ),
    (
        "Student",
        "Exam submitted",
        "Wati (WhatsApp)",
        "When exam attempt is submitted (backend/src/attempt/attempt.service.ts)",
        "bio_submission",
        "Hi {firstName}, confirmation of successful submission at Bharat Innovation Olympiad on {date}.",
        "Implemented",
    ),
    (
        "Student",
        "Slot confirmed",
        "Wati (WhatsApp)",
        "When booking is confirmed (backend/src/slot/slot.service.ts)",
        "bio_schedule",
        "Hi {firstName}, schedule: {date} at {time} IST | Online.",
        "Implemented",
    ),
    (
        "Student",
        "Exam reminder (T-1 day)",
        "Wati (WhatsApp)",
        "Hourly sweeper sends to exams tomorrow (backend/src/notification/whatsapp-reminder.service.ts)",
        "bio_reminder",
        "Hi {firstName}, reminder for Bharat Innovation Olympiad exam tomorrow - {date} at {time} IST.",
        "Implemented",
    ),
    (
        "Student",
        "Results published",
        "Wati (WhatsApp)",
        "When final report is published (backend/src/results/results.service.ts)",
        "bio_result",
        "Hi {firstName}, verified score and rank available. Percentile {percentile}, India rank: {rank}.",
        "Implemented",
    ),
    (
        "Student / Partner / School",
        "Login / registration OTP",
        "SMS",
        "Student login, student registration, partner/school flows",
        "2Factor OTP",
        "6-digit code via SMS or voice.",
        "Implemented",
    ),
    (
        "Admin",
        "Admin broadcast",
        "Email",
        "Admin manually sends from admin portal",
        "Admin-composed subject",
        "Free-text message from admin.",
        "Implemented",
    ),
    (
        "Admin",
        "Admin free-text SMS",
        "SMS",
        "Admin manually sends from admin portal",
        "Transactional SMS via 2Factor",
        "Free-text message inserted into configured DLT template.",
        "Implemented (requires TWOFACTOR_SENDER_ID & template)",
    ),
    (
        "Partner",
        "Email verification",
        "Email",
        "Partner application email confirmation",
        "Confirm your BIO partner application email",
        "Confirm email, explain next steps, 24h expiry.",
        "Implemented",
    ),
    (
        "Partner",
        "Start verification (OTP code)",
        "Email",
        "Partner application start",
        "Your BIO partner application code",
        "6-digit code for application page, 10min expiry.",
        "Implemented",
    ),
    (
        "Partner",
        "Application received",
        "Email",
        "Partner application submitted",
        "We've received your partner application",
        "Application in review. Decision by email.",
        "Implemented",
    ),
    (
        "Partner",
        "Approved",
        "Email",
        "Partner approved",
        "Your BIO partner access is approved",
        "Approved. Access token and login link.",
        "Implemented",
    ),
    (
        "Partner",
        "Rejected",
        "Email",
        "Partner rejected",
        "Update on your BIO partner application",
        "Not approved. Reason provided.",
        "Implemented",
    ),
    (
        "Partner",
        "Revoked",
        "Email",
        "Partner access revoked",
        "Your BIO partner access has been revoked",
        "Access revoked, token no longer works.",
        "Implemented",
    ),
    (
        "Partner",
        "Password reset code",
        "Email",
        "Forgot password",
        "Reset your BIO partner password",
        "6-digit code, 10min expiry.",
        "Implemented",
    ),
    (
        "Partner",
        "Password changed",
        "Email",
        "Password updated",
        "Your BIO partner password was changed",
        "Alert that password was changed.",
        "Implemented",
    ),
    (
        "School",
        "Email verification",
        "Email",
        "School activation email confirmation",
        "Confirm your school's BIO application email and create your password",
        "Confirm coordinator email and choose password.",
        "Implemented",
    ),
    (
        "School",
        "Start verification (OTP code)",
        "Email",
        "School activation start",
        "Your BIO school activation code",
        "6-digit code for activation page.",
        "Implemented",
    ),
    (
        "School",
        "Application received",
        "Email",
        "School application submitted",
        "We've received your school's application",
        "Application in review.",
        "Implemented",
    ),
    (
        "School",
        "Approved",
        "Email",
        "School approved",
        "Your BIO school portal access is ready",
        "Approved. School code, access token, next steps.",
        "Implemented",
    ),
    (
        "School",
        "Rejected",
        "Email",
        "School rejected",
        "Update on your school's BIO application",
        "Not approved. Reason.",
        "Implemented",
    ),
    (
        "School",
        "Revoked",
        "Email",
        "School access revoked",
        "Your BIO school portal access has been revoked",
        "Access revoked, token and sign-in disabled.",
        "Implemented",
    ),
]

for row in communications:
    add_row(ws_all, row)

# ===== Sheet 2: Requested trigger mapping =====
ws_req = wb.create_sheet("Requested triggers")
add_headers(ws_req, [
    "#", "Trigger", "When", "Channel(s)", "Status", "Notes / Existing implementation",
])

requested = [
    (
        1,
        "During registration: after email verification if payment is pending",
        "After verify step if access pass not active",
        "—",
        "Remaining",
        "No payment-pending reminder email or message found. Could be added after verify (now goes to payment).",
    ),
    (
        2,
        "After payment confirmation",
        "Access pass becomes ACTIVE",
        "Email",
        "Implemented",
        "accessPassActivatedEmail / sendAccessPassActivated in access-pass.service.ts",
    ),
    (
        3,
        "Registration and roll number",
        "Account created at end of registration",
        "Email",
        "Implemented",
        "welcomeEmail / sendWelcome in auth.service.ts. Roll number included.",
    ),
    (
        4,
        "If face scan pending",
        "User has not enrolled face",
        "—",
        "Remaining",
        "No face-scan-pending reminder found. Dashboard currently blocks exam start but does not send a reminder.",
    ),
    (
        5,
        "If parental consent remaining",
        "Guardian not completed / not approved",
        "—",
        "Remaining",
        "sendParentApprovalEmail sends the consent request once, but no follow-up reminder for pending consent.",
    ),
    (
        6,
        "Parent consent approval and information",
        "Guardian details saved",
        "Email",
        "Implemented",
        "parentApprovalEmail / sendParentApprovalEmail in guardian.service.ts.",
    ),
    (
        7,
        "Slot booking",
        "Booking confirmed",
        "Email + Wati",
        "Implemented",
        "slotConfirmedEmail (email) and bio_schedule (Wati) in slot.service.ts.",
    ),
    (
        8,
        "Exam reminder",
        "T-1 day before scheduled exam",
        "Wati",
        "Implemented",
        "bio_reminder / WhatsAppReminderService sweeps hourly.",
    ),
    (
        9,
        "Exam completion",
        "Exam submitted",
        "Email + Wati",
        "Implemented",
        "examSubmittedEmail (email) and bio_submission (Wati) in attempt.service.ts.",
    ),
    (
        10,
        "3 mails between exam completion and result at fixed interval",
        "After exam submission, before results publish",
        "—",
        "Remaining",
        "No drip campaign or scheduled interim messages found.",
    ),
    (
        11,
        "Results",
        "Final report published",
        "Email + Wati",
        "Implemented",
        "resultsPublishedEmail (email) and bio_result (Wati) in results.service.ts.",
    ),
    (
        12,
        "Season ending mail, for next season",
        "Season closes",
        "—",
        "Remaining",
        "No season-end / next-season notification found in code.",
    ),
]

for row in requested:
    add_row(ws_req, row)

# ===== Sheet 3: Summary =====
ws_summary = wb.create_sheet("Summary")
add_headers(ws_summary, ["Channel", "Count implemented", "Count remaining"])
channel_summary = [
    ("Email", "14+", "0 for core student lifecycle"),
    ("Wati (WhatsApp)", "4", "0"),
    ("SMS", "2 (OTP + admin broadcast)", "0"),
    ("Not yet implemented (from requested list)", "—", "5 (#1, #4, #5, #10, #12)"),
]
for row in channel_summary:
    add_row(ws_summary, row)

autosize(ws_all)
autosize(ws_req)
autosize(ws_summary)

out = r"C:\KSR\Lemon Ideas\Bharat_innovation_olympiad\communication-triggers.xlsx"
wb.save(out)
print(f"Saved {out}")
