import { IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Role } from '@prisma/client';

export class SyncUserDto {
    @IsEmail()
    email: string;  // ← email now comes in the body (no JwtAuthGuard needed)

    /**
     * Optional mobile number. Stored only when `phoneCode` proves ownership —
     * see `AuthService.syncUser`.
     */
    @IsString()
    @IsOptional()
    phone?: string;

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
