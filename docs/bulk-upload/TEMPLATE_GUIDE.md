# Bulk Upload Templates — Field Guide

Two files, always uploaded separately: **schools first, students second** (a student row can reference a school created in the same schools batch). Both accept `.csv`, `.xlsx`, or `.xls`.

---

## 1. `schools_bulk_upload_template.csv`

| Column | Required | Maps to | Notes |
|---|---|---|---|
| `external_reference` | recommended | — | Your own row id (not stored). Echoed back in the import error report so a failed row is easy to find in your source sheet. |
| `school_name` | **yes** | `School.name` | |
| `board` | **yes** | `School.board` | Free text, but keep it consistent (`CBSE`, `ICSE`, `State Board`, `IB`, `IGCSE`, `Other`) — it's shown as a filter. |
| `udise_code` | no | `School.udiseCode` | Government UDISE+ code, if known. |
| `city` | **yes** | `School.city` | |
| `state` | **yes** | `School.state` | |
| `pincode` | **yes** | `School.pincode` | Combined with `school_name`, this is the de-dupe key — a school with the same normalized name + pincode is treated as the same school, not a duplicate. |
| `school_code` | no | `School.code` | Your own short code (e.g. `DPS-GGN-45`). Unique if given. **This is the preferred key students use to link to this school** — set it whenever you can. |
| `partner_referral_code` | no | resolves to `School.partnerId` | The onboarding partner's campaign referral code (`Campaign.referralCode`). Attributes this school to the partner who brought it in. Leave blank for a school with no partner (falls back to the default in-house partner). |
| `partner_org_name` | no | — | Reference only, to cross-check `partner_referral_code` resolves to the org you expect. Not stored against the school. |
| `coordinator_name` | required if `onboard_now=YES` | provisions a `User` (role `SCHOOL`) | |
| `coordinator_email` | required if `onboard_now=YES` | `SchoolRequest.coordinatorEmail` | Must be unique — becomes the coordinator's login. |
| `coordinator_phone` | required if `onboard_now=YES` | | |
| `onboard_now` | **yes** | `School.onboardedAt` | `YES` = full onboarding: creates the coordinator login and school portal access (needs the three coordinator_* columns filled). `NO` = directory-only entry — the school appears in the student registration dropdown, but nobody can log in as it. Can be upgraded to `YES` later. |
| `notes` | no | — | Internal admin note, not shown to the school. |

---

## 2. `students_bulk_upload_template.csv`

| Column | Required | Maps to | Notes |
|---|---|---|---|
| `external_reference` | recommended | — | Your own row id, echoed back on import errors. |
| `first_name` | **yes** | `User.firstName` | |
| `last_name` | **yes** | `User.lastName` | |
| `email` | **yes** | `User.email` | Unique. The student claims their account by registering with this exact email. |
| `phone` | no | `User.phone` | E.164 (`+91XXXXXXXXXX`) preferred; used for WhatsApp notifications and OTP login. |
| `class_band` | **yes** | `User.classBand` | Grade, as an integer. |
| `section` | no | `User.section` | Free text — schools label sections inconsistently (`A`, `B2`, `Rose`), so anything goes. |
| `gender` | no | `GuardianProfile.gender` | Demographic only, never used for gating. |
| `date_of_birth` | no | `GuardianProfile.studentDob` | Format `DD-MM-YYYY`. |
| **— school link (fill one of the two options below) —** ||||
| `school_code` | conditional | resolves `schoolId` | Preferred — matches `School.code` from the schools template. |
| `school_name` + `school_pincode` | conditional | resolves `schoolId` | Fallback if the school has no `school_code`. Must match an existing school's name + pincode exactly (this is the same de-dupe key the schools template uses). |
| **— referral / attribution —** ||||
| `referral_code` | no | `User.referralCode`, feeds `AttributionRecord` | The **student's own** referral code (e.g. from a partner's campaign link or a shared coupon), independent of which partner brought the school. This is what credits a paid conversion to a partner campaign. |
| `brought_by` | no | — | Free-text description of who physically brought this student in (a field agent's name, "Teacher outreach", etc.) for admin readability. Not itself stored as a relation — `referral_code` is the field that actually drives attribution/payouts. |
| **— guardian / parent details —** ||||
| `guardian_first_name` | required if any guardian field is filled | `GuardianProfile.guardianFirstName` | |
| `guardian_last_name` | no | `GuardianProfile.guardianLastName` | |
| `relationship` | required if any guardian field is filled | `GuardianProfile.relationship` | `Mother`, `Father`, `Legal Guardian`, or `Other`. |
| `guardian_email` | required if any guardian field is filled | `GuardianProfile.guardianEmail` | |
| `guardian_phone` | required if any guardian field is filled | `GuardianProfile.guardianPhone` | Not required to be unique — siblings can share a parent's number. |
| `student_city` | no | `GuardianProfile.city` | Where the student lives — can differ from the school's city. |
| `student_state` | no | `GuardianProfile.state` | |
| `id_document_type` | no | `GuardianProfile.idDocumentType` | `School ID`, `Aadhaar`, `Passport`, or `Other`. (The template has no column for the document image itself — that's a file upload, handled separately per student, not through this sheet.) |
| `parental_consent` | `YES`/`NO` | `GuardianProfile.parentalConsentAt` | **Compliance-sensitive.** A bulk import can only record consent that was *actually already obtained offline* (e.g. a signed physical form the partner/school collected) — the timestamp gets stamped at import time either way, so only mark `YES` where that's true. |
| `data_consent` | `YES`/`NO` | `GuardianProfile.dataConsentAt` | Same caveat as above. |
| **— migration / advanced —** ||||
| `external_roll_number` | no | `User.rollNumber` | Leave blank to auto-allocate a new roll number. Only set this when migrating a student who already has a roll number issued by a previous system — once set, a roll number never changes. |
| `invite_only` | **yes** | `User.invitedAt` | Bulk upload always creates an **invited** account (no password) — the student activates it themselves by registering with the matching email. This column exists for a future direct-activation path; for now, always set `YES`. |
| `notes` | no | — | Internal admin note. |

---

### How the two files connect

1. Upload `schools_bulk_upload_template.csv` first. Every school gets a `school_code` (yours or auto-assigned) and a name+pincode key.
2. Upload `students_bulk_upload_template.csv`, filling `school_code` (preferred) or `school_name` + `school_pincode` per student to attach them to the right school.
3. A student row can also carry its own `referral_code`, independent of the school's `partner_referral_code` — a school onboarded by one partner can still have individual students attributed to a different campaign (e.g. a shared link a student clicked directly).
