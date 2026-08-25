import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifyEmailDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(256)
    token: string;
}

export class ResendEmailVerificationDto {
    @IsEmail()
    email: string;
}

/** The email-verify-first step: check the 6-digit code sent to `email`. */
export class ConfirmEmailOtpDto {
    @IsEmail()
    email: string;

    @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code.' })
    code: string;
}

/**
 * Final step of a forgot-password flow: the `resetTicket` minted by
 * `.../reset-password/confirm` proves the OTP step already succeeded, so this
 * is the only place the new password itself travels.
 */
export class ResetPasswordDto {
    @IsEmail()
    email: string;

    @IsString()
    @IsNotEmpty()
    resetTicket: string;

    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters.' })
    newPassword: string;
}
