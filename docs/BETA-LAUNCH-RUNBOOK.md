# Beta Launch Runbook

> **Status as of 2026-07-26 — steps 4, 5 and 6 are DONE and live.**
>
> - All five services are deployed (backend + portal-api + admin-api on Render,
>   both frontends on Vercel).
> - The schema is applied; `prisma migrate diff` against the live Neon DB reports
>   **0 DDL statements**.
> - **Trial Test — Get Exam Ready** exists, is published, and gates all nine
>   production exams at every class band (verified: `required=true` on each) —
>   **including the free Practice Exam** since 2026-07-27.
> - **Slots are pay → pick → locked.** Booking needs an active access pass; a
>   confirmed booking can only be moved by an admin.
> - **Bharat Innovation Olympiad — Class 8** is published with **16 slots**:
>   26 Jul → 2 Aug, 1:00 PM and 7:00 PM IST, capacity 500. Five stale
>   14–15 July slots were removed.
>
> What is still outstanding is **step 1 (share the Drive folder)**, step 2 (the
> API key), step 3 (2Factor), and the two items under *Known gaps*.

Steps 1–3 are prerequisites you complete outside the codebase; 4–7 are the
deploy, kept here as the record of what was run.

---

## 1. Share the Google Drive gallery folder

Folder: <https://drive.google.com/drive/folders/1ahzAaW0dOaVpa5FwPO9rPldUexriXV2P>

Set it to **Anyone with the link → Viewer**.

This is a hard prerequisite. 19 of the 50 Grade 8 questions carry an image, and
only 5 of those name a Drive link — the other 14 resolve by filename, which
means the folder has to be *listable*. **As of the last check this folder is
still private**: an unauthenticated request to it redirects to a Google sign-in
page rather than rendering, which is exactly what the API key will hit. Until
that changes the importer will leave those 19 questions blank.

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
| `GOOGLE_DRIVE_GALLERY_FOLDER_ID` | `1ahzAaW0dOaVpa5FwPO9rPldUexriXV2P` |
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

## 6. Set up the exams ✅ done 2026-07-26

Backend must be running and reachable at `API_URL`.

```bash
cd backend
set -a && . ./.env && set +a

# Report what would happen. Writes nothing.
API_URL=https://olympiad-backend-iqzn.onrender.com/api \
  node scripts/setup-beta-exams.js --dry-run --skip-archive

# What was actually run.
API_URL=https://olympiad-backend-iqzn.onrender.com/api \
  node scripts/setup-beta-exams.js --skip-archive
```

Env: `API_URL` (default `http://localhost:4000/api`), `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `SLOT_CAPACITY` (default 500),
`MAIN_EXAM_TITLE`, `IMPORT_QUESTIONS`.

Idempotent, and deliberately conservative in two ways:

- It **adopts** an existing exam by title (`titleMatches` covers the
  em-dash/hyphen and Class/Grade variants) instead of creating a near-duplicate
  beside it. The trial is matched on the `isTrial` **flag**, so renaming it in
  the admin UI does not orphan it.
- It does **not** re-import questions unless `IMPORT_QUESTIONS=true`. The Class 8
  exam already carries a reviewed 50-question paper, and a run whose purpose is
  fixing slots must not silently rewrite it.

The slot step is **replace, not append**: the schedule is authoritative, so any
slot not in it is deleted — except one with bookings, which is reported for a
human to reassign rather than pulled out from under a student.

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
3. **Before paying**, `/exams` shows **🔒 Unlock to pick your slot** → `/unlock`.
   Booking is refused server-side without an active pass, so also try posting to
   `/slots/:id/book` directly and confirm `ACCESS_PASS_REQUIRED`.
4. Pay → `/exams` shows **Choose your exam slot** → picker lists 16 slots →
   confirm dialog → book. The slot now reads **confirmed and cannot be changed**,
   the other 15 show *Slot locked*, and `DELETE /bookings/:id` is refused. Move
   the student from **Admin → Slots → (a slot) → Bookings → Move**.
5. In your slot: Start Exam → device checks → rules modal, **checkbox gates the
   button** → trial test in full proctored fullscreen → finish → real exam.
   Repeat on the **free Practice Exam** — it is gated too, so it must also send
   you through the trial first rather than straight into the paper.
6. Exam shows **Section 1 of 5 · Entrepreneurship Mindset**, 13 questions, then
   section 2. Images render. Sidebar navigator grouped by section.
7. Submit → exam feedback form → results.

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
- **Six junk exams are published to students** with **zero questions**:
  `BIOTest 1`, `hluibhkb`, `igu`, `jhvhb`, `test class 7`, `egwethhth`. A student
  in the matching class band sees them in their exam list. Archive them from
  **Admin → Exams → Archive Exam**, or run the setup script without
  `--skip-archive` (which archives everything except the named exam, the trial,
  and the practice papers — including the real **class 7** paper, so check first).
- **`Bharat Innovation Olympiad - class 7`** is a real 50-question paper, still
  unpublished, and still holds four stale 14–15 July slots. It was left alone
  because only one exam was named for re-slotting. To give it the same schedule:
  `MAIN_EXAM_TITLE='Bharat Innovation Olympiad - class 7' node scripts/setup-beta-exams.js --skip-archive`
- **No frontend test harness exists.** The proctoring fixes are covered by
  typecheck, build and manual verification only — there is no jest/RTL setup in
  `frontend/`, so the violation state machine has no automated test.
