import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

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
