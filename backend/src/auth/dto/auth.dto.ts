import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Role } from '@prisma/client';

export class SyncUserDto {
    @IsEmail()
    email: string;  // ← email now comes in the body (no JwtAuthGuard needed)

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

export class UpdateProfileDto {
    @IsString()
    @IsOptional()
    firstName?: string;

    @IsString()
    @IsOptional()
    lastName?: string;

    /** The student's contact number (item 14). Blank clears it. */
    @IsString()
    @IsOptional()
    phone?: string;

    @IsInt()
    @Min(6)
    @Max(12)
    @IsOptional()
    classBand?: number;
}
