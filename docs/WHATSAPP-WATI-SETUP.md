# WhatsApp notifications (WATI)

Four messages, one provider, and a set of rules that are not negotiable because
Meta owns half of them.

## The four messages

| Template | Fires when | Variables | Triggered from |
|---|---|---|---|
| `bio_submission` | A paper is submitted (manual **or** auto-submit) | name, submission date | `AttemptService.submitAttempt` / `autoSubmit` |
| `bio_schedule` | A booking becomes CONFIRMED, or a student is moved to another slot | name, exam date, exam time | `SlotService.notifyScheduleConfirmed` |
| `bio_result` | The **final** report is published | name, percentile, India rank | `ResultsService.announceFinalResults` |
| `bio_reminder` | The day before the exam | name, weekday date, time | `WhatsAppReminderService.sweep` (hourly) |

All four are **APPROVED** on the WATI account, language `en_US`, with positional
variables named `"1"`, `"2"`, `"3"`.

## The rules

**The template bodies cannot change.** Meta reviewed those exact words. Editing a
character means a new review, and until it passes the template cannot be sent at
all. `src/notification/whatsapp.templates.ts` mirrors each approved body in a
comment beside its variable builder — that comment is the contract, keep it in
sync if a template is ever re-approved.

**There is no free-text send.** WhatsApp only lets a business open a conversation
with an approved template. Free text is possible only inside a 24-hour window the
*student* opened by messaging first, which never happens here. This is why the
admin probe endpoint sends a template with sample values rather than offering a
message box.

**Everything is IST.** The server clock is UTC and the olympiad runs to a
published IST timetable. A date formatted in UTC is wrong by 5½ hours, which on
an afternoon exam is the wrong day.

**Nothing sends twice.** Every send claims a row in `WhatsAppMessage` on a unique
`(template, dedupeKey)` index *before* calling WATI. The key differs per
template — attempt id for submission and result, `booking:slot` for schedule,
`booking:examDate` for the reminder — so a genuinely new event (a reassigned
slot, a rescheduled exam) still sends, while a restart mid-fan-out does not
re-message a cohort.

**Nothing fails a business action.** Every send is best-effort. The paper is
submitted, the seat is booked, the results are published — a WATI outage is
recorded and logged, never raised.

## Configuration

```
WATI_API_ENDPOINT=https://live-mt-server.wati.io/<tenantId>
WATI_ACCESS_TOKEN=<tenant access token>
WHATSAPP_ENABLED=true            # kill switch for a live cohort
WHATSAPP_REMINDERS_ENABLED=true  # the hourly T-1 day sweeper alone
```

Both credentials are tenant-specific and must match — the endpoint carries the
tenant id in its path. With either missing the app logs messages instead of
sending them and says so at boot.

## Diagnosing "nobody got the message"

Admin-only, under `/api/admin/whatsapp`:

- `GET /health` — provider, endpoint, kill-switch state, the account's currently
  approved templates, and **which of the four are missing**. This is the first
  thing to check: a template renamed, deleted or pushed back into review on the
  WATI side is invisible from inside the code and fails every send.
- `GET /messages?limit=50` — what actually went out, with WATI's message id and
  the rejection text for anything that failed.
- `POST /probe?phone=+91...&template=submission` — a real send to a real handset
  with the approved sample values. `template` is one of `submission`, `schedule`,
  `result`, `reminder`.
- `POST /run-reminders` — run the T-1 day sweep now instead of waiting for the
  hourly tick. Safe to press twice; the second run reports everything skipped.

### A `result: true` from WATI is not proof of delivery

It means WATI queued the message for Meta. A number that never opted in, or has
no WhatsApp account, fails downstream — WATI reports that only via its webhook,
which this app does not receive. That is why the message id is recorded: it is
the handle that finds the send in the WATI dashboard.

The same trap as the SMS gateway, for the same reason — see
[2FACTOR-KYC-SETUP.md](2FACTOR-KYC-SETUP.md).

## Students with no phone number

`User.phone` is optional and plenty of older registrations have none. Those
students are skipped (`skipped: 'no-phone'`) and still receive every email. This
is not an error condition.
