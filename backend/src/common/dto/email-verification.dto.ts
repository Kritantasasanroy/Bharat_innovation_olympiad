import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
