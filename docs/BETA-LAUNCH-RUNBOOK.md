# Beta Launch Runbook

Everything for the Grade 8 beta is built, tested and merged into the working
tree. Nothing has been written to the production database — this file is the
deploy sequence.

Run the steps in order. Steps 1–3 are prerequisites you complete outside the
codebase; 4–7 are the actual deploy.

---

## 1. Share the Google Drive gallery folder

Folder: <https://drive.google.com/drive/folders/1FmUnZoyg_mLpCaVwdeIzcPVB7HNvlSGr>

Set it to **Anyone with the link → Viewer**.

This is a hard prerequisite. 19 of the 50 Grade 8 questions carry an image, and
only 5 of those name a Drive link — the other 14 resolve by filename, which
means the folder has to be *listable*. As of writing, neither the folder nor any
file in it is readable, so the importer would leave those 19 questions blank.

Verify from the admin portal: **Media Gallery → Sync from Drive** reports a file
count rather than an error.

## 2. Create a Google Drive API key

Google Cloud Console → **APIs & Services** → enable the **Google Drive API** →
**Credentials** → **Create credentials** → **API key**. Restrict it to the Drive
API.

## 3. Fix 2Factor SMS delivery

The code path is correct and unchanged in behaviour — the cause is account-side.
Two candidates, and the new diagnostics tell you which:

```bash
# Balances. Voice and SMS bill separately, which is exactly why voice OTP
# working proved nothing about SMS.
curl -H "Authorization: Bearer $ADMIN_JWT" \
  https://<api-host>/api/admin/notifications/sms-health

# Send a real OTP and get the gateway's tracking id back (never the code).
curl -H "Authorization: Bearer $ADMIN_JWT" \
  "https://<api-host>/api/admin/notifications/sms-probe?phone=+919812345678"

# Ask the carrier whether it actually landed.
curl -H "Authorization: Bearer $ADMIN_JWT" \
  "https://<api-host>/api/admin/notifications/sms-delivery-report?sessionId=<id>"
```

- **Zero SMS balance** → top up 2Factor.
- **Balance fine, report says not delivered** → the account-default OTP template
  is not DLT-approved. Set `TWOFACTOR_OTP_TEMPLATE` to your approved template
  name (the `.env` comment mentions a `BIO OTP` template). The literal value
  `AUTOGEN` means "no template appended — use the account default".

Every OTP send now logs its session id, and 15 seconds later logs the carrier's
delivery verdict at ERROR level if it was not delivered. So after this deploy the
problem is visible in the Render logs without anyone having to ask a student.

## 4. Environment variables

Add to Render (backend service). All are declared in `render.yaml` and
`backend/.env.example`:

| Key | Value |
|---|---|
| `GOOGLE_DRIVE_API_KEY` | from step 2 |
| `GOOGLE_DRIVE_GALLERY_FOLDER_ID` | `1FmUnZoyg_mLpCaVwdeIzcPVB7HNvlSGr` |
| `TWOFACTOR_OTP_TEMPLATE` | approved DLT template name, or `AUTOGEN` |
| `TWOFACTOR_VERIFY_DELIVERY` | `true` |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | existing values — these were never in the repo, only the dashboard |
| `NEXT_PUBLIC_SITE_URL` | (frontend) e.g. `https://exam.bharatolympiad.in` |

## 5. Push the schema

```bash
cd backend
npx prisma generate
npx prisma db push
```

**This is safe and additive.** Verified with `prisma migrate diff` — 20 nullable
columns on `Question`, 3 defaulted booleans on `Exam`, one new `TrialCompletion`
table, six indexes, two foreign keys. **No drops, no type changes, no data
loss.** Render's start command already runs `prisma db push` on boot, so a
deploy does this for you.

One thing to know: `Exam.requiresTrial` defaults to `true`, so every existing
exam acquires the rehearsal gate the moment the column exists. The gate is
written to disengage entirely when no trial paper is configured, so this cannot
lock students out before step 6 — but do not set `requiresTrial=false` expecting
that to be the safety valve; the safety valve is the missing trial exam itself.

## 6. Set up the exams

Backend must be running and reachable at `API_URL`.

```bash
cd backend

# Report what would happen. Writes nothing.
node scripts/setup-beta-exams.js --dry-run

# Do it.
node scripts/setup-beta-exams.js
```

Env: `API_URL` (default `http://localhost:4000/api`), `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `SLOT_CAPACITY` (default 500).

It is idempotent — exams are matched by title, the question import replaces
rather than appends, and slots are matched by start time. Re-run it freely.

What it does:

1. **Trial Test — Get Exam Ready** — 6 questions from `Trial_Test_5_Questions.xlsm`,
   10 minutes, all grades, free, no slots, unlimited retakes, wide-open window.
2. **Bharat Innovation Olympiad — Grade 8** — 50 questions from
   `Grade_8_Easy_Question_Paper_50.xlsm`, 60 minutes, 50 marks, 1 mark per
   question, **no negative marking**, class band 8. Five sections created from
   the workbook's Part Names: Entrepreneurship Mindset (13), Problem Solving &
   Innovation (12), Emerging Technologies & Digital Readiness (10), Future
   Readiness & Global Awareness (8), Financial Readiness (7).
3. **16 slots** — 26 Jul → 2 Aug 2026, two a day at 1:00 PM and 7:00 PM IST,
   capacity 500 each.
4. **Archives every other exam** — unpublish + hide. Practice exams
   (`DEMO_EXAM_IDS`) and the trial paper are exempt. **Nothing is deleted**:
   attempts, bookings, payments and certificates are untouched, and every exam
   can be restored from **Admin → Exams → Show archived → Restore**.

`--skip-archive` leaves other exams alone. Auto-distribution is deliberately
**not** run: students pick their own slot.

Order matters for images — run **Media Gallery → Sync from Drive** *before* the
script, or the 19 image questions import blank. If you get that order wrong, sync
and re-run the script; it replaces the paper.

## 7. Verify

Student, end to end:

1. Register → SMS OTP arrives → registration feedback form → dashboard.
2. Profile: save a phone → **hard refresh** → the number is still there and no
   OTP is demanded again. *(This was the reported bug.)*
3. Pay → `/exams` shows **Choose your exam slot** → picker lists 16 slots → book.
4. In your slot: Start Exam → device checks → rules modal, **checkbox gates the
   button** → trial test in full proctored fullscreen → finish → real exam.
5. Exam shows **Section 1 of 5 · Entrepreneurship Mindset**, 13 questions, then
   section 2. Images render. Sidebar navigator grouped by section.
6. Submit → exam feedback form → results.

Admin:

- `/exams` — archive toggle, "Show archived", Trial paper / Trial required badges.
- `/questions?examId=…` — **Import full paper** creates a section per Part Name.
- `/media` — Drive folder link, Sync from Drive with a per-file report.
- `/slots` — confirm the 16 slots read as 1:00 PM and 7:00 PM **IST**, not UTC.

---

## Known gaps

- **Day 1 of the slot range is today (26 July).** The 1 PM and possibly 7 PM
  sittings may already have passed by the time this deploys. Shift `SCHEDULE.days`
  in `scripts/setup-beta-exams.js` if you want to reclaim them.
- **The trial workbook has 6 questions, not 5.** Row 7 reuses row 2's Question ID
  (auto-suffixed on import) and its `Correct Answer` text contradicts its
  `Correct Option`; the letter wins. It is an opinion question ("How excited are
  you…") and the trial is never scored, so this is cosmetic. The importer reports
  both as warnings.
- **The trial questions are Grade 5 content** while the paper is Grade 8. Fine
  for a rehearsal whose purpose is the environment, not the difficulty — replace
  the workbook and re-run if you want Grade 8 warm-up questions.
- **`Grade_7_…xlsx` and `Grade_8_Innovation_Olympiad_…xlsx`** are a third, older
  column format (`Category`/`Sub-Topic`, no answer-letter column). Neither the
  new nor the legacy parser reads them; the importer now says so explicitly
  instead of failing on row 2. They are not needed for the beta.
