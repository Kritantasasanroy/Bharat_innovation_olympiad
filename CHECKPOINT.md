# Checkpoint

Task: Sync legacy student portal copy from `STUDENT_PORTAL_CONTENT_CATALOG (1).xlsx`.

Summary:
- Parsed replacement workbook: 309 catalog rows; 199 marked `ok` (leave unchanged), 110 with actual `New Content`.
- Applied the 110 updated messages across `frontend/src/`.
  - `apply_catalog.py` handled the straightforward literal replacements.
  - Rows that were ambiguous because of JSX splits, template placeholders, or catalogue text that
    differed from source bytes were applied manually with source-normalised edits.
- Fixed two obvious catalogue typos during manual review:
  - `Microphone: ook` → `Microphone: Working`
  - `Provisiona & unverified score` → `Provisional & unverified score`
- Updated one test assertion in `frontend/src/lib/examIntegrity.spec.ts` to match the new fallback copy.

Verification:
- `cmd /c "npm run build"` in `frontend/` completes successfully.
- `cmd /c "npm run test"` in `frontend/` passes (79/79 tests).
- `npm run lint` is not available / misconfigured (`next lint` does not run correctly).

Files changed (all under `frontend/`):
- `src/app/dashboard/page.tsx`
- `src/app/exams/[id]/instructions/page.tsx`
- `src/app/exams/[id]/play/page.tsx`
- `src/app/exams/[id]/submitted/page.tsx`
- `src/app/guardian/page.tsx`
- `src/app/login/LoginMobile.tsx`
- `src/app/profile/page.tsx`
- `src/app/register/page.tsx`
- `src/app/register/steps/PaymentStep.tsx`
- `src/app/register/steps/PresenceStep.tsx`
- `src/app/results/page.tsx`
- `src/components/GuardianForm.tsx`
- `src/components/PayToUnlockBanner.tsx`
- `src/components/PaymentTerms.tsx`
- `src/components/SchoolPicker.tsx`
- `src/components/TooSmallForExam.tsx`
- `src/components/exam/AutoSubmitNotice.tsx`
- `src/components/exam/ExamPreparingOverlay.tsx`
- `src/components/exam/ExamTutorial.tsx`
- `src/components/limon/LimonHelp.tsx`
- `src/lib/copy/onboarding.ts`
- `src/lib/errors.ts`
- `src/lib/examIntegrity.spec.ts`
- `src/lib/examIntegrity.ts`
- `src/lib/limon/tours.ts`
- `src/lib/mascot.ts`

Notes:
- The `violationConsequence` copy keeps `${noun}` for correct pluralisation rather than literal `violation(s)`.
- No files under `apps/`, `backend/`, or other newer workspace applications were modified.
