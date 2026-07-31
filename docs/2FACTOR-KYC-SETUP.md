# Making SMS OTP actually deliver (2Factor)

**Status: SMS is accepted by the API and reaches zero handsets. Voice OTP on the
same account works.** That combination is the signature of an unverified 2Factor
account, not a bug in this codebase. Nothing in the portal can fix it — the steps
below have to be done in the 2Factor dashboard by someone with access to the
account and the company's documents.

Once they are done, SMS starts working with **no code change and no redeploy**.

---

## What we already know, and how we know it

| Evidence | What it rules out |
|---|---|
| Sends to 4 different numbers across different carriers all returned `Status: Success` / `DELIVERED`, and **0** handsets received anything | Not a bad number, not one carrier blocking us |
| **Voice OTP on the same API key works** — the call is placed and the code is read out | Not the API key, not the account balance in general, not our request format |
| The API key, template and sender are all set and logged at boot | Not a missing environment variable |
| Delivery reports are requested after every send (`TWOFACTOR_VERIFY_DELIVERY=true`) and logged | Not something failing silently on our side |

SMS and voice are **different regulatory routes** at 2Factor. Voice is not
DLT-regulated in the same way; transactional SMS to Indian numbers is, and the
carrier silently drops messages from a sender that is not properly registered —
while the API upstream still reports success. That is exactly what we see.

---

## What has to happen (in order)

### 1. Complete KYC / business verification on the 2Factor account

- Sign in at **https://2factor.in/** → **My Account** / **KYC**.
- Submit the business documents they ask for (typically company PAN, GST
  certificate, and an authorised-signatory ID).
- Verification is usually 1–2 working days.

Until this is done, an account is treated as a trial account and **promotional
and transactional SMS are not delivered**, regardless of balance.

### 2. Add a paid SMS balance

- Dashboard → **Buy Credits** / **Pricing**.
- Confirm it afterwards with our own diagnostic (below) — it reports the balance
  2Factor returns for the key we are actually using, which is more reliable than
  reading the dashboard for a different account.

Note: **SMS and voice credits are separate balances.** Voice working tells you
nothing about the SMS balance.

### 3. Register the DLT sender ID and templates

DLT (Distributed Ledger Technology) registration is a **TRAI requirement**, done
on the telecom operators' portal, not on 2Factor. 2Factor documents the route at
**https://2factor.in/CP/dlt-registration** — follow their current instructions,
as the operator portals change.

You need:

| Thing | Why | Env var it maps to |
|---|---|---|
| A registered **header / sender ID** (6 characters, e.g. `BIOLYM`) | The carrier drops SMS from unregistered headers | `TWOFACTOR_SENDER_ID` |
| An approved **OTP template** | OTP sends | `TWOFACTOR_OTP_TEMPLATE` |
| An approved **catch-all template** containing a single `{#var#}` | Admin broadcast SMS — the OTP template cannot carry arbitrary text | `TWOFACTOR_SMS_TEMPLATE` |

The catch-all template body should be something like:

```
{#var#}

- Bharat Innovation Olympiad
```

Once approved, the admin's typed message is dropped verbatim into that single
variable, so "send whatever is written" works.

### 4. Point the app at the approved template

On Render (service `olympiad-backend`) set:

```
TWOFACTOR_API_KEY=<the account key>
TWOFACTOR_OTP_TEMPLATE=<your approved OTP template name>   # not AUTOGEN
TWOFACTOR_SENDER_ID=<your 6-char header>
TWOFACTOR_SMS_TEMPLATE=<your catch-all {#var#} template name>
TWOFACTOR_VERIFY_DELIVERY=true
```

`TWOFACTOR_OTP_TEMPLATE=AUTOGEN` means "use the account default template". That is
the right setting only while no approved template exists; once one does, name it
explicitly. The backend logs a warning at boot whenever it is left on `AUTOGEN`.

> **`SMS_PROVIDER` no longer exists.** There used to be a Fast2SMS alternative
> behind `SMS_PROVIDER=fast2sms`. It has been removed: the same 2Factor account
> places voice calls that arrive, so a second gateway added configuration surface
> and a second set of failure modes without addressing the cause. If a stale
> `SMS_PROVIDER` is still set on an environment, the backend ignores it and logs a
> warning at boot — delete the variable.

---

## Verifying it worked

Two admin endpoints exist for exactly this. Both need an admin JWT.

**Gateway health — key present, template in use, balances:**

```bash
curl -s https://olympiad-backend-iqzn.onrender.com/api/admin/notifications/sms-health \
  -H "Authorization: Bearer $ADMIN_JWT"
```

**Send a real OTP and get the provider's tracking handle:**

```bash
curl -s "https://olympiad-backend-iqzn.onrender.com/api/admin/notifications/sms-probe?phone=%2B919876543210" \
  -H "Authorization: Bearer $ADMIN_JWT"
```

(The `+` must be percent-encoded as `%2B` in a query string, or it is read as a
space and the number is rejected.)

It returns a `sessionId`. Feed that back for the **carrier's** verdict — which is
the only thing that distinguishes "accepted" from "delivered":

```bash
curl -s "https://olympiad-backend-iqzn.onrender.com/api/admin/notifications/sms-delivery-report?sessionId=<sessionId>" \
  -H "Authorization: Bearer $ADMIN_JWT"
```

The probe never returns the OTP itself — an admin able to mint a usable code for
any number could sign in as any student, since the phone doubles as a login
identifier.

**It is fixed when a handset receives the message.** `Status: Success` from the
send call is not evidence — that is precisely what has been returned all along
while nothing arrived.

---

## If it still does not deliver after all four steps

Raise it with 2Factor support (**support@2factor.in**) and give them:

- the API key's account id,
- a `sessionId` from the probe above,
- the exact template name and sender ID being used,
- the fact that **voice OTP on the same key is delivered successfully**.

That last point is the one that moves the ticket along: it demonstrates the
account and key are live and the problem is confined to the SMS route.

A known-failing session id from the original investigation, for reference:
`cd07b9a5-8852-11f1-908b-0200cd936042`.

---

## What the portal does in the meantime

SMS not working does **not** block anyone from registering or signing in:

- **Email OTP** is the primary route for both registration and login, and works.
- **Voice OTP** is offered next to every SMS control — "📞 Get the code by call
  instead" on the login page and in registration — and works today.
- A mobile number is **optional** at registration, so no student is stuck behind
  it.
- The admin broadcast page shows a clear "SMS not set up" note rather than a bare
  failure whenever `TWOFACTOR_SENDER_ID` / `TWOFACTOR_SMS_TEMPLATE` are missing.
