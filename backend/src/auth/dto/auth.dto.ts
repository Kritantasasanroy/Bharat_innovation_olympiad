import {
    IsEmail,
    IsEnum,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { Role } from '@prisma/client';

export class SyncUserDto {
    @IsEmail()
    email: string;  // ← email now comes in the body (no JwtAuthGuard needed)

    /** See `LoginSyncDto.code` — required wherever `EMAIL_OTP_PROVIDER=backend`. */
    @IsString()
    @IsOptional()
    code?: string;

    /**
     * Mandatory mobile number. Every transactional message — WhatsApp and SMS
     * (submission, schedule, result, reminder, the pending nudges) — is sent to
     * this number, so a registration without one is unreachable for everything
     * that matters. Stored as `phoneRaw` the moment it is typed; `phone` takes
     * the normalized form when it is not already held by another account.
     */
    @IsString()
    @IsNotEmpty()
    phone: string;

    /** The SMS code for `phone`. Required whenever `phone` is supplied. */
    @IsString()
    @IsOptional()
    phoneCode?: string;

    @IsString()
    firstName: string;

    @IsString()
    lastName: string;

    @IsEnum(Role)
    @IsOptional()
    role?: Role;

    @IsInt()
    @Min(6)
    @Max(12)
    @IsOptional()
    classBand?: number;

    @IsString()
    @IsOptional()
    schoolCode?: string;

    /** Direct school id, used when a student adds an unlisted school. */
    @IsString()
    @IsOptional()
    schoolId?: string;

    /**
     * Class section as the school writes it — "A", "B2", "Rose".
     *
     * Free text rather than an A–H enum: Indian schools name sections
     * inconsistently and a fixed list would leave real students unable to
     * register. Length-capped because it is printed on rosters and admit cards.
     *
     * **Required for students.** School reporting is class-by-class, and a
     * school report whose rows have no section cannot be split into classes at
     * all, which is the thing the report is for. Still `@IsOptional()` at the
     * DTO level because staff and school accounts sync through this same
     * endpoint and have no section; `syncUser` demands it of students.
     */
    @IsString()
    @MaxLength(10)
    @IsOptional()
    section?: string;

    /**
     * Acceptance of the olympiad terms & conditions, ticked during registration.
     * Sent as the version string the student was actually shown, so a later
     * revision is distinguishable from the text they agreed to.
     */
    @IsString()
    @IsOptional()
    termsVersion?: string;

    /** Partner campaign referral code the student arrived with (`?ref=CODE`). */
    @IsString()
    @IsOptional()
    referralCode?: string;

    /**
     * Guardian contact — the parent's name, email and WhatsApp number, taken
     * on the registration details step. Record-only: every code and exam
     * update goes to the participant's own email/phone; these are stored on
     * `GuardianProfile` for the school's records and never drive a send.
     */
    @IsString()
    @IsOptional()
    guardianName?: string;

    @IsEmail()
    @IsOptional()
    guardianEmail?: string;

    @IsString()
    @IsOptional()
    guardianPhone?: string;
}

export class LoginSyncDto {
    @IsEmail()
    email: string;  // For login flow: just sync/retrieve by email and return our JWT

    /**
     * The 6-digit code from `POST /auth/email/send-otp`.
     *
     * Optional in the DTO but **required at runtime wherever
     * `EMAIL_OTP_PROVIDER=backend`** — see `AuthController.loginSync`. It is
     * optional here only so an environment still on Neon Auth keeps working
     * during the migration; the controller, not the validator, is what enforces
     * it, because the answer depends on how that environment is configured.
     */
    @IsString()
    @IsOptional()
    code?: string;
}

export class SendEmailOtpDto {
    @IsEmail()
    email: string;

    /**
     * The typed first name, from registration's details step — validated
     * non-empty there before this endpoint is ever called. Absent on a login
     * request, where a student has typed only their email; the account's own
     * name is looked up server-side instead. Used to greet the student in the
     * emailed code, and — together with the fields below — to snapshot the
     * registration attempt into `PendingApplicant` so an admin can see who
     * started and never finished. Never trusted for anything else; none of
     * this is proof of anything until the code is verified.
     */
    @IsString()
    @IsOptional()
    name?: string;

    /** Present only alongside `name`, i.e. only from registration's details step. */
    @IsString()
    @IsOptional()
    lastName?: string;

    /** As typed — not yet a verified contact number. */
    @IsString()
    @IsOptional()
    phone?: string;

    @IsInt()
    @Min(6)
    @Max(12)
    @IsOptional()
    classBand?: number;

    @IsString()
    @IsOptional()
    schoolId?: string;

    @IsString()
    @IsOptional()
    schoolName?: string;

    @IsString()
    @IsOptional()
    section?: string;
}

export class SendPhoneOtpDto {
    @IsString()
    phone: string;

    /** How to deliver the code: `sms` (default) or `voice` for an automated call. */
    @IsIn(['sms', 'voice'])
    @IsOptional()
    channel?: 'sms' | 'voice';
}

/** Login flow for students who verified a phone OTP instead of an email one. */
export class PhoneLoginSyncDto {
    @IsString()
    phone: string;

    /** The 6-digit code sent by SMS — verified server-side. */
    @IsString()
    code: string;
}

export class UpdateProfileDto {
    @IsString()
    @IsOptional()
    firstName?: string;

    @IsString()
    @IsOptional()
    lastName?: string;

    /**
     * The student's contact number (item 14). Blank clears it. Setting a new
     * number requires `phoneCode`, since the number doubles as a login
     * identifier — an unverified change would hand the account to whoever
     * owns the number typed in.
     */
    @IsString()
    @IsOptional()
    phone?: string;

    @IsString()
    @IsOptional()
    phoneCode?: string;

    @IsInt()
    @Min(6)
    @Max(12)
    @IsOptional()
    classBand?: number;
}
