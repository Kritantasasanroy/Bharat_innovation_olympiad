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

    /**
     * Mandatory mobile number. Every WhatsApp notification (submission,
     * schedule, result, reminder — see `WhatsAppService`) is sent to this
     * number. It is stored as `phoneRaw` the moment it is typed regardless of
     * whether `phoneCode` (SMS OTP) is ever completed — see
     * `AuthService.syncUser` — so collection does not depend on SMS delivery,
     * which has its own, separate reliability problems.
     */
    @IsString()
    @IsNotEmpty({ message: 'A mobile number is required.' })
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
}

export class LoginSyncDto {
    @IsEmail()
    email: string;  // For login flow: just sync/retrieve by email and return our JWT
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
